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
  conflicts: ConflictInfo[]; // TODO: Implement server-side conflict resolution
  connectionLoading: boolean;
  calendarsLoading: boolean;
  syncConfigsLoading: boolean;
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
    connectionLoading: false,
    calendarsLoading: false,
    syncConfigsLoading: false,
  }),

  withComputed((store) => ({
    isConnected: computed(() => store.connection() !== null && store.connection()!.is_active),
    enabledSyncConfigs: computed(() => store.syncConfigs().filter(c => c.is_enabled)),
    loading: computed(() => store.connectionLoading() || store.calendarsLoading() || store.syncConfigsLoading()),
  })),

  withMethods((
    store,
    authService = inject(GoogleCalendarAuthService),
    apiService = inject(GoogleCalendarApiService),
  ) => ({
    async loadConnection(): Promise<void> {
      patchState(store, { connectionLoading: true });
      try {
        const connection = await authService.getConnection();
        patchState(store, {
          connection,
          syncStatus: connection?.is_active ? 'idle' : 'disconnected',
          connectionLoading: false,
        });
      } catch (error) {
        console.error('[GoogleCalendarStore] loadConnection failed:', error);
        patchState(store, { connectionLoading: false, syncStatus: 'disconnected' });
      }
    },

    async connect(): Promise<void> {
      patchState(store, { connectionLoading: true });
      try {
        await authService.initiateConnection();
      } catch (error) {
        console.error('[GoogleCalendarStore] connect failed:', error);
        patchState(store, { connectionLoading: false });
      }
    },

    async disconnect(): Promise<void> {
      patchState(store, { connectionLoading: true });
      try {
        await authService.disconnect();
        patchState(store, {
          connection: null,
          syncConfigs: [],
          availableCalendars: [],
          syncStatus: 'disconnected',
          lastSyncResult: null,
          conflicts: [],
          connectionLoading: false,
        });
      } catch (error) {
        console.error('[GoogleCalendarStore] disconnect failed:', error);
        patchState(store, { connectionLoading: false });
      }
    },

    async loadCalendars(): Promise<void> {
      patchState(store, { calendarsLoading: true });
      try {
        const calendars = await apiService.listCalendars();
        patchState(store, { availableCalendars: calendars, calendarsLoading: false });
      } catch (error) {
        console.error('[GoogleCalendarStore] loadCalendars failed:', error);
        patchState(store, { calendarsLoading: false });
      }
    },

    async loadSyncConfigs(): Promise<void> {
      patchState(store, { syncConfigsLoading: true });
      try {
        const configs = await apiService.getSyncConfigs();
        patchState(store, { syncConfigs: configs, syncConfigsLoading: false });
      } catch (error) {
        console.error('[GoogleCalendarStore] loadSyncConfigs failed:', error);
        patchState(store, { syncConfigsLoading: false });
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
          const aggregated: SyncResult = {
            events_created: 0,
            events_updated: 0,
            events_deleted: 0,
            events_skipped: 0,
            errors: [],
            status: 'success',
          };

          for (const config of enabledConfigs) {
            try {
              const result = await apiService.triggerSync(config.id);
              aggregated.events_created += result.events_created;
              aggregated.events_updated += result.events_updated;
              aggregated.events_deleted += result.events_deleted;
              aggregated.events_skipped += result.events_skipped;
              aggregated.errors = [...aggregated.errors, ...result.errors];
              if (result.status === 'error') {
                aggregated.status = 'error';
              } else if (result.status === 'partial' && aggregated.status !== 'error') {
                aggregated.status = 'partial';
              }
            } catch (configError) {
              aggregated.status = 'error';
              aggregated.errors = [...aggregated.errors, {
                event_id: '',
                message: `Config ${config.google_calendar_name}: ${configError instanceof Error ? configError.message : String(configError)}`,
                timestamp: new Date().toISOString(),
              }];
            }
          }

          patchState(store, {
            lastSyncResult: aggregated,
            syncStatus: aggregated.status === 'error' ? 'error' : 'idle',
          });
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
    ): Promise<{ meet_link?: string } | null> {
      try {
        const actualDbUuid = await apiService.resolveDatabaseUuid(databaseId);
        if (!actualDbUuid) return null;

        // 1. Check if this event already has a Google Calendar mapping
        //    If so, use its sync_config_id to push to the SAME calendar
        const existingMapping = await apiService.getEventMapping(databaseId, rowId);

        let syncConfigId: string;

        if (existingMapping) {
          syncConfigId = existingMapping.sync_config_id;
        } else {
          // 2. New event: find a writable sync config
          const syncConfig = await apiService.getEnabledSyncConfigForDatabase(databaseId);
          if (!syncConfig) return null;
          syncConfigId = syncConfig.id;
        }

        const result = await apiService.pushEvent(syncConfigId, actualDbUuid, rowId, eventData);
        return { meet_link: result.meet_link };
      } catch (error) {
        console.error('[GoogleCalendarStore] triggerSyncForEvent failed:', error);
        return null;
      }
    },

    async triggerDeleteForEvent(databaseId: string, rowId: string): Promise<void> {
      try {
        const syncConfig = await apiService.getEnabledSyncConfigForDatabase(databaseId);
        if (!syncConfig?.kodo_database_id) {
          return;
        }
        // Pass the UUID (from sync_config) instead of database_id text
        await apiService.deleteGoogleEvent(syncConfig.id, syncConfig.kodo_database_id, rowId);
      } catch (error) {
        console.error('[GoogleCalendarStore] triggerDeleteForEvent failed:', error);
      }
    },

    async handleOAuthCallback(code: string, state: string): Promise<void> {
      patchState(store, { connectionLoading: true });
      try {
        authService.validateOAuthState(state);
        await authService.handleCallback(code, state);
        const connection = await authService.getConnection();
        patchState(store, {
          connection,
          syncStatus: connection?.is_active ? 'idle' : 'disconnected',
          connectionLoading: false,
        });
      } catch (error) {
        patchState(store, { connectionLoading: false });
        throw error;
      }
    },
  })),
);
