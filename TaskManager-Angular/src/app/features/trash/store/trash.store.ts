import { computed, inject } from '@angular/core';
import { signalStore, withState, withMethods, withComputed, patchState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, tap, switchMap, mergeMap, catchError, EMPTY, of, from } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TrashService } from '../../../core/services/trash.service';
import { TrashItem, TrashItemType } from '../../../core/models/trash.model';
import { DatabaseService } from '../../documents/services/database.service';
import { SpreadsheetService } from '../../documents/services/spreadsheet.service';
import { EventDatabaseService } from '../../../core/services/event-database.service';
import { GoogleCalendarStore } from '../../google-calendar/store/google-calendar.store';
import { withRealtimeSync } from '../../../core/stores/features/with-realtime-sync';

interface TrashStoreState {
  items: TrashItem[];
  filter: TrashItemType | null;
  loading: boolean;
  error: string | null;
  trashCount: number;
  processingIds: string[];
}

export const TrashStore = signalStore(
  { providedIn: 'root' },

  withState<TrashStoreState>({
    items: [],
    filter: null,
    loading: false,
    error: null,
    trashCount: 0,
    processingIds: [],
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
    eventDbService = inject(EventDatabaseService),
    gcalStore = inject(GoogleCalendarStore),
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
        tap((trashItem) => patchState(store, {
          processingIds: [...store.processingIds(), trashItem.id],
          error: null,
        })),
        mergeMap((trashItem) => {
          const docId = trashItem.parent_info?.['documentId'];

          // For embedded items, verify parent document exists and is active
          const parentCheck$ = (docId && (trashItem.item_type === 'database' || trashItem.item_type === 'spreadsheet'))
            ? trashService.checkParentDocument(docId).pipe(
                switchMap((parent) => {
                  if (!parent.exists || parent.deleted) {
                    snackBar.open(
                      'Le document parent est supprimé. Restaurez-le d\'abord.',
                      'Fermer',
                      { duration: 5000 },
                    );
                    patchState(store, {
                      processingIds: store.processingIds().filter(id => id !== trashItem.id),
                    });
                    return EMPTY;
                  }
                  return of(true);
                }),
              )
            : of(true);

          return parentCheck$.pipe(
            switchMap(() => trashService.restore(trashItem)),
            // For TipTap embedded elements, also restore the node in the parent document
            switchMap(() => {
              if (!docId) return of(true);

              if (trashItem.item_type === 'database') {
                return databaseService.restoreDatabaseToDocument(trashItem.item_id, docId);
              }
              if (trashItem.item_type === 'spreadsheet') {
                return spreadsheetService.restoreSpreadsheetToDocument(trashItem.item_id, docId);
              }
              return of(true);
            }),
            // For database rows and events, also restore the associated document (and its tab item references)
            switchMap(() => {
              if (trashItem.item_type !== 'database_row' && trashItem.item_type !== 'event') return of(true);

              const databaseId = trashItem.parent_info?.['databaseId'];
              if (!databaseId) return of(true);

              return databaseService.restoreRowDocument(databaseId, trashItem.item_id);
            }),
            // For events, re-sync to Google Calendar
            switchMap(() => {
              if (trashItem.item_type !== 'event') return of(true);

              const eventDatabaseId = trashItem.parent_info?.['databaseId'];
              if (!eventDatabaseId) return of(true);

              return eventDbService.getEventById(eventDatabaseId, trashItem.item_id).pipe(
                switchMap(event => {
                  if (!event) return of(true);
                  return from(gcalStore.triggerSyncForEvent(eventDatabaseId, trashItem.item_id, {
                    title: event.title,
                    description: event.description,
                    start_date: event.start_date,
                    end_date: event.end_date,
                    all_day: event.all_day,
                    category: event.category,
                    location: event.location,
                    recurrence: event.recurrence,
                    reminders: event.reminders,
                    attendees: event.attendees,
                    guest_permissions: event.guest_permissions,
                  }));
                }),
                catchError((err: Error) => {
                  console.error('[TrashStore] Google Calendar re-sync failed:', err);
                  return of(true);
                }),
              );
            }),
            tap(() => {
              patchState(store, {
                items: store.items().filter(i => i.id !== trashItem.id),
                processingIds: store.processingIds().filter(id => id !== trashItem.id),
                trashCount: store.trashCount() - 1,
              });
              snackBar.open(`"${trashItem.display_name}" restauré`, 'Fermer', { duration: 3000 });
            }),
            catchError((error: Error) => {
              patchState(store, {
                processingIds: store.processingIds().filter(id => id !== trashItem.id),
                error: error.message,
              });
              snackBar.open('Erreur lors de la restauration', 'Fermer', { duration: 5000 });
              return EMPTY;
            }),
          );
        }),
      ),
    ),

    permanentDeleteItem: rxMethod<TrashItem>(
      pipe(
        tap((trashItem) => patchState(store, {
          processingIds: [...store.processingIds(), trashItem.id],
          error: null,
        })),
        mergeMap((trashItem) =>
          trashService.permanentDelete(trashItem).pipe(
            tap(() => {
              patchState(store, {
                items: store.items().filter(i => i.id !== trashItem.id),
                processingIds: store.processingIds().filter(id => id !== trashItem.id),
                trashCount: store.trashCount() - 1,
              });
              snackBar.open(`"${trashItem.display_name}" supprimé définitivement`, 'Fermer', { duration: 3000 });
            }),
            catchError((error: Error) => {
              patchState(store, {
                processingIds: store.processingIds().filter(id => id !== trashItem.id),
                error: error.message,
              });
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

  withRealtimeSync({
    tables: ['trash_items'],
    onTableChange: (store) => {
      const fn = store['loadTrashCount'];
      if (typeof fn === 'function') fn();
    },
  }),
);
