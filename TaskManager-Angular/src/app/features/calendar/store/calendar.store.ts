import { computed, inject } from '@angular/core';
import { signalStore, withState, withMethods, withComputed, patchState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, tap, switchMap, concatMap, catchError, EMPTY, from } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { EventEntry, EventDatabaseService } from '../../../core/services/event-database.service';
import { CalendarViewType } from '../models/calendar.model';
import { GoogleCalendarStore } from '../../google-calendar/store/google-calendar.store';

interface CalendarStoreState {
  events: EventEntry[];
  selectedEventId: string | null;
  currentView: CalendarViewType;
  dateRange: { start: string; end: string } | null;
  loading: boolean;
  error: string | null;
}

export const CalendarStore = signalStore(
  { providedIn: 'root' },

  withState<CalendarStoreState>({
    events: [],
    selectedEventId: null,
    currentView: 'dayGridMonth',
    dateRange: null,
    loading: false,
    error: null,
  }),

  withComputed((store) => ({
    selectedEvent: computed(() => {
      const id = store.selectedEventId();
      if (!id) return null;
      return store.events().find(e => e.id === id) ?? null;
    }),
  })),

  withMethods((
    store,
    eventDbService = inject(EventDatabaseService),
    snackBar = inject(MatSnackBar),
    gcalStore = inject(GoogleCalendarStore),
  ) => ({
    loadEvents: rxMethod<{ start: string; end: string; projectId?: string }>(
      pipe(
        tap(({ start, end }) => patchState(store, {
          loading: true,
          error: null,
          dateRange: { start, end },
        })),
        switchMap(({ start, end, projectId }) =>
          eventDbService.getEventEntriesForDateRange(start, end, projectId).pipe(
            tap((events) => {
              patchState(store, { events, loading: false });
            }),
            catchError((error: Error) => {
              patchState(store, { loading: false, error: error.message });
              snackBar.open(error.message || 'Erreur lors du chargement', 'Fermer', { duration: 5000 });
              return EMPTY;
            }),
          ),
        ),
      ),
    ),

    createEvent: rxMethod<{ databaseId: string; event: Partial<EventEntry>; addGoogleMeet?: boolean }>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        concatMap(({ databaseId, event, addGoogleMeet }) =>
          eventDbService.createEvent(databaseId, event).pipe(
            tap((created) => {
              patchState(store, {
                events: [...store.events(), created],
                loading: false,
              });
              snackBar.open('Événement créé avec succès', 'Fermer', { duration: 3000 });
            }),
            concatMap((created) =>
              from(gcalStore.triggerSyncForEvent(created.databaseId, created.id, {
                title: created.title,
                description: created.description,
                start_date: created.start_date,
                end_date: created.end_date,
                all_day: created.all_day,
                category: created.category,
                location: created.location,
                recurrence: created.recurrence,
                reminders: created.reminders,
                attendees: created.attendees,
                guest_permissions: created.guest_permissions,
                add_google_meet: addGoogleMeet ?? false,
              })).pipe(
                concatMap((result) => {
                  if (!result?.meet_link) {
                    return EMPTY;
                  }
                  const withMeet = { ...created, meet_link: result.meet_link };
                  patchState(store, {
                    events: store.events().map(e => e.id === withMeet.id ? withMeet : e),
                  });
                  return eventDbService.updateEvent(created.databaseId, created.id, { meet_link: result.meet_link }).pipe(
                    catchError((err: Error) => {
                      console.error('[CalendarStore] Failed to persist meet_link:', err);
                      return EMPTY;
                    }),
                  );
                }),
                catchError((err: Error) => {
                  console.error('[CalendarStore] Google Calendar sync failed:', err);
                  return EMPTY;
                }),
              ),
            ),
            catchError((error: Error) => {
              patchState(store, { loading: false, error: error.message });
              snackBar.open(error.message || 'Erreur lors de la création', 'Fermer', { duration: 5000 });
              return EMPTY;
            }),
          ),
        ),
      ),
    ),

    updateEvent: rxMethod<{ databaseId: string; eventId: string; updates: Partial<EventEntry>; addGoogleMeet?: boolean }>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        concatMap(({ databaseId, eventId, updates, addGoogleMeet }) =>
          eventDbService.updateEvent(databaseId, eventId, updates).pipe(
            tap((updated) => {
              // Merge partial updated fields with existing event for a complete object
              const existing = store.events().find(e => e.id === updated.id);
              const merged = existing ? { ...existing, ...updated } : updated;
              patchState(store, {
                events: store.events().map(e => e.id === updated.id ? merged as EventEntry : e),
                loading: false,
              });
              snackBar.open('Événement mis à jour', 'Fermer', { duration: 2000 });
            }),
            concatMap((updated) => {
              const existing = store.events().find(e => e.id === updated.id);
              const merged = existing ? { ...existing, ...updated } : updated;
              return from(gcalStore.triggerSyncForEvent(merged.databaseId, merged.id, {
                title: merged.title,
                description: merged.description,
                start_date: merged.start_date,
                end_date: merged.end_date,
                all_day: merged.all_day,
                category: merged.category,
                location: merged.location,
                recurrence: merged.recurrence,
                reminders: merged.reminders,
                attendees: merged.attendees,
                guest_permissions: merged.guest_permissions,
                add_google_meet: addGoogleMeet ?? false,
              })).pipe(
                concatMap((result) => {
                  if (!result?.meet_link) {
                    return EMPTY;
                  }
                  patchState(store, {
                    events: store.events().map(e => e.id === merged.id ? { ...e, meet_link: result.meet_link } : e),
                  });
                  return eventDbService.updateEvent(merged.databaseId, merged.id, { meet_link: result.meet_link }).pipe(
                    catchError((err: Error) => {
                      console.error('[CalendarStore] Failed to persist meet_link:', err);
                      return EMPTY;
                    }),
                  );
                }),
                catchError((err: Error) => {
                  console.error('[CalendarStore] Google Calendar sync failed:', err);
                  return EMPTY;
                }),
              );
            }),
            catchError((error: Error) => {
              patchState(store, { loading: false, error: error.message });
              snackBar.open(error.message || 'Erreur lors de la mise à jour', 'Fermer', { duration: 5000 });
              return EMPTY;
            }),
          ),
        ),
      ),
    ),

    deleteEvent: rxMethod<{ databaseId: string; rowId: string }>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        concatMap(({ databaseId, rowId }) =>
          eventDbService.deleteEvent(databaseId, rowId).pipe(
            tap(() => {
              patchState(store, {
                events: store.events().filter(e => e.id !== rowId),
                loading: false,
                selectedEventId: store.selectedEventId() === rowId ? null : store.selectedEventId(),
              });
              snackBar.open('Événement supprimé', 'Fermer', { duration: 2000 });
            }),
            concatMap(() =>
              from(gcalStore.triggerDeleteForEvent(databaseId, rowId)).pipe(
                catchError((err: Error) => {
                  console.error('[CalendarStore] Google Calendar delete sync failed:', err);
                  return EMPTY;
                }),
              )
            ),
            catchError((error: Error) => {
              patchState(store, { loading: false, error: error.message });
              snackBar.open(error.message || 'Erreur lors de la suppression', 'Fermer', { duration: 5000 });
              return EMPTY;
            }),
          ),
        ),
      ),
    ),

    selectEvent(eventId: string | null): void {
      patchState(store, { selectedEventId: eventId });
    },

    changeView(view: CalendarViewType): void {
      patchState(store, { currentView: view });
    },
  })),
);
