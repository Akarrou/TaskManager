import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase';
import { from, Observable, throwError, concat, of, delay, timer, defer } from 'rxjs';
import { map, catchError, switchMap, toArray, retryWhen, take, mergeMap } from 'rxjs/operators';
import {
  DatabaseConfig,
  DatabaseConfigExtended,
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
  ColumnType,
  SelectChoice,
  findNameColumn,
} from '../models/database.model';
import { CsvImportResult, CsvImportError } from '../models/csv-import.model';
import { DocumentService, Document } from './document.service';

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
  private documentService = inject(DocumentService);

  private get client() {
    return this.supabase.client;
  }

  // =====================================================================
  // Database Creation & Metadata
  // =====================================================================

  /**
   * Ensure the PostgreSQL table exists for a database
   * Creates the table if it doesn't exist yet (lazy creation)
   */
  ensureTableExists(databaseId: string): Observable<boolean> {
    return from(
      this.client.rpc('ensure_table_exists', {
        p_database_id: databaseId
      })
    ).pipe(
      map(({ data, error }: { data: any; error: any }) => {
        if (error) {
          console.error('[ensureTableExists] Erreur RPC:', error);
          throw error;
        }

        if (!data?.success) {
          console.error('[ensureTableExists] Échec:', data?.error);
          throw new Error(data?.error || 'Échec de la création de table');
        }

        return true;
      }),
      catchError((err: any) => {
        console.error('[ensureTableExists] Erreur:', err);
        return throwError(() => new Error(`Impossible de créer la table: ${err.message}`));
      })
    );
  }

  /**
   * Create a new database metadata AND create PostgreSQL table immediately
   * This ensures the table exists right away for adding rows
   */
  createDatabase(request: CreateDatabaseRequest): Observable<CreateDatabaseResponse> {
    const databaseId = this.generateDatabaseId();
    const tableName = this.generateTableName(databaseId);

    // Step 1: Insert metadata record
    return from(
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
    ).pipe(
      // Step 2: Create PostgreSQL table immediately
      switchMap(() => this.ensureTableExists(databaseId)),
      map(() => {
        return {
          databaseId,
          tableName,
        };
      }),
      catchError(error => {
        console.error('[createDatabase] Échec création database:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Create a standalone database (without a parent document)
   * Used for task databases created from CSV import
   */
  createStandaloneDatabase(config: DatabaseConfig): Observable<{ databaseId: string; tableName: string; name: string }> {
    const databaseId = this.generateDatabaseId();
    const tableName = this.generateTableName(databaseId);

    return from(
      this.client
        .from('document_databases')
        .insert({
          document_id: null, // No parent document
          database_id: databaseId,
          table_name: tableName,
          name: config.name,
          config: config,
        })
        .select()
        .single()
    ).pipe(
      switchMap(() => this.ensureTableExists(databaseId)),
      map(() => ({
        databaseId,
        tableName,
        name: config.name,
      })),
      catchError(error => {
        console.error('[createStandaloneDatabase] Failed to create database:', error);
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
        .maybeSingle()
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        if (!response.data) {
          // Throw error with PGRST116 code for compatibility with existing error handling
          const error: any = new Error(`Database not found: ${databaseId}`);
          error.code = 'PGRST116';
          throw error;
        }
        return response.data as DocumentDatabase;
      })
    );
  }

  /**
   * Get all databases (for connect to existing database feature)
   * Returns all databases ordered by creation date (newest first)
   */
  getAllDatabases(): Observable<DocumentDatabase[]> {
    return from(
      this.client
        .from('document_databases')
        .select('*')
        .order('created_at', { ascending: false })
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return (response.data || []) as DocumentDatabase[];
      }),
      catchError(error => {
        console.error('Failed to get all databases:', error);
        return of([]);
      })
    );
  }

  /**
   * Get the document ID associated with a database
   */
  getDocumentIdByDatabaseId(databaseId: string): Observable<string | null> {
    return from(
      this.client
        .from('document_databases')
        .select('document_id')
        .eq('database_id', databaseId)
        .maybeSingle()
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return response.data?.document_id || null;
      })
    );
  }

  /**
   * Get all databases associated with a document
   */
  getDatabasesByDocumentId(documentId: string): Observable<DocumentDatabase[]> {
    return from(
      this.client
        .from('document_databases')
        .select('*')
        .eq('document_id', documentId)
        .order('created_at', { ascending: true })
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return (response.data || []) as DocumentDatabase[];
      }),
      catchError(error => {
        console.error('Failed to get databases for document:', error);
        return of([]);
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
   * Delete all documents linked to a database (for task-type databases)
   * This removes all documents where database_id matches the given databaseId
   */
  deleteLinkedDocuments(databaseId: string): Observable<boolean> {
    return from(
      this.client
        .from('documents')
        .delete()
        .eq('database_id', databaseId)
    ).pipe(
      map(({ error }: { error: any }) => {
        if (error) {
          console.error('[deleteLinkedDocuments] Erreur:', error);
          throw error;
        }
        return true;
      }),
      catchError((err: any) => {
        console.error('[deleteLinkedDocuments] Erreur lors de la suppression:', err);
        return throwError(() => new Error(`Impossible de supprimer les documents liés: ${err.message}`));
      })
    );
  }

  /**
   * Delete database (drops table and metadata)
   * Also deletes all linked documents (for task-type databases)
   */
  deleteDatabase(databaseId: string): Observable<boolean> {
    // First delete linked documents, then delete the database
    return this.deleteLinkedDocuments(databaseId).pipe(
      switchMap(() =>
        from(
          this.client.rpc('delete_database_cascade', {
            p_database_id: databaseId
          })
        ).pipe(
          map(({ data, error }: { data: any; error: any }) => {
            if (error) {
              console.error('[deleteDatabase] Erreur RPC:', error);
              throw error;
            }

            if (!data?.success) {
              console.error('[deleteDatabase] Échec suppression:', data?.error);
              throw new Error(data?.error || 'Échec de la suppression');
            }

            return true;
          })
        )
      ),
      catchError((err: any) => {
        console.error('[deleteDatabase] Erreur lors de la suppression:', err);
        return throwError(() => new Error(`Impossible de supprimer la base: ${err.message}`));
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
        // Convert column ID to PostgreSQL column name (col_<id> format)
        const sortColumn = params.sortBy
          ? `col_${params.sortBy.replace(/-/g, '_')}`
          : 'row_order';
        let query = this.client
          .from(tableName)
          .select('*')
          .order(sortColumn, {
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
   * Get rows with total count for pagination
   */
  getRowsWithCount(params: QueryRowsParams): Observable<{ rows: DatabaseRow[]; totalCount: number }> {
    return this.getDatabaseMetadata(params.databaseId).pipe(
      switchMap(metadata => {
        const tableName = metadata.table_name;

        // Build query with count
        const sortColumn = params.sortBy
          ? `col_${params.sortBy.replace(/-/g, '_')}`
          : 'row_order';
        let query = this.client
          .from(tableName)
          .select('*', { count: 'exact' })
          .order(sortColumn, {
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
        return {
          rows: this.mapRowsFromDb(response.data || []),
          totalCount: response.count || 0,
        };
      }),
      catchError(error => {
        // Handle table not found (newly created, cache not refreshed yet)
        // Check both error.code and error.message for PostgREST errors
        const isTableNotFound =
          error.code === 'PGRST116' ||
          error.code === 'PGRST204' ||
          error.code === 'PGRST205' ||
          error.code === '42P01' ||
          error.message?.includes('PGRST') ||
          error.message?.includes('relation') && error.message?.includes('does not exist');

        if (isTableNotFound) {
          // Silently return empty result for newly created tables
          return of({ rows: [], totalCount: 0 });
        }
        console.error('Failed to fetch rows with count:', error);
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
        const config = metadata.config as DatabaseConfigExtended;
        const isTaskDatabase = config?.type === 'task';

        // Find Task Number and Status columns
        const taskNumberColumn = metadata.config.columns.find(col => col.name === 'Task Number');
        const statusColumn = metadata.config.columns.find(col => col.name === 'Status');

        // Prepare cells
        const cells = { ...request.cells };

        // Auto-assign task_number if task database AND not already set
        if (isTaskDatabase && taskNumberColumn && !cells[taskNumberColumn.id]) {
          // Call RPC to get next task_number
          return from(this.client.rpc('get_next_task_number')).pipe(
            switchMap(({ data: taskNumber, error }) => {
              if (error) {
                console.error('Failed to get next task number:', error);
                throw error;
              }

              // Assign task_number
              cells[taskNumberColumn.id] = taskNumber;

              // Auto-assign status 'backlog' if not set
              if (statusColumn && !cells[statusColumn.id]) {
                cells[statusColumn.id] = 'backlog';
              }

              // Continue with insertion
              const tableName = metadata.table_name;
              const rowData = this.mapCellsToColumns(cells);
              rowData['row_order'] = request.row_order ?? 0;

              return from(
                this.client.from(tableName).insert(rowData).select().single()
              );
            })
          );
        }

        // Non-task database OR task_number already set - continue normally
        if (isTaskDatabase && statusColumn && !cells[statusColumn.id]) {
          cells[statusColumn.id] = 'backlog';
        }

        const tableName = metadata.table_name;
        const rowData = this.mapCellsToColumns(cells);
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
        const columnName = `col_${request.columnId.replace(/-/g, '_')}`;

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

  /**
   * Add a row and create a linked document (for Notion-style database pages)
   * This creates both the database row and a document that represents that row.
   * The document will have database_id and database_row_id set to link back to the row.
   */
  addRowWithDocument(
    databaseId: string,
    cells: Record<string, CellValue>,
    projectId?: string,
    rowOrder?: number
  ): Observable<{ row: DatabaseRow; document: Document }> {
    // First, add the row to get its ID
    return this.addRow({
      databaseId,
      cells,
      row_order: rowOrder,
    }).pipe(
      switchMap((row: DatabaseRow) => {
        // Extract title from the first visible text column
        return this.getDatabaseMetadata(databaseId).pipe(
          switchMap((metadata: DocumentDatabase) => {
            // Find first visible text/title column
            const titleColumn = metadata.config.columns.find(
              (col: DatabaseColumn) => col.visible && (col.type === 'text' || col.name.toLowerCase().includes('title'))
            );

            const title = titleColumn
              ? (cells[titleColumn.id] as string) || 'Sans titre'
              : 'Sans titre';

            // Create the linked document
            return this.documentService.createDatabaseRowDocument({
              title,
              database_id: databaseId,
              database_row_id: row.id,
              project_id: projectId,
            }).pipe(
              map((document: Document) => ({ row, document }))
            );
          })
        );
      }),
      catchError((error: unknown) => {
        console.error('Failed to add row with document:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Get the document linked to a database row
   * Returns null if no document is linked to this row
   */
  getRowDocument(
    databaseId: string,
    rowId: string
  ): Observable<Document | null> {
    return from(
      this.client
        .from('documents')
        .select('*')
        .eq('database_id', databaseId)
        .eq('database_row_id', rowId)
        .maybeSingle()
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return response.data as Document | null;
      }),
      catchError(error => {
        console.error('Failed to get row document:', error);
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
    // 1. Ensure table exists first (lazy creation)
    return this.ensureTableExists(request.databaseId).pipe(
      switchMap(() => this.getDatabaseMetadata(request.databaseId)),
      switchMap(metadata => {
        const tableName = metadata.table_name;
        // Remplacer les tirets par des underscores pour PostgreSQL
        const columnName = `col_${request.column.id.replace(/-/g, '_')}`;
        const columnType = COLUMN_TYPE_TO_PG_TYPE[request.column.type];

        // Add column to physical table
        return from(
          this.client.rpc('add_column_to_table', {
            table_name: tableName,
            column_name: columnName,
            column_type: columnType,
          })
        ).pipe(
          map((response: any) => {
            if (response.error) {
              console.error('[addColumn] RPC Error:', response.error);
              throw response.error;
            }
            return response.data;
          }),
          switchMap(() => {
            // Notify PostgREST to reload schema cache
            return from(this.client.rpc('reload_schema_cache')).pipe(
              catchError(() => of(null)), // Ignore errors if function doesn't exist
              map(() => null)
            );
          }),
          switchMap(() => {
            // Wait for PostgREST to see the new column (retry mechanism)
            return this.waitForColumnInSchema(tableName, columnName);
          }),
          switchMap(() => {
            // Update config in metadata
            const updatedConfig = { ...metadata.config };
            updatedConfig.columns.push(request.column);

            console.log('[addColumn] Saving column with options:', {
              columnName: request.column.name,
              columnType: request.column.type,
              options: request.column.options,
            });

            return this.updateDatabaseConfig(request.databaseId, updatedConfig);
          })
        );
      }),
      catchError(error => {
        console.error('[addColumn] Failed to add column:', {
          error,
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
          code: error?.code,
        });
        return throwError(() => error);
      })
    );
  }

  /**
   * Wait for PostgREST to see the new column in its schema cache
   * Uses retry mechanism to poll until the column is visible
   */
  private waitForColumnInSchema(tableName: string, columnName: string): Observable<boolean> {
    const maxRetries = 10;
    const retryDelay = 200; // ms between retries

    return defer(() => {
      // Try to select the column - if it fails with PGRST204, column not in cache yet
      return from(
        this.client
          .from(tableName)
          .select(columnName)
          .limit(0) // Don't fetch any rows, just check if column exists
      ).pipe(
        map((response: any) => {
          if (response.error?.code === 'PGRST204') {
            // Column not found in schema cache, throw to trigger retry
            throw new Error('Column not in schema cache yet');
          }
          // Column is visible
          console.log(`[waitForColumnInSchema] Column ${columnName} is now visible in schema cache`);
          return true;
        })
      );
    }).pipe(
      retryWhen(errors =>
        errors.pipe(
          mergeMap((error, index) => {
            if (index >= maxRetries) {
              console.warn(`[waitForColumnInSchema] Max retries reached for column ${columnName}`);
              return of(true); // Give up but don't fail the whole operation
            }
            console.log(`[waitForColumnInSchema] Retry ${index + 1}/${maxRetries} for column ${columnName}`);
            // Reload schema cache before retry
            return from(this.client.rpc('reload_schema_cache')).pipe(
              catchError(() => of(null)),
              switchMap(() => timer(retryDelay))
            );
          })
        )
      ),
      take(1),
      map(() => true)
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
        const columnName = `col_${request.columnId.replace(/-/g, '_')}`;

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
      result[`col_${columnId.replace(/-/g, '_')}`] = value;
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
        // Reconvertir underscores en tirets pour matcher les columnId UUID
        const columnId = key.replace('col_', '').replace(/_/g, '-');
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
    const columnName = `col_${filter.columnId.replace(/-/g, '_')}`;

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

  // =====================================================================
  // CSV Import Methods
  // =====================================================================

  /**
   * Crée plusieurs colonnes séquentiellement à partir d'un CSV
   * Réutilise la méthode addColumn existante pour garantir la cohérence
   */
  createColumnsFromCsv(
    databaseId: string,
    columns: Array<{
      name: string;
      type: ColumnType;
      options?: { choices?: SelectChoice[] };
      isNameColumn?: boolean;
    }>
  ): Observable<DatabaseColumn[]> {
    const createdColumns: DatabaseColumn[] = [];

    // Créer un observable pour chaque colonne avec un délai pour éviter le rate-limiting
    const columnCreations$ = columns.map((col, index) => {
      const column: DatabaseColumn = {
        id: crypto.randomUUID(),
        name: col.name,
        type: col.type,
        options: col.options,
        visible: true,
        order: index,
        isNameColumn: col.isNameColumn,
      };

      createdColumns.push(column);

      return this.addColumn({
        databaseId,
        column,
      }).pipe(
        delay(100), // Anti-throttle Supabase (100ms entre chaque requête)
        map(() => {
          return column;
        }),
        catchError((err: any) => {
          console.error(`[createColumnsFromCsv] Column ${index + 1} failed:`, err);
          throw err; // Re-throw pour propager l'erreur
        })
      );
    });

    // Exécuter séquentiellement et collecter tous les résultats
    return concat(...columnCreations$).pipe(
      toArray(),
      map((cols: DatabaseColumn[]) => {
        return cols;
      }),
      catchError((err: any) => {
        console.error('[createColumnsFromCsv] Column creation failed:', err);
        return throwError(() => new Error(`Impossible de créer la colonne: ${err.message}`));
      })
    );
  }

  /**
   * Importe des lignes CSV en batch via la RPC bulk_insert_rows
   * Continue sur erreur pour permettre import partiel
   */
  importRowsFromCsv(
    databaseId: string,
    rows: Array<Record<string, CellValue>>,
    onProgress?: (current: number, total: number) => void
  ): Observable<CsvImportResult> {
    const BATCH_SIZE = 100;
    const batches = this.chunkArray(rows, BATCH_SIZE);
    const errors: CsvImportError[] = [];
    let imported = 0;

    // Créer un observable pour chaque batch
    const batchImports$ = batches.map((batch, batchIndex) =>
      from(
        this.client.rpc('bulk_insert_rows', {
          p_database_id: databaseId,
          p_rows: batch.map(row => JSON.stringify({ cells: row })),
        })
      ).pipe(
        map(({ data, error }: { data: any; error: any }) => {
          if (error) {
            console.error('[CSV Import] RPC Error:', error);
            throw error;
          }

          // Incrémenter compteur et notifier progression
          const batchImported = data?.inserted_count || batch.length;
          imported += batchImported;
          onProgress?.(imported, rows.length);

          // Collecter erreurs du batch
          if (data?.errors && Array.isArray(data.errors)) {
            data.errors.forEach((err: any) => {
              errors.push({
                row: batchIndex * BATCH_SIZE + (err.row || 0),
                message: err.message || 'Erreur inconnue',
              });
            });
          }

          return data;
        }),
        catchError((err: any) => {
          // En cas d'erreur totale du batch, marquer toutes les lignes comme échouées
          batch.forEach((_, i) => {
            errors.push({
              row: batchIndex * BATCH_SIZE + i + 1,
              message: err.message || 'Erreur lors de l\'insertion',
            });
          });
          return of(null); // Continuer malgré l'erreur
        })
      )
    );

    // Exécuter tous les batches séquentiellement
    return concat(...batchImports$).pipe(
      toArray(),
      map(() => ({
        columnsCreated: 0, // Sera défini par l'appelant
        rowsImported: imported,
        errors,
      }))
    );
  }

  /**
   * Vérifie si une base de données est vierge (sans lignes)
   * Utilisé pour autoriser/bloquer l'import CSV
   */
  isDatabaseEmpty(databaseId: string): Observable<boolean> {
    return this.getRows({ databaseId, limit: 1 }).pipe(
      map((rows: DatabaseRow[]) => rows.length === 0),
      catchError(() => of(true)) // En cas d'erreur, considérer comme vide
    );
  }

  /**
   * Import task rows with associated documents
   * For Task Databases, each row needs a linked document
   */
  importTaskRowsWithDocuments(
    databaseId: string,
    rows: Array<Record<string, CellValue>>,
    projectId: string | undefined,
    onProgress?: (current: number, total: number) => void
  ): Observable<CsvImportResult> {
    console.log('[importTaskRowsWithDocuments] Starting import', { databaseId, rowCount: rows.length, projectId });
    const errors: CsvImportError[] = [];
    let imported = 0;

    // Ensure the PostgreSQL table exists before importing
    return this.ensureTableExists(databaseId).pipe(
      switchMap(() => this.getDatabaseMetadata(databaseId)),
      switchMap((metadata: DocumentDatabase) => {
        console.log('[importTaskRowsWithDocuments] Got metadata', { columns: metadata.config.columns.map(c => c.name) });

        // Extract all column IDs used in the rows data and convert to PostgreSQL column names
        const usedColumnNames = new Set<string>();
        rows.forEach(row => {
          Object.keys(row).forEach(key => {
            // Column IDs in cells are UUIDs, PostgreSQL column names are col_<uuid_with_underscores>
            usedColumnNames.add(`col_${key.replace(/-/g, '_')}`);
          });
        });

        // Get table name for schema cache waiting
        const tableName = metadata.table_name;

        // Wait for all dynamic columns to be visible in schema cache
        const columnWaits$: Observable<boolean>[] = Array.from(usedColumnNames).map(columnName => {
          console.log(`[importTaskRowsWithDocuments] Waiting for column ${columnName} in schema cache`);
          return this.waitForColumnInSchema(tableName, columnName);
        });

        // If no dynamic columns, proceed immediately
        const waitForColumns$ = columnWaits$.length > 0
          ? concat(...columnWaits$).pipe(toArray(), map(() => true))
          : of(true);

        return waitForColumns$.pipe(
          switchMap(() => {
            console.log('[importTaskRowsWithDocuments] All columns visible in schema cache, starting import');

            // Find title column
            const titleColumn = metadata.config.columns.find(
              (col: DatabaseColumn) => col.name === 'Title' || col.name.toLowerCase().includes('title')
            );
            console.log('[importTaskRowsWithDocuments] Title column:', titleColumn?.id);

            // Create observables for each row (with document)
            const rowImports$ = rows.map((cells, rowIndex) => {
              const title = titleColumn
                ? (cells[titleColumn.id] as string) || `Tâche ${rowIndex + 1}`
                : `Tâche ${rowIndex + 1}`;

              return this.addRow({
                databaseId,
                cells,
                row_order: rowIndex,
              }).pipe(
                switchMap((row: DatabaseRow) => {
                  console.log(`[importTaskRowsWithDocuments] Row ${rowIndex + 1} created:`, row.id, 'creating document...');
                  // Create linked document for this task
                  return this.documentService.createDatabaseRowDocument({
                    title,
                    database_id: databaseId,
                    database_row_id: row.id,
                    project_id: projectId,
                  }).pipe(
                    map(() => {
                      imported++;
                      onProgress?.(imported, rows.length);
                      return { success: true, rowIndex };
                    })
                  );
                }),
                catchError((err: unknown) => {
                  const error = err as Error;
                  errors.push({
                    row: rowIndex + 1,
                    message: error.message || 'Erreur lors de l\'insertion',
                  });
                  onProgress?.(imported, rows.length);
                  return of({ success: false, rowIndex });
                })
              );
            });

            // Execute all row imports (concurrently but with limit)
            // Using concat for sequential to avoid overwhelming the server
            return concat(...rowImports$).pipe(
              toArray(),
              map(() => {
                console.log('[importTaskRowsWithDocuments] Import complete!', { imported, errorCount: errors.length });
                return {
                  columnsCreated: 0,
                  rowsImported: imported,
                  errors,
                };
              })
            );
          })
        );
      }),
      catchError((err: unknown) => {
        const error = err as Error;
        console.error('[importTaskRowsWithDocuments] Failed:', error);
        return of({
          columnsCreated: 0,
          rowsImported: 0,
          errors: [{ row: 0, message: error.message || 'Erreur lors de l\'import' }],
        });
      })
    );
  }

  /**
   * Import rows with associated documents (for all database types)
   * Each row gets a linked document with the Name column as title
   */
  importRowsWithDocuments(
    databaseId: string,
    rows: Array<Record<string, CellValue>>,
    projectId?: string,
    onProgress?: (current: number, total: number) => void
  ): Observable<CsvImportResult> {

    const errors: CsvImportError[] = [];
    let imported = 0;

    // Ensure the PostgreSQL table exists before importing
    return this.ensureTableExists(databaseId).pipe(
      switchMap(() => this.getDatabaseMetadata(databaseId)),
      switchMap((metadata: DocumentDatabase) => {


        // Extract all column IDs used in the rows data and convert to PostgreSQL column names
        const usedColumnNames = new Set<string>();
        rows.forEach(row => {
          Object.keys(row).forEach(key => {
            usedColumnNames.add(`col_${key.replace(/-/g, '_')}`);
          });
        });

        // Get table name for schema cache waiting
        const tableName = metadata.table_name;

        // Wait for all dynamic columns to be visible in schema cache
        const columnWaits$: Observable<boolean>[] = Array.from(usedColumnNames).map(columnName => {

          return this.waitForColumnInSchema(tableName, columnName);
        });

        // If no dynamic columns, proceed immediately
        const waitForColumns$ = columnWaits$.length > 0
          ? concat(...columnWaits$).pipe(toArray(), map(() => true))
          : of(true);

        return waitForColumns$.pipe(
          switchMap(() => {

            // Find name column using the helper
            const nameColumn = findNameColumn(metadata.config.columns);

            // Create observables for each row (with document)
            const rowImports$ = rows.map((cells, rowIndex) => {
              const title = nameColumn
                ? (cells[nameColumn.id] as string) || `Sans titre ${rowIndex + 1}`
                : `Sans titre ${rowIndex + 1}`;

              return this.addRow({
                databaseId,
                cells,
                row_order: rowIndex,
              }).pipe(
                switchMap((row: DatabaseRow) => {
                  // Create linked document for this row
                  return this.documentService.createDatabaseRowDocument({
                    title,
                    database_id: databaseId,
                    database_row_id: row.id,
                    project_id: projectId,
                  }).pipe(
                    map(() => {
                      imported++;
                      onProgress?.(imported, rows.length);
                      return { success: true, rowIndex };
                    })
                  );
                }),
                catchError((err: unknown) => {
                  const error = err as Error;
                  errors.push({
                    row: rowIndex + 1,
                    message: error.message || 'Erreur lors de l\'insertion',
                  });
                  onProgress?.(imported, rows.length);
                  return of({ success: false, rowIndex });
                })
              );
            });

            // Execute all row imports sequentially to avoid overwhelming the server
            return concat(...rowImports$).pipe(
              toArray(),
              map(() => {
                return {
                  columnsCreated: 0,
                  rowsImported: imported,
                  errors,
                };
              })
            );
          })
        );
      }),
      catchError((err: unknown) => {
        const error = err as Error;
        return of({
          columnsCreated: 0,
          rowsImported: 0,
          errors: [{ row: 0, message: error.message || 'Erreur lors de l\'import' }],
        });
      })
    );
  }

  /**
   * Sync document title to database row (for bidirectional sync)
   * Called when a document title is updated to update the Name column in the database row
   */
  syncDocumentTitleToRow(
    databaseId: string,
    rowId: string,
    newTitle: string
  ): Observable<boolean> {
    return this.getDatabaseMetadata(databaseId).pipe(
      switchMap(metadata => {
        const nameColumn = findNameColumn(metadata.config.columns);
        if (!nameColumn) {
          return of(false);
        }

        return this.updateCell({
          databaseId,
          rowId,
          columnId: nameColumn.id,
          value: newTitle,
        });
      }),
      catchError(error => {
        return of(false);
      })
    );
  }

  /**
   * Divise un array en batches de taille fixe
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
