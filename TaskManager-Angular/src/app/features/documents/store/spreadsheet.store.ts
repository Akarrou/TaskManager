import { inject } from '@angular/core';
import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { tapResponse } from '@ngrx/operators';
import { pipe, switchMap, tap, concatMap } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SpreadsheetService } from '../services/spreadsheet.service';
import {
  DocumentSpreadsheet,
  SpreadsheetCell,
  SpreadsheetCellUpdate,
  SpreadsheetCellValue,
  SpreadsheetConfig,
  SpreadsheetSheet,
  CreateSpreadsheetRequest,
  CellRange,
  getCellKey,
} from '../models/spreadsheet.model';

interface SpreadsheetStoreState {
  spreadsheetId: string | null;
  metadata: DocumentSpreadsheet | null;
  cells: Record<string, SpreadsheetCell>;
  sheets: SpreadsheetSheet[];
  activeSheetId: string | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
}

const initialState: SpreadsheetStoreState = {
  spreadsheetId: null,
  metadata: null,
  cells: {},
  sheets: [],
  activeSheetId: null,
  loading: false,
  saving: false,
  error: null,
};

export const SpreadsheetStore = signalStore(
  { providedIn: 'root' },

  withState<SpreadsheetStoreState>(initialState),

  withMethods((
    store,
    spreadsheetService = inject(SpreadsheetService),
    snackBar = inject(MatSnackBar),
  ) => ({
    // ---- Reset state for a new spreadsheet context ----

    reset(): void {
      patchState(store, initialState);
    },

    // ---- Metadata operations ----

    loadMetadata: rxMethod<{ spreadsheetId: string }>(
      pipe(
        tap(({ spreadsheetId }) => patchState(store, { loading: true, error: null, spreadsheetId })),
        switchMap(({ spreadsheetId }) =>
          spreadsheetService.getSpreadsheetMetadata(spreadsheetId).pipe(
            tapResponse({
              next: (metadata) => {
                const config = metadata.config;
                patchState(store, {
                  metadata,
                  sheets: config.sheets || [],
                  activeSheetId: config.activeSheetId || config.sheets?.[0]?.id || null,
                  loading: false,
                });
              },
              error: (error: Error) => {
                patchState(store, { loading: false, error: error.message });
              },
            })
          )
        )
      )
    ),

    updateConfig: rxMethod<{ spreadsheetId: string; config: SpreadsheetConfig }>(
      pipe(
        tap(() => patchState(store, { saving: true, error: null })),
        concatMap(({ spreadsheetId, config }) =>
          spreadsheetService.updateSpreadsheetConfig(spreadsheetId, config).pipe(
            tapResponse({
              next: () => {
                patchState(store, {
                  sheets: config.sheets || [],
                  activeSheetId: config.activeSheetId || store.activeSheetId(),
                  saving: false,
                });
              },
              error: (error: Error) => {
                patchState(store, { saving: false, error: error.message });
              },
            })
          )
        )
      )
    ),

    // ---- Cell operations ----

    loadCells: rxMethod<{ spreadsheetId: string; sheetId: string }>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        switchMap(({ spreadsheetId, sheetId }) =>
          spreadsheetService.loadCells(spreadsheetId, sheetId).pipe(
            tapResponse({
              next: (cellMap) => {
                // Convert Map to Record for state storage
                const cellRecord: Record<string, SpreadsheetCell> = {};
                cellMap.forEach((cell, key) => {
                  cellRecord[key] = cell;
                });
                patchState(store, { cells: cellRecord, loading: false });
              },
              error: (error: Error) => {
                patchState(store, { loading: false, error: error.message });
              },
            })
          )
        )
      )
    ),

    batchUpdateCells: rxMethod<{ spreadsheetId: string; updates: Array<{ sheetId: string; row: number; col: number; update: SpreadsheetCellUpdate }> }>(
      pipe(
        tap(() => patchState(store, { saving: true, error: null })),
        concatMap(({ spreadsheetId, updates }) =>
          spreadsheetService.batchUpdateCells(spreadsheetId, updates).pipe(
            tapResponse({
              next: () => {
                patchState(store, { saving: false });
              },
              error: (error: Error) => {
                patchState(store, { saving: false, error: error.message });
                snackBar.open('Erreur lors de la sauvegarde', 'Fermer', { duration: 3000 });
              },
            })
          )
        )
      )
    ),

    clearRange: rxMethod<{ spreadsheetId: string; sheetId: string; range: CellRange }>(
      pipe(
        tap(() => patchState(store, { saving: true, error: null })),
        concatMap(({ spreadsheetId, sheetId, range }) =>
          spreadsheetService.clearRange(spreadsheetId, sheetId, range).pipe(
            tapResponse({
              next: () => {
                // Remove cleared cells from state
                const currentCells = { ...store.cells() };
                for (let r = range.start.row; r <= range.end.row; r++) {
                  for (let c = range.start.col; c <= range.end.col; c++) {
                    const key = getCellKey({ row: r, col: c, sheet: sheetId });
                    delete currentCells[key];
                  }
                }
                patchState(store, { cells: currentCells, saving: false });
              },
              error: (error: Error) => {
                patchState(store, { saving: false, error: error.message });
              },
            })
          )
        )
      )
    ),

    // ---- Sheet operations ----

    addSheet: rxMethod<{ spreadsheetId: string; sheetName?: string }>(
      pipe(
        tap(() => patchState(store, { saving: true, error: null })),
        concatMap(({ spreadsheetId, sheetName }) =>
          spreadsheetService.addSheet(spreadsheetId, sheetName).pipe(
            tapResponse({
              next: (newSheet) => {
                patchState(store, {
                  sheets: [...store.sheets(), newSheet],
                  activeSheetId: newSheet.id,
                  saving: false,
                });
              },
              error: (error: Error) => {
                patchState(store, { saving: false, error: error.message });
                snackBar.open("Erreur lors de l'ajout de la feuille", 'Fermer', { duration: 3000 });
              },
            })
          )
        )
      )
    ),

    deleteSheet: rxMethod<{ spreadsheetId: string; sheetId: string }>(
      pipe(
        tap(() => patchState(store, { saving: true, error: null })),
        concatMap(({ spreadsheetId, sheetId }) =>
          spreadsheetService.deleteSheet(spreadsheetId, sheetId).pipe(
            tapResponse({
              next: () => {
                const remainingSheets = store.sheets().filter(s => s.id !== sheetId);
                patchState(store, {
                  sheets: remainingSheets,
                  activeSheetId: store.activeSheetId() === sheetId
                    ? remainingSheets[0]?.id ?? null
                    : store.activeSheetId(),
                  saving: false,
                });
              },
              error: (error: Error) => {
                patchState(store, { saving: false, error: error.message });
                snackBar.open('Erreur lors de la suppression de la feuille', 'Fermer', { duration: 3000 });
              },
            })
          )
        )
      )
    ),

    renameSheet: rxMethod<{ spreadsheetId: string; sheetId: string; newName: string }>(
      pipe(
        concatMap(({ spreadsheetId, sheetId, newName }) =>
          spreadsheetService.renameSheet(spreadsheetId, sheetId, newName).pipe(
            tapResponse({
              next: () => {
                patchState(store, {
                  sheets: store.sheets().map(s =>
                    s.id === sheetId ? { ...s, name: newName } : s
                  ),
                });
              },
              error: (error: Error) => {
                patchState(store, { error: error.message });
              },
            })
          )
        )
      )
    ),

    setActiveSheet(sheetId: string): void {
      patchState(store, { activeSheetId: sheetId });
    },

    // ---- Local cell state management (for formula engine integration) ----

    /** Update cells in local state (used after formula engine recalculation) */
    updateLocalCells(updates: Record<string, SpreadsheetCell>): void {
      patchState(store, { cells: { ...store.cells(), ...updates } });
    },

    /** Set a single cell in local state */
    setLocalCell(key: string, cell: SpreadsheetCell): void {
      patchState(store, { cells: { ...store.cells(), [key]: cell } });
    },

    // ---- Delegated service methods (passthrough for component use) ----

    /** Create spreadsheet (returns Observable) */
    createSpreadsheet(request: CreateSpreadsheetRequest) {
      return spreadsheetService.createSpreadsheet(request);
    },

    /** Update cell in DB (returns Observable) */
    updateCell(spreadsheetId: string, sheetId: string, row: number, col: number, update: SpreadsheetCellUpdate) {
      return spreadsheetService.updateCell(spreadsheetId, sheetId, row, col, update);
    },

    /** Load cells for viewport (returns Observable) */
    loadCellsForViewport(spreadsheetId: string, sheetId: string, rowStart: number, rowEnd: number, colStart: number, colEnd: number, buffer?: number) {
      return spreadsheetService.loadCellsForViewport(spreadsheetId, sheetId, rowStart, rowEnd, colStart, colEnd, buffer);
    },

    /** Update sheet config (returns Observable) */
    updateSheetConfig(spreadsheetId: string, sheetId: string, updates: Partial<SpreadsheetSheet>) {
      return spreadsheetService.updateSheetConfig(spreadsheetId, sheetId, updates);
    },

    /** Soft delete spreadsheet (returns Observable) */
    softDeleteSpreadsheet(spreadsheetId: string) {
      return spreadsheetService.softDeleteSpreadsheet(spreadsheetId);
    },

    /** Update computed values (returns Observable) */
    updateComputedValues(spreadsheetId: string, computedValues: Array<{ sheetId: string; row: number; col: number; value: SpreadsheetCellValue }>) {
      return spreadsheetService.updateComputedValues(spreadsheetId, computedValues);
    },
  })),
);
