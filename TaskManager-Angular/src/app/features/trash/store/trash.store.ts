import { computed, inject } from '@angular/core';
import { signalStore, withState, withMethods, withComputed, patchState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, tap, switchMap, catchError, EMPTY, of } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TrashService } from '../../../core/services/trash.service';
import { TrashItem, TrashItemType } from '../../../core/models/trash.model';
import { DatabaseService } from '../../documents/services/database.service';
import { SpreadsheetService } from '../../documents/services/spreadsheet.service';

interface TrashStoreState {
  items: TrashItem[];
  filter: TrashItemType | null;
  loading: boolean;
  error: string | null;
  trashCount: number;
}

export const TrashStore = signalStore(
  { providedIn: 'root' },

  withState<TrashStoreState>({
    items: [],
    filter: null,
    loading: false,
    error: null,
    trashCount: 0,
  }),

  withComputed((store) => ({
    filteredItems: computed(() => {
      const filter = store.filter();
      const items = store.items();
      if (!filter) return items;
      return items.filter(item => item.item_type === filter);
    }),
    isEmpty: computed(() => store.items().length === 0),
  })),

  withMethods((
    store,
    trashService = inject(TrashService),
    databaseService = inject(DatabaseService),
    spreadsheetService = inject(SpreadsheetService),
    snackBar = inject(MatSnackBar),
  ) => ({
    loadItems: rxMethod<void>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        switchMap(() =>
          trashService.getTrashItems().pipe(
            tap((items) => {
              patchState(store, { items, loading: false, trashCount: items.length });
            }),
            catchError((error: Error) => {
              patchState(store, { loading: false, error: error.message });
              return EMPTY;
            }),
          ),
        ),
      ),
    ),

    loadTrashCount: rxMethod<void>(
      pipe(
        switchMap(() =>
          trashService.getTrashCount().pipe(
            tap((count) => patchState(store, { trashCount: count })),
            catchError(() => EMPTY),
          ),
        ),
      ),
    ),

    restoreItem: rxMethod<TrashItem>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        switchMap((trashItem) =>
          trashService.restore(trashItem).pipe(
            // For TipTap embedded elements, also restore the node in the parent document
            switchMap(() => {
              const docId = trashItem.parent_info?.['documentId'];
              if (!docId) return of(true);

              if (trashItem.item_type === 'database') {
                return databaseService.restoreDatabaseToDocument(trashItem.item_id, docId);
              }
              if (trashItem.item_type === 'spreadsheet') {
                return spreadsheetService.restoreSpreadsheetToDocument(trashItem.item_id, docId);
              }
              return of(true);
            }),
            tap(() => {
              patchState(store, {
                items: store.items().filter(i => i.id !== trashItem.id),
                loading: false,
                trashCount: store.trashCount() - 1,
              });
              snackBar.open(`"${trashItem.display_name}" restauré`, 'Fermer', { duration: 3000 });
            }),
            catchError((error: Error) => {
              patchState(store, { loading: false, error: error.message });
              snackBar.open('Erreur lors de la restauration', 'Fermer', { duration: 5000 });
              return EMPTY;
            }),
          ),
        ),
      ),
    ),

    permanentDeleteItem: rxMethod<TrashItem>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        switchMap((trashItem) =>
          trashService.permanentDelete(trashItem).pipe(
            tap(() => {
              patchState(store, {
                items: store.items().filter(i => i.id !== trashItem.id),
                loading: false,
                trashCount: store.trashCount() - 1,
              });
              snackBar.open(`"${trashItem.display_name}" supprimé définitivement`, 'Fermer', { duration: 3000 });
            }),
            catchError((error: Error) => {
              patchState(store, { loading: false, error: error.message });
              snackBar.open('Erreur lors de la suppression', 'Fermer', { duration: 5000 });
              return EMPTY;
            }),
          ),
        ),
      ),
    ),

    emptyTrash: rxMethod<void>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        switchMap(() =>
          trashService.emptyTrash().pipe(
            tap(() => {
              patchState(store, { items: [], loading: false, trashCount: 0 });
              snackBar.open('Corbeille vidée', 'Fermer', { duration: 3000 });
            }),
            catchError((error: Error) => {
              patchState(store, { loading: false, error: error.message });
              snackBar.open('Erreur lors du vidage de la corbeille', 'Fermer', { duration: 5000 });
              return EMPTY;
            }),
          ),
        ),
      ),
    ),

    setFilter(filter: TrashItemType | null): void {
      patchState(store, { filter });
    },
  })),
);
