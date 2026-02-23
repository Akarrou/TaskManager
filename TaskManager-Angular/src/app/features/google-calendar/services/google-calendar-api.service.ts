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

    return data.calendars as GoogleCalendarInfo[];
  }

  async triggerSync(syncConfigId: string): Promise<SyncResult> {
    const { data, error } = await this.client.functions.invoke('google-calendar-sync', {
      body: { sync_config_id: syncConfigId },
    });

    if (error) {
      throw new Error(`Failed to trigger sync: ${error.message}`);
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
        database_id: databaseId,
        row_id: rowId,
        event_data: eventData,
      },
    });

    if (error) {
      throw new Error(`Failed to push event: ${error.message}`);
    }

    return { google_event_id: data.google_event_id as string };
  }

  async deleteGoogleEvent(
    syncConfigId: string,
    databaseId: string,
    rowId: string,
  ): Promise<void> {
    const { error } = await this.client.functions.invoke('google-calendar-delete-event', {
      body: {
        sync_config_id: syncConfigId,
        database_id: databaseId,
        row_id: rowId,
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
    const { data, error } = await this.client
      .from('google_calendar_event_mapping')
      .select('*')
      .eq('kodo_database_id', databaseId)
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
    const { data, error } = await this.client
      .from('google_calendar_sync_config')
      .select('*')
      .eq('kodo_database_id', databaseId)
      .eq('is_enabled', true)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to get sync config for database: ${error.message}`);
    }

    return data as GoogleCalendarSyncConfig | null;
  }
}
