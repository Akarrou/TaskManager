# Google Calendar Sync

## Overview

Kodo integrates with Google Calendar for bidirectional event synchronization. The sync is managed through Supabase edge functions and is configured per-calendar via the Angular settings UI. **MCP tools cannot trigger sync directly** — sync is initiated from the Angular frontend only.

## Architecture

### Database Tables (4)

| Table | Purpose |
|-------|---------|
| `google_calendar_connections` | OAuth connection per user (tokens, email, active flag) |
| `google_calendar_sync_config` | Per-calendar sync configuration (direction, enabled, linked database) |
| `google_calendar_event_mapping` | Maps Kodo rows to Google event IDs for incremental sync |
| `google_calendar_sync_log` | Audit log of sync operations with results |

### Edge Functions (3)

| Function | Direction | Description |
|----------|-----------|-------------|
| `google-calendar-sync` | Google → Kodo | Full or incremental sync using Google sync tokens |
| `google-calendar-push-event` | Kodo → Google | Push a single event create/update to Google |
| `google-calendar-delete-event` | Kodo → Google | Delete a Google Calendar event |

### Supporting Function

| Function | Description |
|----------|-------------|
| `google-calendar-list-calendars` | List user's Google calendars for configuration |

## Sync Directions

Each sync config has a `sync_direction`:

| Direction | Behavior |
|-----------|----------|
| `from_google` | Import Google events to Kodo (read-only) |
| `to_google` | Push Kodo events to Google Calendar |
| `bidirectional` | Both directions (full two-way sync) |

## Auto-Create Database

When a sync config has `kodo_database_id = null` (new calendar connection), the `google-calendar-sync` edge function **automatically creates** an event database:
1. Creates a document to host the database
2. Creates `document_databases` metadata with all 13 standard event columns
3. Creates the physical PostgreSQL table via `ensure_table_exists` RPC
4. Updates `sync_config.kodo_database_id` with the new database UUID

## Google Calendar Color Mapping

Google Calendar uses numeric color IDs (1-11). These are mapped to:

### Color ID to Hex

| ID | Name      | Hex     |
|----|-----------|---------|
| 1  | Lavande   | #7986cb |
| 2  | Sauge     | #33b679 |
| 3  | Raisin    | #8e24aa |
| 4  | Flamant   | #e67c73 |
| 5  | Banane    | #f6bf26 |
| 6  | Mandarine | #f4511e |
| 7  | Paon      | #039be5 |
| 8  | Graphite  | #616161 |
| 9  | Myrtille  | #3f51b5 |
| 10 | Basilic   | #0b8043 |
| 11 | Tomate    | #d50000 |

### Color ID to Category

| ID | Category  |
|----|-----------|
| 1  | meeting   |
| 2  | personal  |
| 3  | milestone |
| 4  | deadline  |
| 5  | reminder  |
| 6  | deadline  |
| 7  | meeting   |
| 8  | other     |
| 9  | meeting   |
| 10 | personal  |
| 11 | deadline  |

Events without a Google color ID use the calendar's default color (`calendar_color` field on sync config).

## Google Meet Integration

When creating or updating events with `add_google_meet: true`:
1. The push edge function adds `conferenceData.createRequest` to the Google API call
2. Google creates a Meet conference and returns the link
3. The Meet link is stored in the event's `Google Meet` column
4. If the column doesn't exist (older databases), it's auto-created via migration

The Meet link is extracted from `conferenceData.entryPoints[type=video].uri` or `hangoutLink` as fallback.

## FullCalendar Rendering

Events synced from Google Calendar may have a `color` field (hex). When present:
- `backgroundColor` is set to a pastel version (75% white blend)
- `borderColor` is set to the original hex
- `textColor` is darkened to 30%
- CSS class `google-event` is applied instead of `category-<key>`

## MCP Limitations

- **No direct sync trigger**: MCP tools cannot initiate Google Calendar sync
- **Read-only access**: MCP can read events that were synced from Google, but changes via `update_event` will not automatically propagate to Google Calendar
- **Delete propagation**: When deleting events via the Angular app, deletion propagates to Google Calendar. MCP `delete_event` does not trigger this propagation
- **Sync status**: Use `list_events` to see the current state of synced events in Kodo

## Sync Token Strategy

The sync uses Google's incremental sync tokens:
1. First sync: full fetch with `timeMin` (3 months ago) and `timeMax` (1 year future)
2. Subsequent syncs: use `syncToken` from previous response for incremental updates
3. If token expires (HTTP 410), the token is cleared and a full sync is triggered
