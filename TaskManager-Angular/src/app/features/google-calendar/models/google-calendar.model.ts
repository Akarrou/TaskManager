export interface GoogleCalendarConnection {
  id: string;
  user_id: string;
  google_email: string;
  is_active: boolean;
  connected_at: string;
  last_sync_at: string | null;
}

export interface GoogleCalendarSyncConfig {
  id: string;
  connection_id: string;
  google_calendar_id: string;
  google_calendar_name: string;
  kodo_database_id: string | null;
  sync_direction: SyncDirection;
  is_enabled: boolean;
  last_sync_at: string | null;
}

export type SyncDirection = 'to_google' | 'from_google' | 'bidirectional';

export interface GoogleCalendarEventMapping {
  id: string;
  sync_config_id: string;
  kodo_database_id: string;
  kodo_row_id: string;
  google_event_id: string;
  google_calendar_id: string;
  sync_status: SyncStatus;
  last_error: string | null;
}

export type SyncStatus = 'synced' | 'pending' | 'conflict' | 'error';

export interface GoogleCalendarInfo {
  id: string;
  summary: string;
  backgroundColor: string;
  primary: boolean;
  accessRole: string;
}

export interface SyncResult {
  events_created: number;
  events_updated: number;
  events_deleted: number;
  events_skipped: number;
  errors: SyncError[];
  status: 'success' | 'partial' | 'error';
}

export interface SyncError {
  event_id: string;
  message: string;
  timestamp: string;
}

export interface ConflictInfo {
  mapping_id: string;
  kodo_event: Record<string, unknown>;
  google_event: Record<string, unknown>;
  field_diffs: FieldDiff[];
}

export interface FieldDiff {
  field: string;
  kodo_value: unknown;
  google_value: unknown;
}

export interface GoogleCalendarReminder {
  method: 'popup' | 'email';
  minutes: number;
}
