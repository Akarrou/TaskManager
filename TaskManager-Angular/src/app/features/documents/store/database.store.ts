import { inject } from '@angular/core';
import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { tapResponse } from '@ngrx/operators';
import { pipe, switchMap, tap, concatMap } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DatabaseService } from '../services/database.service';
import { TrashService } from '../../../core/services/trash.service';
import { TrashStore } from '../../trash/store/trash.store';
import {
  DocumentDatabase,
  DatabaseRow,
  QueryRowsParams,
  AddRowRequest,
  UpdateCellRequest,
  DeleteRowsRequest,
  AddColumnRequest,
  UpdateColumnRequest,
  DeleteColumnRequest,
  DatabaseConfig,
  CreateDatabaseRequest,
} from '../models/database.model';
import { withRealtimeSync } from '../../../core/stores/features/with-realtime-sync';

interface DatabaseStoreState {
  databases: DocumentDatabase[];
  currentDatabaseId: string | null;
  rows: DatabaseRow[];
  totalRowCount: number;
  loading: boolean;
  rowLoading: boolean;
  error: string | null;
}

export const DatabaseStore = signalStore(
  { providedIn: 'root' },

  withState<DatabaseStoreState>({
    databases: [],
    currentDatabaseId: null,
    rows: [],
    totalRowCount: 0,
    loading: false,
    rowLoading: false,
    error: null,
  }),

  withMethods((
    store,
    databaseService = inject(DatabaseService),
    trashService = inject(TrashService),
    trashStore = inject(TrashStore),
    snackBar = inject(MatSnackBar),
  ) => ({
    // ---- Database metadata ----

    loadAllDatabases: rxMethod<void>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        switchMap(() =>
          databaseService.getAllDatabases().pipe(
            tapResponse({
              next: (databases) => patchState(store, { databases, loading: false }),
              error: (error: Error) => patchState(store, { loading: false, error: error.message }),
            })
          )
        )
      )
    ),

    loadDatabasesByDocumentId: rxMethod<{ documentId: string }>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        switchMap(({ documentId }) =>
          databaseService.getDatabasesByDocumentId(documentId).pipe(
            tapResponse({
              next: (databases) => patchState(store, { databases, loading: false }),
              error: (error: Error) => patchState(store, { loading: false, error: error.message }),
            })
          )
        )
      )
    ),

    // ---- Row operations ----

    loadRows: rxMethod<QueryRowsParams>(
      pipe(
        tap(({ databaseId }) => patchState(store, { rowLoading: true, error: null, currentDatabaseId: databaseId })),
        switchMap((params) =>
          databaseService.getRowsWithCount(params).pipe(
            tapResponse({
              next: (result) => patchState(store, { rows: result.rows, totalRowCount: result.totalCount, rowLoading: false }),
              error: (error: Error) => patchState(store, { rowLoading: false, error: error.message }),
            })
          )
        )
      )
    ),

    addRow: rxMethod<AddRowRequest>(
      pipe(
        tap(() => patchState(store, { rowLoading: true, error: null })),
        concatMap((request) =>
          databaseService.addRow(request).pipe(
            tapResponse({
              next: (row) => {
                patchState(store, {
                  rows: [...store.rows(), row],
                  totalRowCount: store.totalRowCount() + 1,
                  rowLoading: false,
                });
              },
              error: (error: Error) => {
                patchState(store, { rowLoading: false, error: error.message });
                snackBar.open('Erreur lors de l\'ajout de la ligne', 'Fermer', { duration: 3000 });
              },
            })
          )
        )
      )
    ),

    updateCell: rxMethod<UpdateCellRequest>(
      pipe(
        concatMap((request) =>
          databaseService.updateCell(request).pipe(
            tapResponse({
              next: () => {
                // updateCell returns boolean, not the updated row.
                // The row update will come via realtime sync or manual reload.
              },
              error: (error: Error) => {
                patchState(store, { error: error.message });
                snackBar.open('Erreur lors de la mise à jour', 'Fermer', { duration: 3000 });
              },
            })
          )
        )
      )
    ),

    deleteRows: rxMethod<DeleteRowsRequest>(
      pipe(
        tap(() => patchState(store, { rowLoading: true, error: null })),
        concatMap((request) =>
          databaseService.deleteRows(request).pipe(
            tapResponse({
              next: () => {
                patchState(store, {
                  rows: store.rows().filter(r => !request.rowIds.includes(r.id)),
                  totalRowCount: store.totalRowCount() - request.rowIds.length,
                  rowLoading: false,
                });
              },
              error: (error: Error) => {
                patchState(store, { rowLoading: false, error: error.message });
                snackBar.open('Erreur lors de la suppression', 'Fermer', { duration: 3000 });
              },
            })
          )
        )
      )
    ),

    // ---- Column operations ----

    addColumn: rxMethod<AddColumnRequest>(
      pipe(
        concatMap((request) =>
          databaseService.addColumn(request).pipe(
            tapResponse({
              next: () => {
                // Column ops update config via service internally.
                // The component handles config refresh locally.
              },
              error: (error: Error) => {
                patchState(store, { error: error.message });
                snackBar.open('Erreur lors de l\'ajout de la colonne', 'Fermer', { duration: 3000 });
              },
            })
          )
        )
      )
    ),

    updateColumn: rxMethod<UpdateColumnRequest>(
      pipe(
        concatMap((request) =>
          databaseService.updateColumn(request).pipe(
            tapResponse({
              next: () => { /* noop */ },
              error: (error: Error) => {
                patchState(store, { error: error.message });
              },
            })
          )
        )
      )
    ),

    deleteColumn: rxMethod<DeleteColumnRequest>(
      pipe(
        concatMap((request) =>
          databaseService.deleteColumn(request).pipe(
            tapResponse({
              next: () => { /* noop */ },
              error: (error: Error) => {
                patchState(store, { error: error.message });
                snackBar.open('Erreur lors de la suppression de la colonne', 'Fermer', { duration: 3000 });
              },
            })
          )
        )
      )
    ),

    // ---- Database lifecycle ----

    deleteDatabase: rxMethod<{ databaseId: string }>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        concatMap(({ databaseId }) =>
          databaseService.softDeleteDatabase(databaseId).pipe(
            switchMap((metadata) =>
              trashService.softDeleteTrashOnly(
                'database',
                metadata.id,
                'document_databases',
                metadata.name || databaseId,
                { databaseId },
              )
            ),
            tapResponse({
              next: () => {
                patchState(store, {
                  databases: store.databases().filter(db => db.database_id !== databaseId),
                  loading: false,
                });
                trashStore.loadTrashCount();
                snackBar.open('Base de données supprimée', 'Fermer', { duration: 3000 });
              },
              error: (error: Error) => {
                patchState(store, { loading: false, error: error.message });
                snackBar.open('Erreur lors de la suppression', 'Fermer', { duration: 3000 });
              },
            })
          )
        )
      )
    ),

    // ---- Sync helpers (delegated to service, not stored in state) ----

    /** Update database config metadata (delegates to service) */
    updateDatabaseConfig(databaseId: string, config: DatabaseConfig) {
      return databaseService.updateDatabaseConfig(databaseId, config);
    },

    /** Ensure table exists (delegates to service) */
    ensureTableExists(databaseId: string) {
      return databaseService.ensureTableExists(databaseId);
    },

    /** Create database (delegates to service, returns Observable) */
    createDatabase(request: CreateDatabaseRequest) {
      return databaseService.createDatabase(request);
    },

    /** Get databases by document ID (raw Observable, for use in components that need it) */
    getDatabasesByDocumentId(documentId: string) {
      return databaseService.getDatabasesByDocumentId(documentId);
    },

    /** Soft delete database (raw Observable for document-list integration) */
    softDeleteDatabase(databaseId: string) {
      return databaseService.softDeleteDatabase(databaseId);
    },

    /** Restore database to document */
    restoreDatabaseToDocument(databaseUuid: string, documentId: string) {
      return databaseService.restoreDatabaseToDocument(databaseUuid, documentId);
    },
  })),

  withRealtimeSync({
    dynamicPrefixes: ['database_'],
    onTableChange: (store) => {
      const databaseId = store['currentDatabaseId'];
      const loadRowsFn = store['loadRows'];
      if (typeof databaseId === 'function' && typeof loadRowsFn === 'function') {
        const id = databaseId() as string | null;
        if (id) {
          loadRowsFn({ databaseId: id });
        }
      }
    },
  }),
);
