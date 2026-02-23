# Linked Items

## Overview

Events can reference other Kodo entities (tasks, documents, database rows) via the `linked_items` field. This creates a bidirectional association displayed in both the event detail panel and the linked entity.

## LinkedItem Format

```typescript
interface LinkedItem {
  type: string;        // "task" | "document" | "database"
  id: string;          // UUID of the linked entity
  databaseId?: string; // Required for type "database" — the database_id (db-uuid format)
  label?: string;      // Display label (optional, used for UI rendering)
}
```

## Valid Types

| Type       | Description | `id` refers to | `databaseId` required? |
|------------|-------------|----------------|----------------------|
| `task`     | A task from any task database | Task row UUID | No |
| `document` | A Kodo document | Document UUID | No |
| `database` | A row in a database | Database row UUID | Yes (db-uuid format) |

## Semantics

### Replace, Not Append

When updating `linked_items` via `update_event`, the provided array **replaces** the entire existing array. To add an item, read the current items first, append the new one, and send the full array.

### Example

```json
{
  "linked_items": [
    {
      "type": "task",
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "label": "Prepare presentation slides"
    },
    {
      "type": "document",
      "id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      "label": "Meeting notes template"
    },
    {
      "type": "database",
      "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "databaseId": "db-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "label": "Q4 Budget Row"
    }
  ]
}
```

## Storage

Linked items are stored as a JSON array in the `Linked Items` column (`col_<uuid>`) of the event database row. The column type is `linked-items`.

## MCP Usage

### Creating an event with linked items

```
create_event({
  database_id: "db-...",
  title: "Sprint Review",
  start_date: "2024-12-15T14:00:00Z",
  end_date: "2024-12-15T15:00:00Z",
  linked_items: [
    { type: "task", id: "...", label: "User story #42" },
    { type: "document", id: "...", label: "Sprint report" }
  ]
})
```

### Updating linked items

```
// First, get current event to read existing linked_items
get_event({ database_id: "db-...", row_id: "..." })

// Then update with the full new array
update_event({
  database_id: "db-...",
  row_id: "...",
  linked_items: [
    ...existingItems,
    { type: "task", id: "new-task-id", label: "New task" }
  ]
})
```

## Angular "Add to Event" Dialog

The Angular app provides an "Add to Event" dialog that lets users link tasks, documents, and database items to calendar events. This dialog searches across all user entities and creates the `LinkedItem` objects automatically.
