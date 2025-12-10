import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase';
import { from, Observable, throwError } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import {
  DatabaseConfig,
  DatabaseColumn,
  DatabaseRow,
  CellValue,
  DocumentDatabase,
  CreateDatabaseRequest,
  CreateDatabaseResponse,
  AddRowRequest,
  UpdateCellRequest,
  DeleteRowsRequest,
  AddColumnRequest,
  UpdateColumnRequest,
  DeleteColumnRequest,
  QueryRowsParams,
  COLUMN_TYPE_TO_PG_TYPE,
  Filter,
  SortOrder,
} from '../models/database.model';

/**
 * DatabaseService
 *
 * Service responsible for all database CRUD operations using Supabase.
 * Manages dynamic PostgreSQL table creation and manipulation via RPC functions.
 */
@Injectable({
  providedIn: 'root',
})
export class DatabaseService {
  private supabase = inject(SupabaseService);

  private get client() {
    return this.supabase.client;
  }

  // =====================================================================
  // Database Creation & Metadata
  // =====================================================================

  /**
   * Create a new database with dynamic PostgreSQL table
   */
  createDatabase(request: CreateDatabaseRequest): Observable<CreateDatabaseResponse> {
    const databaseId = this.generateDatabaseId();
    const tableName = this.generateTableName(databaseId);

    // Prepare columns for RPC function
    const columns = request.config.columns.map(col => ({
      name: `col_${col.id}`,
      type: COLUMN_TYPE_TO_PG_TYPE[col.type],
    }));

    return from(
      this.client.rpc('create_dynamic_table', {
        table_name: tableName,
        columns,
      })
    ).pipe(
      switchMap(() =>
        // Insert metadata record
        from(
          this.client
            .from('document_databases')
            .insert({
              document_id: request.documentId,
              database_id: databaseId,
              table_name: tableName,
              name: request.config.name,
              config: request.config,
            })
            .select()
            .single()
        )
      ),
      switchMap(() =>
        // Create update trigger for the table
        from(
          this.client.rpc('create_update_trigger', {
            table_name: tableName,
          })
        )
      ),
      map(() => ({
        databaseId,
        tableName,
      })),
      catchError(error => {
        console.error('Failed to create database:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Get database metadata
   */
  getDatabaseMetadata(databaseId: string): Observable<DocumentDatabase> {
    return from(
      this.client
        .from('document_databases')
        .select('*')
        .eq('database_id', databaseId)
        .single()
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return response.data as DocumentDatabase;
      })
    );
  }

  /**
   * Update database configuration (name, columns metadata, views)
   */
  updateDatabaseConfig(databaseId: string, config: DatabaseConfig): Observable<boolean> {
    return from(
      this.client
        .from('document_databases')
        .update({
          name: config.name,
          config,
          updated_at: new Date().toISOString(),
        })
        .eq('database_id', databaseId)
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return true;
      }),
      catchError(error => {
        console.error('Failed to update database config:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Delete database (drops table and metadata)
   */
  deleteDatabase(databaseId: string): Observable<boolean> {
    return this.getDatabaseMetadata(databaseId).pipe(
      switchMap(metadata =>
        from(
          this.client.rpc('delete_dynamic_table', {
            table_name: metadata.table_name,
          })
        )
      ),
      switchMap(() =>
        from(
          this.client
            .from('document_databases')
            .delete()
            .eq('database_id', databaseId)
        )
      ),
      map(() => true),
      catchError(error => {
        console.error('Failed to delete database:', error);
        return throwError(() => error);
      })
    );
  }

  // =====================================================================
  // Row Operations
  // =====================================================================

  /**
   * Get rows with optional filtering, sorting, and pagination
   */
  getRows(params: QueryRowsParams): Observable<DatabaseRow[]> {
    return this.getDatabaseMetadata(params.databaseId).pipe(
      switchMap(metadata => {
        const tableName = metadata.table_name;

        // Build query
        let query = this.client
          .from(tableName)
          .select('*')
          .order(params.sortBy || 'row_order', {
            ascending: params.sortOrder !== 'desc',
          });

        // Apply filters
        if (params.filters && params.filters.length > 0) {
          params.filters.forEach(filter => {
            query = this.applyFilter(query, filter);
          });
        }

        // Apply pagination
        const limit = params.limit || 100;
        const offset = params.offset || 0;
        query = query.range(offset, offset + limit - 1);

        return from(query);
      }),
      map(response => {
        if (response.error) throw response.error;
        return this.mapRowsFromDb(response.data || []);
      }),
      catchError(error => {
        console.error('Failed to fetch rows:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Add a new row
   */
  addRow(request: AddRowRequest): Observable<DatabaseRow> {
    return this.getDatabaseMetadata(request.databaseId).pipe(
      switchMap(metadata => {
        const tableName = metadata.table_name;

        // Map cells to column names
        const rowData = this.mapCellsToColumns(request.cells);
        rowData['row_order'] = request.row_order ?? 0;

        return from(
          this.client.from(tableName).insert(rowData).select().single()
        );
      }),
      map(response => {
        if (response.error) throw response.error;
        return this.mapRowFromDb(response.data);
      }),
      catchError(error => {
        console.error('Failed to add row:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Update a cell value
   */
  updateCell(request: UpdateCellRequest): Observable<boolean> {
    return this.getDatabaseMetadata(request.databaseId).pipe(
      switchMap(metadata => {
        const tableName = metadata.table_name;
        const columnName = `col_${request.columnId}`;

        return from(
          this.client
            .from(tableName)
            .update({
              [columnName]: request.value,
              updated_at: new Date().toISOString(),
            })
            .eq('id', request.rowId)
        );
      }),
      map(response => {
        if (response.error) throw response.error;
        return true;
      }),
      catchError(error => {
        console.error('Failed to update cell:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Update entire row
   */
  updateRow(
    databaseId: string,
    rowId: string,
    cells: Record<string, CellValue>
  ): Observable<boolean> {
    return this.getDatabaseMetadata(databaseId).pipe(
      switchMap(metadata => {
        const tableName = metadata.table_name;
        const rowData = this.mapCellsToColumns(cells);
        rowData['updated_at'] = new Date().toISOString();

        return from(
          this.client.from(tableName).update(rowData).eq('id', rowId)
        );
      }),
      map(response => {
        if (response.error) throw response.error;
        return true;
      }),
      catchError(error => {
        console.error('Failed to update row:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Delete rows
   */
  deleteRows(request: DeleteRowsRequest): Observable<boolean> {
    return this.getDatabaseMetadata(request.databaseId).pipe(
      switchMap(metadata => {
        const tableName = metadata.table_name;

        return from(
          this.client.from(tableName).delete().in('id', request.rowIds)
        );
      }),
      map(response => {
        if (response.error) throw response.error;
        return true;
      }),
      catchError(error => {
        console.error('Failed to delete rows:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Update row order (for drag & drop)
   */
  updateRowOrder(
    databaseId: string,
    rowId: string,
    newOrder: number
  ): Observable<boolean> {
    return this.getDatabaseMetadata(databaseId).pipe(
      switchMap(metadata => {
        const tableName = metadata.table_name;

        return from(
          this.client
            .from(tableName)
            .update({
              row_order: newOrder,
              updated_at: new Date().toISOString(),
            })
            .eq('id', rowId)
        );
      }),
      map(response => {
        if (response.error) throw response.error;
        return true;
      }),
      catchError(error => {
        console.error('Failed to update row order:', error);
        return throwError(() => error);
      })
    );
  }

  // =====================================================================
  // Column Operations
  // =====================================================================

  /**
   * Add a new column
   */
  addColumn(request: AddColumnRequest): Observable<boolean> {
    return this.getDatabaseMetadata(request.databaseId).pipe(
      switchMap(metadata => {
        const tableName = metadata.table_name;
        const columnName = `col_${request.column.id}`;
        const columnType = COLUMN_TYPE_TO_PG_TYPE[request.column.type];

        // Add column to physical table
        return from(
          this.client.rpc('add_column_to_table', {
            table_name: tableName,
            column_name: columnName,
            column_type: columnType,
          })
        ).pipe(
          switchMap(() => {
            // Update config in metadata
            const updatedConfig = { ...metadata.config };
            updatedConfig.columns.push(request.column);

            return this.updateDatabaseConfig(request.databaseId, updatedConfig);
          })
        );
      }),
      catchError(error => {
        console.error('Failed to add column:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Update column configuration (metadata only, not schema)
   */
  updateColumn(request: UpdateColumnRequest): Observable<boolean> {
    return this.getDatabaseMetadata(request.databaseId).pipe(
      switchMap(metadata => {
        const updatedConfig = { ...metadata.config };
        const columnIndex = updatedConfig.columns.findIndex(
          col => col.id === request.columnId
        );

        if (columnIndex === -1) {
          throw new Error(`Column ${request.columnId} not found`);
        }

        // Update column
        updatedConfig.columns[columnIndex] = {
          ...updatedConfig.columns[columnIndex],
          ...request.updates,
        };

        return this.updateDatabaseConfig(request.databaseId, updatedConfig);
      }),
      catchError(error => {
        console.error('Failed to update column:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Delete a column
   */
  deleteColumn(request: DeleteColumnRequest): Observable<boolean> {
    return this.getDatabaseMetadata(request.databaseId).pipe(
      switchMap(metadata => {
        const tableName = metadata.table_name;
        const columnName = `col_${request.columnId}`;

        // Delete column from physical table
        return from(
          this.client.rpc('delete_column_from_table', {
            table_name: tableName,
            column_name: columnName,
          })
        ).pipe(
          switchMap(() => {
            // Update config in metadata
            const updatedConfig = { ...metadata.config };
            updatedConfig.columns = updatedConfig.columns.filter(
              col => col.id !== request.columnId
            );

            return this.updateDatabaseConfig(request.databaseId, updatedConfig);
          })
        );
      }),
      catchError(error => {
        console.error('Failed to delete column:', error);
        return throwError(() => error);
      })
    );
  }

  // =====================================================================
  // Helper Methods
  // =====================================================================

  /**
   * Generate unique database ID
   */
  private generateDatabaseId(): string {
    return 'db-' + crypto.randomUUID();
  }

  /**
   * Generate table name from database ID
   */
  private generateTableName(databaseId: string): string {
    // Remove 'db-' prefix and replace hyphens with underscores
    return 'database_' + databaseId.replace('db-', '').replace(/-/g, '_');
  }

  /**
   * Map cells object to column names for database insert/update
   */
  private mapCellsToColumns(cells: Record<string, CellValue>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    Object.entries(cells).forEach(([columnId, value]) => {
      result[`col_${columnId}`] = value;
    });

    return result;
  }

  /**
   * Map database row to DatabaseRow format
   */
  private mapRowFromDb(dbRow: Record<string, unknown>): DatabaseRow {
    const cells: Record<string, CellValue> = {};

    // Extract cell values (columns starting with 'col_')
    Object.entries(dbRow).forEach(([key, value]) => {
      if (key.startsWith('col_')) {
        const columnId = key.replace('col_', '');
        cells[columnId] = value as CellValue;
      }
    });

    return {
      id: dbRow['id'] as string,
      cells,
      row_order: dbRow['row_order'] as number,
      created_at: dbRow['created_at'] as string,
      updated_at: dbRow['updated_at'] as string,
    };
  }

  /**
   * Map multiple database rows
   */
  private mapRowsFromDb(dbRows: Record<string, unknown>[]): DatabaseRow[] {
    return dbRows.map(row => this.mapRowFromDb(row));
  }

  /**
   * Apply a filter to a Supabase query
   */
  private applyFilter(query: any, filter: Filter): any {
    const columnName = `col_${filter.columnId}`;

    switch (filter.operator) {
      case 'equals':
        return query.eq(columnName, filter.value);
      case 'not_equals':
        return query.neq(columnName, filter.value);
      case 'contains':
        return query.ilike(columnName, `%${filter.value}%`);
      case 'not_contains':
        return query.not(columnName, 'ilike', `%${filter.value}%`);
      case 'is_empty':
        return query.is(columnName, null);
      case 'is_not_empty':
        return query.not(columnName, 'is', null);
      case 'greater_than':
        return query.gt(columnName, filter.value);
      case 'less_than':
        return query.lt(columnName, filter.value);
      case 'greater_than_or_equal':
        return query.gte(columnName, filter.value);
      case 'less_than_or_equal':
        return query.lte(columnName, filter.value);
      case 'starts_with':
        return query.ilike(columnName, `${filter.value}%`);
      case 'ends_with':
        return query.ilike(columnName, `%${filter.value}`);
      default:
        return query;
    }
  }
}
