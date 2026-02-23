# Event System Architecture

## Overview

Kodo stores events in **event-type databases** — the same database engine used for tasks and generic tables, but with a standardized column set and calendar-specific features. Each event database is backed by a physical PostgreSQL table (`database_<uuid>`) with dynamic `col_<uuid>` columns.

## Database-First Design

Events are **database rows**, not a separate entity. This means:

- Events live in `document_databases` with `config.type = "event"`
- Each event row has a linked **document** (Notion-style) for rich content
- Events are accessed via the same `database_<uuid>` physical tables as any other database
- Column values are stored in `col_<uuid>` columns, mapped by the `config.columns` array

## Standard Event Columns (15)

Every event database is created with these columns:

| # | Column Name   | Type         | Visible | Readonly | PG Type    | Description |
|---|---------------|-------------|---------|----------|------------|-------------|
| 1 | Title         | text        | yes     | yes      | TEXT       | Event name (isNameColumn) |
| 2 | Description   | text        | yes     | yes      | TEXT       | Plain text description |
| 3 | Start Date    | datetime    | yes     | yes      | TIMESTAMPTZ| ISO 8601 start |
| 4 | End Date      | datetime    | yes     | yes      | TIMESTAMPTZ| ISO 8601 end |
| 5 | All Day       | checkbox    | yes     | yes      | BOOLEAN    | Boolean flag |
| 6 | Category      | select      | yes     | yes      | TEXT       | Category key (see `categories` doc) |
| 7 | Location      | text        | yes     | no       | TEXT       | Free text location |
| 8 | Recurrence    | text        | no      | no       | TEXT       | RRULE string (see `recurrence` doc) |
| 9 | Linked Items  | linked-items| yes     | no       | JSONB      | Array of linked tasks/documents/databases |
| 10| Project ID    | text        | no      | no       | TEXT       | Associated project UUID |
| 11| Event Number  | text        | yes     | yes      | TEXT       | Auto-generated EVT-XXXX (see `event-numbers` doc) |
| 12| Color         | text        | no      | yes      | TEXT       | Hex color from Google Calendar sync |
| 13| Google Meet   | url         | yes     | yes      | TEXT       | Google Meet conference link |
| 14| Attendees     | json        | no      | yes      | JSONB      | Attendees + guest permissions (see below) |
| 15| Reminders     | json        | no      | no       | JSONB      | Array of reminders (see below) |

## Physical Storage

Column values are stored in columns named `col_<uuid>` where `<uuid>` is the column's `id` from `config.columns`, with hyphens replaced by underscores.

Example: a column with `id: "a1b2c3d4-e5f6-..."` is stored as `col_a1b2c3d4_e5f6_...` in the physical table.

**Important — JSON string encoding**: Columns 14 (Attendees) and 15 (Reminders) use JSONB PostgreSQL type but store values as **JSON-stringified strings** (to match Angular's format). Always use `JSON.stringify()` before storing and `JSON.parse()` when reading.

## Attendees and Guest Permissions

The `Attendees` column stores both the attendee list and guest permissions as a single JSON-stringified object:

```json
{
  "attendees": [
    {
      "email": "user@example.com",
      "displayName": "John Doe",
      "userId": "kodo-user-id",
      "rsvpStatus": "accepted",
      "isOrganizer": true,
      "isOptional": false
    }
  ],
  "permissions": {
    "guestsCanModify": false,
    "guestsCanInviteOthers": true,
    "guestsCanSeeOtherGuests": true
  }
}
```

**RSVP statuses**: `accepted`, `declined`, `tentative`, `needsAction`

**Default permissions** (applied when attendees are set without explicit permissions):
- `guestsCanModify: false`
- `guestsCanInviteOthers: true`
- `guestsCanSeeOtherGuests: true`

**MCP parameters**: Use `attendees` (array) and `guest_permissions` (object) in `create_event` / `update_event`. They are merged into the single Attendees column automatically.

**Partial updates**: When updating only `attendees` or only `guest_permissions`, the other field is preserved from existing data.

## Reminders

The `Reminders` column stores an array of reminder objects (JSON-stringified):

```json
[
  { "method": "popup", "minutes": 15 },
  { "method": "email", "minutes": 60 }
]
```

- **method**: `"popup"` (browser notification) or `"email"` (email notification)
- **minutes**: How many minutes before the event to trigger the reminder

## Event Lifecycle

1. **Creation**: `create_event` inserts a row in the physical table + creates a linked document
2. **Event Number**: Auto-generated via PostgreSQL sequence `get_next_event_number()` (format: EVT-XXXX)
3. **Google Sync**: If Google Calendar sync is active, the event is pushed to Google via edge function
4. **Update**: `update_event` patches individual `col_<uuid>` columns + takes a snapshot for undo
5. **Deletion**: `delete_event` soft-deletes the row (sets `deleted_at`) + inserts into `trash_items` + propagates to Google Calendar if sync is active

## MCP Tool Mapping

| Tool | Operation |
|------|-----------|
| `list_events` | Aggregates events from all event databases |
| `create_event` | Inserts row + creates linked document |
| `get_event` | Reads a specific event by database_id + row_id |
| `get_event_by_number` | Searches by EVT-XXXX across all databases |
| `get_event_document` | Returns the linked Notion-style document |
| `update_event` | Patches specified fields with snapshot |
| `delete_event` | Soft-deletes row + moves to trash with snapshot |
| `list_event_categories` | Lists default + custom event categories |
| `create_event_category` | Creates a custom event category |
| `update_event_category` | Updates a custom event category |
| `delete_event_category` | Deletes a custom event category |

## Related Documentation

- `categories` — Category system and custom categories
- `linked-items` — Linked items format and usage
- `google-calendar-sync` — Google Calendar integration
- `event-numbers` — Event numbering system
- `recurrence` — Recurrence rules
