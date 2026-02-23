import { computed, inject } from '@angular/core';
import { signalStore, withState, withMethods, withComputed, patchState } from '@ngrx/signals';

import { GoogleCalendarAuthService } from '../services/google-calendar-auth.service';
import { GoogleCalendarApiService } from '../services/google-calendar-api.service';
import {
  ConflictInfo,
  GoogleCalendarConnection,
  GoogleCalendarInfo,
  GoogleCalendarSyncConfig,
  SyncResult,
} from '../models/google-calendar.model';

interface GoogleCalendarStoreState {
  connection: GoogleCalendarConnection | null;
  syncConfigs: GoogleCalendarSyncConfig[];
  availableCalendars: GoogleCalendarInfo[];
  syncStatus: 'idle' | 'syncing' | 'error' | 'disconnected';
  lastSyncResult: SyncResult | null;
  conflicts: ConflictInfo[];
  loading: boolean;
}

export const GoogleCalendarStore = signalStore(
  { providedIn: 'root' },

  withState<GoogleCalendarStoreState>({
    connection: null,
    syncConfigs: [],
    availableCalendars: [],
    syncStatus: 'idle',
    lastSyncResult: null,
    conflicts: [],
    loading: false,
  }),

  withComputed((store) => ({
    isConnected: computed(() => store.connection() !== null && store.connection()!.is_active),
    enabledSyncConfigs: computed(() => store.syncConfigs().filter(c => c.is_enabled)),
  })),

  withMethods((
    store,
    authService = inject(GoogleCalendarAuthService),
    apiService = inject(GoogleCalendarApiService),
  ) => ({
    async loadConnection(): Promise<void> {
      patchState(store, { loading: true });
      try {
        const connection = await authService.getConnection();
        patchState(store, {
          connection,
          syncStatus: connection?.is_active ? 'idle' : 'disconnected',
          loading: false,
        });
      } catch (error) {
        console.error('[GoogleCalendarStore] loadConnection failed:', error);
        patchState(store, { loading: false, syncStatus: 'disconnected' });
      }
    },

    async connect(): Promise<void> {
      patchState(store, { loading: true });
      try {
        await authService.initiateConnection();
      } catch (error) {
        console.error('[GoogleCalendarStore] connect failed:', error);
        patchState(store, { loading: false });
      }
    },

    async disconnect(): Promise<void> {
      patchState(store, { loading: true });
      try {
        await authService.disconnect();
        patchState(store, {
          connection: null,
          syncConfigs: [],
          availableCalendars: [],
          syncStatus: 'disconnected',
          lastSyncResult: null,
          conflicts: [],
          loading: false,
        });
      } catch (error) {
        console.error('[GoogleCalendarStore] disconnect failed:', error);
        patchState(store, { loading: false });
      }
    },

    async loadCalendars(): Promise<void> {
      patchState(store, { loading: true });
      try {
        const calendars = await apiService.listCalendars();
        patchState(store, { availableCalendars: calendars, loading: false });
      } catch (error) {
        console.error('[GoogleCalendarStore] loadCalendars failed:', error);
        patchState(store, { loading: false });
      }
    },

    async loadSyncConfigs(): Promise<void> {
      patchState(store, { loading: true });
      try {
        const configs = await apiService.getSyncConfigs();
        patchState(store, { syncConfigs: configs, loading: false });
      } catch (error) {
        console.error('[GoogleCalendarStore] loadSyncConfigs failed:', error);
        patchState(store, { loading: false });
      }
    },

    async updateSyncConfig(id: string, changes: Partial<GoogleCalendarSyncConfig>): Promise<void> {
      try {
        await apiService.updateSyncConfig(id, changes);
        const configs = await apiService.getSyncConfigs();
        patchState(store, { syncConfigs: configs });
      } catch (error) {
        console.error('[GoogleCalendarStore] updateSyncConfig failed:', error);
      }
    },

    async createSyncConfig(config: Omit<GoogleCalendarSyncConfig, 'id'>): Promise<void> {
      try {
        await apiService.createSyncConfig(config);
        const configs = await apiService.getSyncConfigs();
        patchState(store, { syncConfigs: configs });
      } catch (error) {
        console.error('[GoogleCalendarStore] createSyncConfig failed:', error);
      }
    },

    async triggerSync(configId?: string): Promise<void> {
      patchState(store, { syncStatus: 'syncing' });
      try {
        if (configId) {
          const result = await apiService.triggerSync(configId);
          patchState(store, { lastSyncResult: result, syncStatus: 'idle' });
        } else {
          const enabledConfigs = store.syncConfigs().filter(c => c.is_enabled);
          let lastResult: SyncResult | null = null;

          for (const config of enabledConfigs) {
            lastResult = await apiService.triggerSync(config.id);
          }

          patchState(store, { lastSyncResult: lastResult, syncStatus: 'idle' });
        }

        // Reload configs to get updated last_sync_at
        const configs = await apiService.getSyncConfigs();
        patchState(store, { syncConfigs: configs });
      } catch (error) {
        console.error('[GoogleCalendarStore] triggerSync failed:', error);
        patchState(store, { syncStatus: 'error' });
      }
    },

    async triggerSyncForEvent(
      databaseId: string,
      rowId: string,
      eventData: Record<string, unknown>,
    ): Promise<void> {
      try {
        const syncConfig = await apiService.getEnabledSyncConfigForDatabase(databaseId);
        if (!syncConfig) {
          return;
        }
        await apiService.pushEvent(syncConfig.id, databaseId, rowId, eventData);
      } catch (error) {
        console.error('[GoogleCalendarStore] triggerSyncForEvent failed:', error);
      }
    },

    async triggerDeleteForEvent(databaseId: string, rowId: string): Promise<void> {
      try {
        const syncConfig = await apiService.getEnabledSyncConfigForDatabase(databaseId);
        if (!syncConfig) {
          return;
        }
        await apiService.deleteGoogleEvent(syncConfig.id, databaseId, rowId);
      } catch (error) {
        console.error('[GoogleCalendarStore] triggerDeleteForEvent failed:', error);
      }
    },

    resolveConflict(mappingId: string, _resolution: 'kodo' | 'google'): void {
      patchState(store, {
        conflicts: store.conflicts().filter(c => c.mapping_id !== mappingId),
      });
    },
  })),
);
