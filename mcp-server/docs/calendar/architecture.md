# Event System Architecture

## Overview

Kodo stores events in **event-type databases** — the same database engine used for tasks and generic tables, but with a standardized column set and calendar-specific features. Each event database is backed by a physical PostgreSQL table (`database_<uuid>`) with dynamic `col_<uuid>` columns.

## Database-First Design

Events are **database rows**, not a separate entity. This means:

- Events live in `document_databases` with `config.type = "event"`
- Each event row has a linked **document** (Notion-style) for rich content
- Events are accessed via the same `database_<uuid>` physical tables as any other database
- Column values are stored in `col_<uuid>` columns, mapped by the `config.columns` array

## Standard Event Columns (13)

Every event database is created with these columns:

| # | Column Name   | Type         | Visible | Readonly | Description |
|---|---------------|-------------|---------|----------|-------------|
| 1 | Title         | text        | yes     | yes      | Event name (isNameColumn) |
| 2 | Description   | text        | yes     | yes      | Plain text description |
| 3 | Start Date    | datetime    | yes     | yes      | ISO 8601 start |
| 4 | End Date      | datetime    | yes     | yes      | ISO 8601 end |
| 5 | All Day       | checkbox    | yes     | yes      | Boolean flag |
| 6 | Category      | select      | yes     | yes      | Category key (see `categories` doc) |
| 7 | Location      | text        | yes     | no       | Free text location |
| 8 | Recurrence    | text        | no      | no       | RRULE string (see `recurrence` doc) |
| 9 | Linked Items  | linked-items| yes     | no       | Array of linked tasks/documents/databases |
| 10| Project ID    | text        | no      | no       | Associated project UUID |
| 11| Event Number  | text        | yes     | yes      | Auto-generated EVT-XXXX (see `event-numbers` doc) |
| 12| Color         | text        | no      | yes      | Hex color from Google Calendar sync |
| 13| Google Meet   | url         | yes     | yes      | Google Meet conference link |

## Physical Storage

Column values are stored in columns named `col_<uuid>` where `<uuid>` is the column's `id` from `config.columns`, with hyphens replaced by underscores.

Example: a column with `id: "a1b2c3d4-e5f6-..."` is stored as `col_a1b2c3d4_e5f6_...` in the physical table.

## Event Lifecycle

1. **Creation**: `create_event` inserts a row in the physical table + creates a linked document
2. **Event Number**: Auto-generated via PostgreSQL sequence `get_next_event_number()` (format: EVT-XXXX)
3. **Google Sync**: If Google Calendar sync is active, the event is pushed to Google via edge function
4. **Update**: `update_event` patches individual `col_<uuid>` columns + takes a snapshot for undo
5. **Deletion**: `delete_event` removes the row + propagates to Google Calendar if sync is active

## MCP Tool Mapping

| Tool | Operation |
|------|-----------|
| `list_events` | Aggregates events from all event databases |
| `create_event` | Inserts row + creates linked document |
| `get_event` | Reads a specific event by database_id + row_id |
| `get_event_by_number` | Searches by EVT-XXXX across all databases |
| `get_event_document` | Returns the linked Notion-style document |
| `update_event` | Patches specified fields with snapshot |
| `delete_event` | Removes row with snapshot |

## Related Documentation

- `categories` — Category system and custom categories
- `linked-items` — Linked items format and usage
- `google-calendar-sync` — Google Calendar integration
- `event-numbers` — Event numbering system
- `recurrence` — Recurrence rules
