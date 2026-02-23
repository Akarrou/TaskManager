import { computed, inject } from '@angular/core';
import { signalStore, withState, withMethods, withComputed, patchState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, tap, switchMap, catchError, of } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { EventEntry, EventDatabaseService } from '../../../core/services/event-database.service';
import { GoogleCalendarStore } from '../../google-calendar/store/google-calendar.store';

type CalendarViewType = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay';

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
              return of(null);
            }),
          ),
        ),
      ),
    ),

    createEvent: rxMethod<{ databaseId: string; event: Partial<EventEntry> }>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        switchMap(({ databaseId, event }) =>
          eventDbService.createEvent(databaseId, event).pipe(
            tap((created) => {
              patchState(store, {
                events: [...store.events(), created],
                loading: false,
              });
              snackBar.open('Événement créé avec succès', 'Fermer', { duration: 3000 });
              // Sync to Google Calendar if applicable
              gcalStore.triggerSyncForEvent(created.databaseId, created.id, {
                title: created.title,
                description: created.description,
                start_date: created.start_date,
                end_date: created.end_date,
                all_day: created.all_day,
                category: created.category,
                location: created.location,
                recurrence: created.recurrence,
                reminders: created.reminders,
                add_google_meet: (event as Record<string, unknown>)['add_google_meet'] ?? false,
              }).then(result => {
                if (result?.meet_link) {
                  const withMeet = { ...created, meet_link: result.meet_link };
                  patchState(store, {
                    events: store.events().map(e => e.id === withMeet.id ? withMeet : e),
                  });
                }
              });
            }),
            catchError((error: Error) => {
              patchState(store, { loading: false, error: error.message });
              snackBar.open(error.message || 'Erreur lors de la création', 'Fermer', { duration: 5000 });
              return of(null);
            }),
          ),
        ),
      ),
    ),

    updateEvent: rxMethod<{ databaseId: string; rowId: string; updates: Partial<EventEntry> }>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        switchMap(({ databaseId, rowId, updates }) =>
          eventDbService.updateEvent(databaseId, rowId, updates).pipe(
            tap((updated) => {
              patchState(store, {
                events: store.events().map(e => e.id === updated.id ? updated : e),
                loading: false,
              });
              snackBar.open('Événement mis à jour', 'Fermer', { duration: 2000 });
              // Sync to Google Calendar if applicable
              gcalStore.triggerSyncForEvent(updated.databaseId, updated.id, {
                title: updated.title,
                description: updated.description,
                start_date: updated.start_date,
                end_date: updated.end_date,
                all_day: updated.all_day,
                category: updated.category,
                location: updated.location,
                recurrence: updated.recurrence,
                reminders: updated.reminders,
                add_google_meet: (updates as Record<string, unknown>)['add_google_meet'] ?? false,
              }).then(result => {
                if (result?.meet_link) {
                  const withMeet = { ...updated, meet_link: result.meet_link };
                  patchState(store, {
                    events: store.events().map(e => e.id === withMeet.id ? withMeet : e),
                  });
                }
              });
            }),
            catchError((error: Error) => {
              patchState(store, { loading: false, error: error.message });
              snackBar.open(error.message || 'Erreur lors de la mise à jour', 'Fermer', { duration: 5000 });
              return of(null);
            }),
          ),
        ),
      ),
    ),

    deleteEvent: rxMethod<{ databaseId: string; rowId: string }>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        switchMap(({ databaseId, rowId }) =>
          eventDbService.deleteEvent(databaseId, rowId).pipe(
            tap(() => {
              // Sync delete to Google Calendar before removing from state
              gcalStore.triggerDeleteForEvent(databaseId, rowId);
              patchState(store, {
                events: store.events().filter(e => e.id !== rowId),
                loading: false,
                selectedEventId: store.selectedEventId() === rowId ? null : store.selectedEventId(),
              });
              snackBar.open('Événement supprimé', 'Fermer', { duration: 2000 });
            }),
            catchError((error: Error) => {
              patchState(store, { loading: false, error: error.message });
              snackBar.open(error.message || 'Erreur lors de la suppression', 'Fermer', { duration: 5000 });
              return of(null);
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
