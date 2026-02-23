# Recurrence Rules

## Overview

Events can have a `recurrence` field containing an **RRULE string** following the [RFC 5545](https://datatracker.ietf.org/doc/html/rfc5545#section-3.3.10) specification. This defines how an event repeats over time.

## Format

RRULE strings follow the pattern:

```
FREQ=<frequency>;[INTERVAL=<n>];[BYDAY=<days>];[BYMONTH=<months>];[COUNT=<n>];[UNTIL=<date>]
```

## Common Examples

| Pattern | RRULE |
|---------|-------|
| Every day | `FREQ=DAILY` |
| Every weekday | `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR` |
| Every week | `FREQ=WEEKLY` |
| Every Monday and Wednesday | `FREQ=WEEKLY;BYDAY=MO,WE` |
| Every 2 weeks | `FREQ=WEEKLY;INTERVAL=2` |
| Every month | `FREQ=MONTHLY` |
| First Monday of each month | `FREQ=MONTHLY;BYDAY=1MO` |
| Every year | `FREQ=YEARLY` |
| Every day for 10 occurrences | `FREQ=DAILY;COUNT=10` |
| Every week until Dec 31, 2025 | `FREQ=WEEKLY;UNTIL=20251231T235959Z` |

## Frequency Values

| Value     | Description |
|-----------|-------------|
| `DAILY`   | Repeats every day |
| `WEEKLY`  | Repeats every week |
| `MONTHLY` | Repeats every month |
| `YEARLY`  | Repeats every year |

## Key Properties

| Property   | Description | Example |
|------------|-------------|---------|
| `FREQ`     | Frequency (required) | `FREQ=WEEKLY` |
| `INTERVAL` | Repeat every N periods | `INTERVAL=2` (every 2 weeks) |
| `BYDAY`    | Days of the week | `BYDAY=MO,WE,FR` |
| `BYMONTH`  | Months of the year | `BYMONTH=1,6` (Jan, Jun) |
| `BYMONTHDAY` | Day of the month | `BYMONTHDAY=15` |
| `COUNT`    | Total number of occurrences | `COUNT=10` |
| `UNTIL`    | End date (ISO format) | `UNTIL=20251231T235959Z` |

## FullCalendar Rendering

The Angular app uses FullCalendar's RRULE plugin to render recurring events:

1. The `recurrence` string is set as `event.rrule`
2. If the RRULE doesn't include `DTSTART`, one is prepended from the event's `start_date`
3. `duration` is calculated from `start_date` and `end_date` difference
4. FullCalendar expands the RRULE into individual occurrences on the calendar

### DTSTART Format

When prepended automatically:
```
DTSTART:20241215T140000Z
FREQ=WEEKLY;BYDAY=MO,WE,FR
```

The date is converted to the format `YYYYMMDDTHHMMSSZ` (no separators).

## Google Calendar Sync

### From Google to Kodo

Google Calendar stores recurrence as an array (e.g., `["RRULE:FREQ=WEEKLY;BYDAY=MO"]`). During sync, multiple rules are joined with newlines:
```typescript
recurrence = event.recurrence.join('\n')
```

### From Kodo to Google

When pushing events to Google, the recurrence string is wrapped in an array:
```typescript
googleEvent.recurrence = [eventData.recurrence]
```

## MCP Usage

### Creating a recurring event

```
create_event({
  database_id: "db-...",
  title: "Weekly Standup",
  start_date: "2024-12-02T09:00:00Z",
  end_date: "2024-12-02T09:15:00Z",
  recurrence: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
  category: "meeting"
})
```

### Updating recurrence

```
update_event({
  database_id: "db-...",
  row_id: "...",
  recurrence: "FREQ=WEEKLY;BYDAY=MO,WE,FR"
})
```

### Removing recurrence

Set recurrence to an empty string to make a recurring event one-time:
```
update_event({
  database_id: "db-...",
  row_id: "...",
  recurrence: ""
})
```
