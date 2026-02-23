import { Injectable, inject } from '@angular/core';

import { SupabaseService } from '../../../core/services/supabase';
import {
  GoogleCalendarEventMapping,
  GoogleCalendarInfo,
  GoogleCalendarSyncConfig,
  SyncResult,
} from '../models/google-calendar.model';

@Injectable({
  providedIn: 'root',
})
export class GoogleCalendarApiService {
  private supabase = inject(SupabaseService);

  private get client() {
    return this.supabase.client;
  }

  async listCalendars(): Promise<GoogleCalendarInfo[]> {
    const { data, error } = await this.client.functions.invoke('google-calendar-list-calendars');

    if (error) {
      throw new Error(`Failed to list calendars: ${error.message}`);
    }

    if (!data || !Array.isArray(data.calendars)) {
      throw new Error('Invalid response from list calendars');
    }

    return data.calendars as GoogleCalendarInfo[];
  }

  async triggerSync(syncConfigId: string): Promise<SyncResult> {
    const { data, error } = await this.client.functions.invoke('google-calendar-sync', {
      body: { sync_config_id: syncConfigId },
    });

    if (error) {
      throw new Error(`Failed to trigger sync: ${error.message}`);
    }

    if (!data) {
      throw new Error('Invalid response from sync');
    }

    return data as SyncResult;
  }

  async pushEvent(
    syncConfigId: string,
    databaseId: string,
    rowId: string,
    eventData: Record<string, unknown>,
  ): Promise<{ google_event_id: string }> {
    const { data, error } = await this.client.functions.invoke('google-calendar-push-event', {
      body: {
        sync_config_id: syncConfigId,
        kodo_database_id: databaseId,
        kodo_row_id: rowId,
        event_data: eventData,
      },
    });

    if (error) {
      throw new Error(`Failed to push event: ${error.message}`);
    }

    if (!data || typeof data.google_event_id !== 'string') {
      throw new Error('Invalid response from push event');
    }

    return { google_event_id: data.google_event_id };
  }

  async deleteGoogleEvent(
    syncConfigId: string,
    databaseId: string,
    rowId: string,
  ): Promise<void> {
    const { error } = await this.client.functions.invoke('google-calendar-delete-event', {
      body: {
        sync_config_id: syncConfigId,
        kodo_database_id: databaseId,
        kodo_row_id: rowId,
      },
    });

    if (error) {
      throw new Error(`Failed to delete Google event: ${error.message}`);
    }
  }

  async getSyncConfigs(): Promise<GoogleCalendarSyncConfig[]> {
    const { data, error } = await this.client
      .from('google_calendar_sync_config')
      .select('*')
      .order('google_calendar_name');

    if (error) {
      throw new Error(`Failed to get sync configs: ${error.message}`);
    }

    return (data ?? []) as GoogleCalendarSyncConfig[];
  }

  async updateSyncConfig(id: string, changes: Partial<GoogleCalendarSyncConfig>): Promise<void> {
    const { error } = await this.client
      .from('google_calendar_sync_config')
      .update(changes)
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to update sync config: ${error.message}`);
    }
  }

  async createSyncConfig(
    config: Omit<GoogleCalendarSyncConfig, 'id'>,
  ): Promise<GoogleCalendarSyncConfig> {
    const { data, error } = await this.client
      .from('google_calendar_sync_config')
      .insert(config)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create sync config: ${error.message}`);
    }

    return data as GoogleCalendarSyncConfig;
  }

  async getEventMapping(
    databaseId: string,
    rowId: string,
  ): Promise<GoogleCalendarEventMapping | null> {
    // Resolve database_id (text, db-<uuid>) → document_databases.id (UUID)
    const dbUuid = await this.resolveDatabaseUuid(databaseId);
    if (!dbUuid) return null;

    const { data, error } = await this.client
      .from('google_calendar_event_mapping')
      .select('*')
      .eq('kodo_database_id', dbUuid)
      .eq('kodo_row_id', rowId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to get event mapping: ${error.message}`);
    }

    return data as GoogleCalendarEventMapping | null;
  }

  async getEnabledSyncConfigForDatabase(
    databaseId: string,
  ): Promise<GoogleCalendarSyncConfig | null> {
    // 1. Try exact match: resolve database_id → UUID, then match kodo_database_id
    const dbUuid = await this.resolveDatabaseUuid(databaseId);
    console.log('[GCal API] getEnabledSyncConfigForDatabase:', { databaseId, resolvedUuid: dbUuid });

    if (dbUuid) {
      const { data } = await this.client
        .from('google_calendar_sync_config')
        .select('*')
        .eq('kodo_database_id', dbUuid)
        .eq('is_enabled', true)
        .maybeSingle();

      if (data) {
        console.log('[GCal API] sync config found by exact match:', data);
        return data as GoogleCalendarSyncConfig;
      }
    }

    // 2. Fallback: find any enabled sync config with compatible direction
    //    Exclude read-only calendars (holidays, birthdays, etc.)
    //    (RLS ensures only the current user's configs are returned)
    const { data: fallbackList, error } = await this.client
      .from('google_calendar_sync_config')
      .select('*')
      .eq('is_enabled', true)
      .in('sync_direction', ['bidirectional', 'to_google']);

    // Prefer the user's primary calendar (email-like ID), exclude special Google calendars
    const writableConfigs = (fallbackList ?? []).filter((c: GoogleCalendarSyncConfig) =>
      !c.google_calendar_id.includes('#holiday') &&
      !c.google_calendar_id.includes('#contacts') &&
      !c.google_calendar_id.includes('#other') &&
      !c.google_calendar_id.endsWith('@group.v.calendar.google.com')
    );

    const fallback = writableConfigs[0] ?? null;
    console.log('[GCal API] sync config fallback result:', { data: fallback, allConfigs: fallbackList?.length, writableConfigs: writableConfigs.length, error: error?.message });

    if (error) {
      throw new Error(`Failed to get sync config for database: ${error.message}`);
    }

    return fallback as GoogleCalendarSyncConfig | null;
  }

  /**
   * Resolve a database_id (text, format db-<uuid>) to the
   * document_databases primary key UUID, which is what
   * kodo_database_id columns store.
   */
  private async resolveDatabaseUuid(databaseId: string): Promise<string | null> {
    console.log('[GCal API] resolveDatabaseUuid input:', databaseId);
    const { data, error } = await this.client
      .from('document_databases')
      .select('id')
      .eq('database_id', databaseId)
      .maybeSingle();

    const uuid = (data?.id as string) ?? null;
    console.log('[GCal API] resolveDatabaseUuid result:', { uuid, error: error?.message });
    return uuid;
  }
}
