import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase';
import { from, Observable, throwError, of } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import {
  SpreadsheetConfig,
  SpreadsheetCell,
  SpreadsheetCellUpdate,
  DocumentSpreadsheet,
  CreateSpreadsheetRequest,
  CreateSpreadsheetResponse,
  CellRange,
  SpreadsheetSheet,
  createDefaultSpreadsheetConfig,
  getCellKey,
  SpreadsheetCellValue,
} from '../models/spreadsheet.model';

/**
 * SpreadsheetService
 *
 * Service responsible for all spreadsheet CRUD operations using Supabase.
 * Manages dynamic PostgreSQL table creation for cell storage via RPC functions.
 */
@Injectable({
  providedIn: 'root',
})
export class SpreadsheetService {
  private supabase = inject(SupabaseService);

  private get client() {
    return this.supabase.client;
  }

  // =====================================================================
  // Spreadsheet Creation & Metadata
  // =====================================================================

  /**
   * Create a new spreadsheet with its dynamic cells table
   */
  createSpreadsheet(request: CreateSpreadsheetRequest): Observable<CreateSpreadsheetResponse> {
    const spreadsheetId = this.generateSpreadsheetId();
    const config = request.config
      ? { ...createDefaultSpreadsheetConfig(), ...request.config }
      : createDefaultSpreadsheetConfig();

    return from(
      this.client.rpc('create_spreadsheet_table', {
        p_spreadsheet_id: spreadsheetId,
        p_document_id: request.documentId,
        p_config: config,
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[createSpreadsheet] RPC Error:', error);
          throw error;
        }

        if (!data?.success) {
          console.error('[createSpreadsheet] Failed:', data?.error);
          throw new Error(data?.error || 'Failed to create spreadsheet');
        }

        return {
          spreadsheetId: data.spreadsheet_id,
          tableName: data.table_name,
        };
      }),
      catchError(error => {
        console.error('[createSpreadsheet] Error:', error);
        return throwError(() => new Error(`Failed to create spreadsheet: ${error.message}`));
      })
    );
  }

  /**
   * Get spreadsheet metadata
   */
  getSpreadsheetMetadata(spreadsheetId: string): Observable<DocumentSpreadsheet> {
    return from(
      this.client
        .from('document_spreadsheets')
        .select('*')
        .eq('spreadsheet_id', spreadsheetId)
        .is('deleted_at', null)
        .maybeSingle()
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        if (!response.data) {
          const error: Error & { code?: string } = new Error(`Spreadsheet not found: ${spreadsheetId}`);
          error.code = 'PGRST116';
          throw error;
        }
        return response.data as DocumentSpreadsheet;
      })
    );
  }

  /**
   * Update spreadsheet configuration (sheets, settings, named ranges)
   */
  updateSpreadsheetConfig(spreadsheetId: string, config: SpreadsheetConfig): Observable<boolean> {
    return from(
      this.client
        .from('document_spreadsheets')
        .update({
          config,
          updated_at: new Date().toISOString(),
        })
        .eq('spreadsheet_id', spreadsheetId)
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return true;
      }),
      catchError(error => {
        console.error('[updateSpreadsheetConfig] Error:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Delete spreadsheet (drops cells table and metadata)
   */
  deleteSpreadsheet(spreadsheetId: string): Observable<boolean> {
    return from(
      this.client.rpc('delete_spreadsheet_cascade', {
        p_spreadsheet_id: spreadsheetId,
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[deleteSpreadsheet] RPC Error:', error);
          throw error;
        }

        if (!data?.success) {
          console.error('[deleteSpreadsheet] Failed:', data?.error);
          throw new Error(data?.error || 'Failed to delete spreadsheet');
        }

        return true;
      }),
      catchError(error => {
        console.error('[deleteSpreadsheet] Error:', error);
        return throwError(() => new Error(`Failed to delete spreadsheet: ${error.message}`));
      })
    );
  }

  /**
   * Soft delete a spreadsheet: sets deleted_at on document_spreadsheets.
   * Returns the metadata (with UUID id) for trash registration.
   */
  softDeleteSpreadsheet(spreadsheetId: string): Observable<DocumentSpreadsheet> {
    const now = new Date().toISOString();
    return from(
      this.client
        .from('document_spreadsheets')
        .update({ deleted_at: now })
        .eq('spreadsheet_id', spreadsheetId)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[softDeleteSpreadsheet] Error:', error);
          throw error;
        }
        return data as DocumentSpreadsheet;
      }),
      catchError(error => {
        console.error('[softDeleteSpreadsheet] Error:', error);
        return throwError(() => new Error(`Failed to soft delete spreadsheet: ${error.message}`));
      })
    );
  }

  /**
   * Restore a soft-deleted spreadsheet: clears deleted_at + removes trash_items entry.
   */
  restoreSpreadsheet(uuid: string): Observable<boolean> {
    return from(
      this.client
        .from('document_spreadsheets')
        .update({ deleted_at: null })
        .eq('id', uuid)
    ).pipe(
      switchMap(({ error }) => {
        if (error) throw error;
        return from(
          this.client
            .from('trash_items')
            .delete()
            .eq('item_id', uuid)
        );
      }),
      map(({ error }) => {
        if (error) throw error;
        return true;
      }),
      catchError(error => {
        console.error('[restoreSpreadsheet] Error:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Restore a spreadsheet node into its parent document's TipTap content.
   */
  restoreSpreadsheetToDocument(uuid: string, documentId: string): Observable<boolean> {
    return from(
      this.client
        .from('document_spreadsheets')
        .select('*')
        .eq('id', uuid)
        .single()
    ).pipe(
      switchMap(({ data: ssMeta, error: metaError }) => {
        if (metaError || !ssMeta) {
          return throwError(() => metaError || new Error('Spreadsheet not found'));
        }

        return from(
          this.client
            .from('documents')
            .select('content')
            .eq('id', documentId)
            .single()
        ).pipe(
          switchMap(({ data: doc, error: docError }) => {
            if (docError || !doc) {
              return throwError(() => docError || new Error('Document not found'));
            }

            const spreadsheetNode = {
              type: 'spreadsheet',
              attrs: {
                spreadsheetId: ssMeta.spreadsheet_id,
                config: ssMeta.config,
                storageMode: 'supabase',
              },
            };

            const content = doc.content || { type: 'doc', content: [] };
            if (!content.content) content.content = [];
            content.content.push(spreadsheetNode);

            return from(
              this.client
                .from('documents')
                .update({ content, updated_at: new Date().toISOString() })
                .eq('id', documentId)
            );
          }),
        );
      }),
      map(({ error }: { error: unknown }) => {
        if (error) throw error;
        return true;
      }),
      catchError(error => {
        console.error('[restoreSpreadsheetToDocument] Error:', error);
        return throwError(() => error);
      }),
    );
  }

  // =====================================================================
  // Cell Operations
  // =====================================================================

  /**
   * Load cells for a sheet (with optional range filter for virtual scrolling)
   */
  loadCells(
    spreadsheetId: string,
    sheetId: string,
    range?: CellRange
  ): Observable<Map<string, SpreadsheetCell>> {
    return from(
      this.client.rpc('get_spreadsheet_cells', {
        p_spreadsheet_id: spreadsheetId,
        p_sheet_id: sheetId,
        p_row_start: range?.start.row ?? null,
        p_row_end: range?.end.row ?? null,
        p_col_start: range?.start.col ?? null,
        p_col_end: range?.end.col ?? null,
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[loadCells] RPC Error:', error);
          throw error;
        }

        if (!data?.success) {
          // Return empty map for new spreadsheets
          if (data?.error?.includes('not found')) {
            return new Map<string, SpreadsheetCell>();
          }
          throw new Error(data?.error || 'Failed to load cells');
        }

        // Convert array to Map for efficient lookup
        const cellMap = new Map<string, SpreadsheetCell>();
        const cells = data.cells || [];

        cells.forEach((cell: Record<string, unknown>) => {
          const mappedCell = this.mapCellFromDb(cell);
          const key = getCellKey({ row: mappedCell.row, col: mappedCell.col, sheet: mappedCell.sheet_id });
          cellMap.set(key, mappedCell);
        });

        return cellMap;
      }),
      catchError(error => {
        // Handle table not found (newly created spreadsheet)
        if (error.code === 'PGRST116' || error.message?.includes('not found')) {
          return of(new Map<string, SpreadsheetCell>());
        }
        console.error('[loadCells] Error:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Update a single cell
   */
  updateCell(
    spreadsheetId: string,
    sheetId: string,
    row: number,
    col: number,
    update: SpreadsheetCellUpdate
  ): Observable<boolean> {
    const cellData = {
      sheet_id: sheetId,
      row_idx: row,
      col_idx: col,
      raw_value: update.raw_value ?? null,
      formula: update.formula ?? null,
      computed_value: null, // Will be calculated by formula engine
      format: update.format ?? null,
      validation: update.validation ?? null,
      merge: update.merge ?? null,
      note: update.note ?? null,
    };

    return from(
      this.client.rpc('batch_update_spreadsheet_cells', {
        p_spreadsheet_id: spreadsheetId,
        p_cells: [cellData],
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Failed to update cell');
        return true;
      }),
      catchError(error => {
        console.error('[updateCell] Error:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Batch update multiple cells (for efficient saves)
   */
  batchUpdateCells(
    spreadsheetId: string,
    cells: {
      sheetId: string;
      row: number;
      col: number;
      update: SpreadsheetCellUpdate;
    }[]
  ): Observable<boolean> {
    const cellsData = cells.map(cell => ({
      sheet_id: cell.sheetId,
      row_idx: cell.row,
      col_idx: cell.col,
      raw_value: cell.update.raw_value ?? null,
      formula: cell.update.formula ?? null,
      computed_value: null,
      format: cell.update.format ?? null,
      validation: cell.update.validation ?? null,
      merge: cell.update.merge ?? null,
      note: cell.update.note ?? null,
    }));

    return from(
      this.client.rpc('batch_update_spreadsheet_cells', {
        p_spreadsheet_id: spreadsheetId,
        p_cells: cellsData,
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Failed to batch update cells');
        return true;
      }),
      catchError(error => {
        console.error('[batchUpdateCells] Error:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Clear a range of cells
   */
  clearRange(
    spreadsheetId: string,
    sheetId: string,
    range: CellRange
  ): Observable<number> {
    return from(
      this.client.rpc('clear_spreadsheet_range', {
        p_spreadsheet_id: spreadsheetId,
        p_sheet_id: sheetId,
        p_row_start: range.start.row,
        p_row_end: range.end.row,
        p_col_start: range.start.col,
        p_col_end: range.end.col,
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Failed to clear range');
        return data.deleted || 0;
      }),
      catchError(error => {
        console.error('[clearRange] Error:', error);
        return throwError(() => error);
      })
    );
  }

  // =====================================================================
  // Sheet Operations
  // =====================================================================

  /**
   * Add a new sheet to the spreadsheet
   */
  addSheet(spreadsheetId: string, sheetName?: string): Observable<SpreadsheetSheet> {
    return this.getSpreadsheetMetadata(spreadsheetId).pipe(
      switchMap(metadata => {
        const config = metadata.config as SpreadsheetConfig;
        const existingSheets = config.sheets || [];

        // Generate new sheet
        const newSheet: SpreadsheetSheet = {
          id: crypto.randomUUID(),
          name: sheetName || `Feuille ${existingSheets.length + 1}`,
          order: existingSheets.length,
          columnWidths: {},
          rowHeights: {},
          defaultColWidth: 100,
          defaultRowHeight: 24,
        };

        // Update config
        const updatedConfig: SpreadsheetConfig = {
          ...config,
          sheets: [...existingSheets, newSheet],
        };

        return this.updateSpreadsheetConfig(spreadsheetId, updatedConfig).pipe(
          map(() => newSheet)
        );
      }),
      catchError(error => {
        console.error('[addSheet] Error:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Rename a sheet
   */
  renameSheet(spreadsheetId: string, sheetId: string, newName: string): Observable<boolean> {
    return this.getSpreadsheetMetadata(spreadsheetId).pipe(
      switchMap(metadata => {
        const config = metadata.config as SpreadsheetConfig;
        const updatedSheets = config.sheets.map(sheet =>
          sheet.id === sheetId ? { ...sheet, name: newName } : sheet
        );

        return this.updateSpreadsheetConfig(spreadsheetId, {
          ...config,
          sheets: updatedSheets,
        });
      }),
      catchError(error => {
        console.error('[renameSheet] Error:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Delete a sheet (and its cells)
   */
  deleteSheet(spreadsheetId: string, sheetId: string): Observable<boolean> {
    return this.getSpreadsheetMetadata(spreadsheetId).pipe(
      switchMap(metadata => {
        const config = metadata.config as SpreadsheetConfig;

        // Don't allow deleting the last sheet
        if (config.sheets.length <= 1) {
          return throwError(() => new Error('Cannot delete the last sheet'));
        }

        // Remove sheet from config
        const updatedSheets = config.sheets
          .filter(sheet => sheet.id !== sheetId)
          .map((sheet, index) => ({ ...sheet, order: index }));

        // Update active sheet if needed
        const newActiveSheetId = config.activeSheetId === sheetId
          ? updatedSheets[0].id
          : config.activeSheetId;

        const updatedConfig: SpreadsheetConfig = {
          ...config,
          sheets: updatedSheets,
          activeSheetId: newActiveSheetId,
        };

        // Clear all cells in the deleted sheet
        return this.clearRange(spreadsheetId, sheetId, {
          start: { row: 0, col: 0 },
          end: { row: 1048576, col: 16384 }, // Max Excel dimensions
        }).pipe(
          switchMap(() => this.updateSpreadsheetConfig(spreadsheetId, updatedConfig))
        );
      }),
      catchError(error => {
        console.error('[deleteSheet] Error:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Update sheet configuration (column widths, row heights, frozen rows/cols)
   */
  updateSheetConfig(
    spreadsheetId: string,
    sheetId: string,
    updates: Partial<SpreadsheetSheet>
  ): Observable<boolean> {
    return this.getSpreadsheetMetadata(spreadsheetId).pipe(
      switchMap(metadata => {
        const config = metadata.config as SpreadsheetConfig;
        const updatedSheets = config.sheets.map(sheet =>
          sheet.id === sheetId ? { ...sheet, ...updates } : sheet
        );

        return this.updateSpreadsheetConfig(spreadsheetId, {
          ...config,
          sheets: updatedSheets,
        });
      }),
      catchError(error => {
        console.error('[updateSheetConfig] Error:', error);
        return throwError(() => error);
      })
    );
  }

  // =====================================================================
  // Helper Methods
  // =====================================================================

  /**
   * Generate unique spreadsheet ID
   */
  private generateSpreadsheetId(): string {
    return 'ss-' + crypto.randomUUID();
  }

  /**
   * Map cell data from database format
   */
  private mapCellFromDb(dbCell: Record<string, unknown>): SpreadsheetCell {
    return {
      id: dbCell['id'] as string,
      spreadsheet_id: '', // Not stored in cell table
      sheet_id: dbCell['sheet_id'] as string,
      row: dbCell['row'] as number ?? dbCell['row_idx'] as number,
      col: dbCell['col'] as number ?? dbCell['col_idx'] as number,
      raw_value: dbCell['raw_value'] as SpreadsheetCellValue,
      formula: dbCell['formula'] as string | undefined,
      computed_value: dbCell['computed_value'] as SpreadsheetCellValue,
      format: dbCell['format'] as SpreadsheetCell['format'],
      validation: dbCell['validation'] as SpreadsheetCell['validation'],
      merge: dbCell['merge'] as SpreadsheetCell['merge'],
      note: dbCell['note'] as string | undefined,
      created_at: dbCell['created_at'] as string || new Date().toISOString(),
      updated_at: dbCell['updated_at'] as string || new Date().toISOString(),
    };
  }

  // =====================================================================
  // Lazy Loading / Viewport-Based Cell Loading
  // =====================================================================

  /**
   * Load cells for a specific viewport (for lazy loading with virtual scrolling)
   * Loads cells within the visible range plus a buffer zone
   */
  loadCellsForViewport(
    spreadsheetId: string,
    sheetId: string,
    rowStart: number,
    rowEnd: number,
    colStart: number,
    colEnd: number,
    buffer = 10
  ): Observable<Map<string, SpreadsheetCell>> {
    // Expand range with buffer for smooth scrolling
    const bufferedRange = {
      start: {
        row: Math.max(0, rowStart - buffer),
        col: Math.max(0, colStart - buffer),
      },
      end: {
        row: rowEnd + buffer,
        col: colEnd + buffer,
      },
    };

    return this.loadCells(spreadsheetId, sheetId, bufferedRange);
  }

  /**
   * Check if cells exist in a specific range (for determining if lazy load is needed)
   */
  cellsExistInRange(
    currentCells: Map<string, SpreadsheetCell>,
    sheetId: string,
    rowStart: number,
    rowEnd: number,
    colStart: number,
    colEnd: number
  ): boolean {
    // Check corners and center to determine if range is loaded
    const checkPoints = [
      { row: rowStart, col: colStart },
      { row: rowStart, col: colEnd },
      { row: rowEnd, col: colStart },
      { row: rowEnd, col: colEnd },
      { row: Math.floor((rowStart + rowEnd) / 2), col: Math.floor((colStart + colEnd) / 2) },
    ];

    // If all check points have been loaded (even if empty), consider the range loaded
    // We track loaded ranges separately to avoid this approximation
    return checkPoints.every(point => {
      const key = getCellKey({ row: point.row, col: point.col, sheet: sheetId });
      // Check if we've ever tried to load this cell (including null values)
      // For a more accurate check, the component should track loaded ranges
      return currentCells.has(key);
    });
  }

  // =====================================================================
  // Computed Values (Formula Results Caching)
  // =====================================================================

  /**
   * Update computed values for cells after formula evaluation
   * This stores the cached results of formula calculations
   */
  updateComputedValues(
    spreadsheetId: string,
    computedValues: {
      sheetId: string;
      row: number;
      col: number;
      value: SpreadsheetCellValue;
    }[]
  ): Observable<boolean> {
    return this.getSpreadsheetMetadata(spreadsheetId).pipe(
      switchMap(metadata => {
        const tableName = metadata.table_name;

        // Batch update computed_value column
        const updates = computedValues.map(cv =>
          this.client
            .from(tableName)
            .update({ computed_value: cv.value, updated_at: new Date().toISOString() })
            .eq('sheet_id', cv.sheetId)
            .eq('row_idx', cv.row)
            .eq('col_idx', cv.col)
        );

        return from(Promise.all(updates));
      }),
      map(() => true),
      catchError(error => {
        console.error('[updateComputedValues] Error:', error);
        return throwError(() => error);
      })
    );
  }
}
