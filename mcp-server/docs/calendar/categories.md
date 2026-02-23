# Event Categories

## Overview

Events have a `category` field that determines their label and color in calendar views. Kodo supports both **default categories** (built-in) and **custom categories** (user-created, stored in the `event_categories` table).

## Default Categories (6)

| Key        | Label     | Color Key | Hex Color |
|------------|-----------|-----------|-----------|
| `meeting`  | Réunion   | blue      | #3b82f6   |
| `deadline` | Échéance  | red       | #ef4444   |
| `milestone`| Jalon     | purple    | #8b5cf6   |
| `reminder` | Rappel    | yellow    | #eab308   |
| `personal` | Personnel | green     | #22c55e   |
| `other`    | Autre     | indigo    | #6366f1   |

These categories are always available and cannot be deleted.

## Custom Categories

Users can create custom categories via the event form dialog. Custom categories are stored in the `event_categories` Supabase table:

```
event_categories
├── id          (UUID, PK)
├── user_id     (UUID, FK → auth.users)
├── key         (text, unique per user)
├── label       (text)
├── color_key   (text, references palette)
├── created_at  (timestamptz)
└── updated_at  (timestamptz)
```

### Key Generation

Category keys are generated from labels using `slugify()`:
1. Convert to lowercase
2. Remove diacritics (NFD normalization)
3. Replace non-alphanumeric characters with hyphens
4. Trim leading/trailing hyphens

Example: `"Reunion d'equipe"` → `"reunion-d-equipe"`

## Color Palette (12 colors)

Both default and custom categories use the same 12-color palette:

| Key    | Hex     | Background | Text     |
|--------|---------|------------|----------|
| blue   | #3b82f6 | #dbeafe    | #1e40af  |
| red    | #ef4444 | #fee2e2    | #991b1b  |
| purple | #8b5cf6 | #ede9fe    | #5b21b6  |
| yellow | #eab308 | #fef9c3    | #854d0e  |
| green  | #22c55e | #dcfce7    | #166534  |
| gray   | #6b7280 | #f3f4f6    | #374151  |
| orange | #f97316 | #ffedd5    | #9a3412  |
| teal   | #14b8a6 | #ccfbf1    | #115e59  |
| pink   | #ec4899 | #fce7f3    | #9d174d  |
| indigo | #6366f1 | #e0e7ff    | #3730a3  |
| cyan   | #06b6d4 | #cffafe    | #155e75  |
| rose   | #f43f5e | #ffe4e6    | #9f1239  |

## MCP Usage

The `category` parameter in `create_event` and `update_event` accepts **any string value** — both default category keys and custom category keys are valid. The MCP server does not enforce the enum; it stores whatever value is provided.

When creating events via MCP, use one of the 6 default keys listed above, or query the user's custom categories if applicable.

## FullCalendar Rendering

In the Angular calendar view:
- Each category maps to a CSS class `category-<key>` for styling
- Colors are resolved via `getCategoryColors()` and `getCategoryHexColor()`
- Events with a Google Calendar `color` field use inline hex colors instead of category CSS classes
