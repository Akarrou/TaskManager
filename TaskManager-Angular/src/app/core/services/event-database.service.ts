import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase';
import { from, Observable, throwError, forkJoin, of, concat, toArray } from 'rxjs';
import { map, catchError, switchMap, tap } from 'rxjs/operators';
import {
  DatabaseRow,
  CellValue,
  DocumentDatabase,
  DatabaseColumn,
  DatabaseConfigExtended,
  LinkedItem,
  ColumnType,
  PropertyColor,
} from '../../features/documents/models/database.model';
import { DatabaseService } from '../../features/documents/services/database.service';
import { EventCategory, DEFAULT_CATEGORIES } from '../../shared/models/event-constants';
import { GoogleCalendarReminder } from '../../features/google-calendar/models/google-calendar.model';
import { EventAttendee, EventGuestPermissions } from '../../shared/models/attendee.model';

/**
 * EventEntry - Normalized event entry from database rows
 * Compatible with calendar views while supporting database-based events
 */
export interface EventEntry {
  // Identifiers
  id: string;                    // Database row ID
  databaseId: string;            // Source database ID
  databaseName: string;          // Database display name

  // Standard event properties (mapped from columns)
  title: string;
  description?: string;
  start_date: string;            // ISO 8601 with time
  end_date: string;
  all_day: boolean;
  category: EventCategory;
  location?: string;
  recurrence?: string;           // RRULE string
  linked_items?: LinkedItem[];
  project_id?: string;
  event_number?: string;

  // Attendees
  attendees?: EventAttendee[];
  guest_permissions?: EventGuestPermissions;

  // Google Calendar sync
  google_event_id?: string;
  reminders?: GoogleCalendarReminder[];
  meet_link?: string;
  color?: string;

  // Metadata
  created_at: string;
  updated_at: string;
  row_order: number;
}

/**
 * EventDatabaseService
 *
 * Service responsible for aggregating and normalizing event entries from all event-type databases.
 * Provides a unified interface for querying events across multiple database sources.
 */
@Injectable({
  providedIn: 'root',
})
export class EventDatabaseService {
  private supabase = inject(SupabaseService);
  private databaseService = inject(DatabaseService);

  private get client() {
    return this.supabase.client;
  }

  // Metadata cache for performance optimization
  private metadataCache = new Map<string, DocumentDatabase>();
  private cacheTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private cacheExpiry = 5 * 60 * 1000; // 5 minutes

  // Required columns that must exist on event databases
  private readonly REQUIRED_EVENT_COLUMNS: Array<{
    name: string;
    type: ColumnType;
    visible: boolean;
    readonly: boolean;
    width: number;
    color: PropertyColor;
  }> = [
    { name: 'Google Meet', type: 'url', visible: true, readonly: true, width: 250, color: 'green' },
    { name: 'Color', type: 'text', visible: false, readonly: true, width: 120, color: 'gray' },
    { name: 'Attendees', type: 'json', visible: false, readonly: true, width: 250, color: 'blue' },
  ];

  // =====================================================================
  // Public API Methods
  // =====================================================================

  /**
   * Get all event-type databases
   * Queries document_databases table for databases with config.type = 'event'
   */
  getAllEventDatabases(): Observable<DocumentDatabase[]> {
    return from(
      this.client
        .from('document_databases')
        .select('*')
        .is('deleted_at', null)
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[getAllEventDatabases] Error:', error);
          throw error;
        }

        // Filter for event-type databases
        return (data || []).filter((db: DocumentDatabase) => {
          const config = db.config as DatabaseConfigExtended;
          return config?.type === 'event';
        });
      }),
      catchError((err) => {
        console.error('[getAllEventDatabases] Failed to fetch event databases:', err);
        return throwError(() => new Error(`Failed to fetch event databases: ${err.message}`));
      })
    );
  }

  /**
   * Get event entries for a given date range
   * Aggregates rows from all event databases and filters by date range client-side
   */
  getEventEntriesForDateRange(start: string, end: string, projectId?: string): Observable<EventEntry[]> {
    return this.getAllEventDatabases().pipe(
      switchMap(databases => {
        if (databases.length === 0) {
          return of([]);
        }

        // Query rows from each database in parallel
        const rowQueries = databases.map(db =>
          this.databaseService.getRows({
            databaseId: db.database_id,
            limit: 1000,
            offset: 0,
          }).pipe(
            map(rows => ({
              database: db,
              rows,
            })),
            catchError(err => {
              console.error(`[getEventEntriesForDateRange] Error fetching rows from database ${db.name}:`, err);
              return of({ database: db, rows: [] as DatabaseRow[] });
            })
          )
        );

        return forkJoin(rowQueries);
      }),
      map(results => {
        const entries: EventEntry[] = [];

        if (Array.isArray(results)) {
          results.forEach((result: { database: DocumentDatabase; rows: DatabaseRow[] }) => {
            const normalized = result.rows.map((row: DatabaseRow) =>
              this.normalizeRowToEventEntry(row, result.database)
            );
            entries.push(...normalized);
          });
        }

        // Filter by date range client-side
        const startDate = new Date(start);
        const endDate = new Date(end);

        const filtered = entries.filter(entry => {
          const entryStart = new Date(entry.start_date);
          const entryEnd = new Date(entry.end_date);

          // Event overlaps with the requested range
          return entryStart <= endDate && entryEnd >= startDate;
        });

        // Filter by project if specified
        const projectFiltered = projectId
          ? filtered.filter(entry => entry.project_id === projectId)
          : filtered;

        // Sort by start_date ascending
        return projectFiltered.sort((a, b) =>
          new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
        );
      }),
      catchError(err => {
        console.error('[getEventEntriesForDateRange] Failed to aggregate event entries:', err);
        return of([]);
      })
    );
  }

  /**
   * Create a new event in a specific database
   */
  createEvent(databaseId: string, eventData: Partial<EventEntry>): Observable<EventEntry> {
    return this.ensureEventColumns(databaseId).pipe(
      switchMap(dbMetadata => {
        const columnMapping = this.getColumnMapping(dbMetadata.config.columns);
        const cells: Record<string, CellValue> = {};

        // Map EventEntry fields to column IDs
        if (eventData.title && columnMapping['Title']) {
          cells[columnMapping['Title']] = eventData.title;
        }
        if (eventData.description && columnMapping['Description']) {
          cells[columnMapping['Description']] = eventData.description;
        }
        if (eventData.start_date && columnMapping['Start Date']) {
          cells[columnMapping['Start Date']] = eventData.start_date;
        }
        if (eventData.end_date && columnMapping['End Date']) {
          cells[columnMapping['End Date']] = eventData.end_date;
        }
        if (eventData.all_day !== undefined && columnMapping['All Day']) {
          cells[columnMapping['All Day']] = eventData.all_day;
        }
        if (eventData.category && columnMapping['Category']) {
          cells[columnMapping['Category']] = eventData.category;
        }
        if (eventData.location && columnMapping['Location']) {
          cells[columnMapping['Location']] = eventData.location;
        }
        if (eventData.recurrence && columnMapping['Recurrence']) {
          cells[columnMapping['Recurrence']] = eventData.recurrence;
        }
        if (eventData.linked_items && columnMapping['Linked Items']) {
          cells[columnMapping['Linked Items']] = eventData.linked_items;
        }
        if (eventData.project_id && columnMapping['Project ID']) {
          cells[columnMapping['Project ID']] = eventData.project_id;
        }
        if (eventData.reminders && columnMapping['Reminders']) {
          cells[columnMapping['Reminders']] = JSON.stringify(eventData.reminders);
        }
        if (eventData.meet_link && columnMapping['Google Meet']) {
          cells[columnMapping['Google Meet']] = eventData.meet_link;
        }
        if ((eventData.attendees || eventData.guest_permissions) && columnMapping['Attendees']) {
          cells[columnMapping['Attendees']] = JSON.stringify({
            attendees: eventData.attendees ?? [],
            permissions: eventData.guest_permissions ?? {},
          });
        }

        return this.databaseService.addRow({
          databaseId,
          cells,
          row_order: eventData.row_order ?? 0,
        }).pipe(
          map(row => this.normalizeRowToEventEntry(row, dbMetadata))
        );
      }),
      catchError(err => {
        console.error('[createEvent] Failed to create event:', err);
        return throwError(() => new Error(`Failed to create event: ${err.message}`));
      })
    );
  }

  /**
   * Update an existing event in a specific database
   */
  updateEvent(databaseId: string, rowId: string, updates: Partial<EventEntry>): Observable<Partial<EventEntry> & { id: string; databaseId: string; databaseName: string; updated_at: string }> {
    return this.ensureEventColumns(databaseId).pipe(
      switchMap(dbMetadata => {
        const columnMapping = this.getColumnMapping(dbMetadata.config.columns);
        const cells: Record<string, CellValue> = {};

        // Map updated fields to column IDs
        if (updates.title !== undefined && columnMapping['Title']) {
          cells[columnMapping['Title']] = updates.title;
        }
        if (updates.description !== undefined && columnMapping['Description']) {
          cells[columnMapping['Description']] = updates.description ?? null;
        }
        if (updates.start_date !== undefined && columnMapping['Start Date']) {
          cells[columnMapping['Start Date']] = updates.start_date;
        }
        if (updates.end_date !== undefined && columnMapping['End Date']) {
          cells[columnMapping['End Date']] = updates.end_date;
        }
        if (updates.all_day !== undefined && columnMapping['All Day']) {
          cells[columnMapping['All Day']] = updates.all_day;
        }
        if (updates.category !== undefined && columnMapping['Category']) {
          cells[columnMapping['Category']] = updates.category;
        }
        if (updates.location !== undefined && columnMapping['Location']) {
          cells[columnMapping['Location']] = updates.location ?? null;
        }
        if (updates.recurrence !== undefined && columnMapping['Recurrence']) {
          cells[columnMapping['Recurrence']] = updates.recurrence ?? null;
        }
        if (updates.linked_items !== undefined && columnMapping['Linked Items']) {
          cells[columnMapping['Linked Items']] = updates.linked_items ?? null;
        }
        if (updates.project_id !== undefined && columnMapping['Project ID']) {
          cells[columnMapping['Project ID']] = updates.project_id ?? null;
        }
        if (updates.reminders !== undefined && columnMapping['Reminders']) {
          cells[columnMapping['Reminders']] = updates.reminders ? JSON.stringify(updates.reminders) : null;
        }
        if (updates.meet_link !== undefined && columnMapping['Google Meet']) {
          cells[columnMapping['Google Meet']] = updates.meet_link ?? null;
        }
        if ((updates.attendees !== undefined || updates.guest_permissions !== undefined) && columnMapping['Attendees']) {
          // For partial updates, merge with existing data to avoid overwriting
          const bothProvided = updates.attendees !== undefined && updates.guest_permissions !== undefined;
          if (bothProvided) {
            cells[columnMapping['Attendees']] = JSON.stringify({
              attendees: updates.attendees ?? [],
              permissions: updates.guest_permissions ?? {},
            });
          } else {
            // Only one field provided — need to read existing row to merge
            return this.databaseService.getRowById(databaseId, rowId).pipe(
              switchMap(existingRow => {
                const existingValue = existingRow ? this.getCellValue(existingRow, columnMapping, 'Attendees') : null;
                const existing = this.parseAttendees(existingValue);
                cells[columnMapping['Attendees']] = JSON.stringify({
                  attendees: updates.attendees ?? existing.attendees ?? [],
                  permissions: updates.guest_permissions ?? existing.guest_permissions ?? {},
                });
                return this.databaseService.updateRow(databaseId, rowId, cells).pipe(
                  map(() => {
                    const now = new Date().toISOString();
                    const result: Partial<EventEntry> & { id: string; databaseId: string; databaseName: string; updated_at: string } = {
                      id: rowId,
                      databaseId,
                      databaseName: dbMetadata.name,
                      updated_at: now,
                    };
                    if (updates.title !== undefined) result.title = updates.title;
                    if (updates.description !== undefined) result.description = updates.description;
                    if (updates.start_date !== undefined) result.start_date = updates.start_date;
                    if (updates.end_date !== undefined) result.end_date = updates.end_date;
                    if (updates.all_day !== undefined) result.all_day = updates.all_day;
                    if (updates.category !== undefined) result.category = updates.category;
                    if (updates.location !== undefined) result.location = updates.location;
                    if (updates.recurrence !== undefined) result.recurrence = updates.recurrence;
                    if (updates.linked_items !== undefined) result.linked_items = updates.linked_items;
                    if (updates.project_id !== undefined) result.project_id = updates.project_id;
                    if (updates.event_number !== undefined) result.event_number = updates.event_number;
                    if (updates.reminders !== undefined) result.reminders = updates.reminders;
                    if (updates.meet_link !== undefined) result.meet_link = updates.meet_link;
                    if (updates.attendees !== undefined) result.attendees = updates.attendees;
                    if (updates.guest_permissions !== undefined) result.guest_permissions = updates.guest_permissions;
                    return result;
                  }),
                );
              }),
            );
          }
        }

        return this.databaseService.updateRow(databaseId, rowId, cells).pipe(
          map(() => {
            // Return only the fields that were actually updated.
            // The CalendarStore merges these onto the existing event in state,
            // so omitting a field here preserves the existing value.
            const now = new Date().toISOString();
            const result: Partial<EventEntry> & { id: string; databaseId: string; databaseName: string; updated_at: string } = {
              id: rowId,
              databaseId,
              databaseName: dbMetadata.name,
              updated_at: now,
            };

            if (updates.title !== undefined) result.title = updates.title;
            if (updates.description !== undefined) result.description = updates.description;
            if (updates.start_date !== undefined) result.start_date = updates.start_date;
            if (updates.end_date !== undefined) result.end_date = updates.end_date;
            if (updates.all_day !== undefined) result.all_day = updates.all_day;
            if (updates.category !== undefined) result.category = updates.category;
            if (updates.location !== undefined) result.location = updates.location;
            if (updates.recurrence !== undefined) result.recurrence = updates.recurrence;
            if (updates.linked_items !== undefined) result.linked_items = updates.linked_items;
            if (updates.project_id !== undefined) result.project_id = updates.project_id;
            if (updates.event_number !== undefined) result.event_number = updates.event_number;
            if (updates.reminders !== undefined) result.reminders = updates.reminders;
            if (updates.meet_link !== undefined) result.meet_link = updates.meet_link;
            if (updates.attendees !== undefined) result.attendees = updates.attendees;
            if (updates.guest_permissions !== undefined) result.guest_permissions = updates.guest_permissions;

            return result;
          }),
        );
      }),
      catchError(err => {
        console.error('[updateEvent] Failed to update event:', err);
        return throwError(() => new Error(`Failed to update event: ${err.message}`));
      })
    );
  }

  /**
   * Delete an event from a specific database
   */
  deleteEvent(databaseId: string, rowId: string): Observable<void> {
    return this.databaseService.deleteRows({
      databaseId,
      rowIds: [rowId],
    }).pipe(
      map(() => undefined),
      catchError(err => {
        console.error('[deleteEvent] Failed to delete event:', err);
        return throwError(() => new Error(`Failed to delete event: ${err.message}`));
      })
    );
  }

  /**
   * Get a single event by database ID and row ID
   */
  getEventById(databaseId: string, rowId: string): Observable<EventEntry | null> {
    return this.getDatabaseMetadata(databaseId).pipe(
      switchMap(dbMetadata =>
        this.databaseService.getRowById(databaseId, rowId).pipe(
          map(row => row ? this.normalizeRowToEventEntry(row, dbMetadata) : null),
        ),
      ),
      catchError(err => {
        console.error('[getEventById] Failed:', err);
        return of(null);
      }),
    );
  }

  /**
   * Get database metadata with caching
   */
  getDatabaseMetadata(databaseId: string): Observable<DocumentDatabase> {
    const cached = this.metadataCache.get(databaseId);
    if (cached) {
      return of(cached);
    }

    return this.databaseService.getDatabaseMetadata(databaseId).pipe(
      tap(metadata => {
        this.setCacheWithTimer(databaseId, metadata);
      })
    );
  }

  /**
   * Invalidate cached metadata for a database
   */
  invalidateMetadataCache(databaseId: string): void {
    this.metadataCache.delete(databaseId);
  }

  /**
   * Ensure all required event columns exist on the database.
   * Idempotent: if columns already exist, does a single metadata fetch and returns.
   * When columns are missing, adds them sequentially then re-fetches metadata.
   */
  ensureEventColumns(databaseId: string): Observable<DocumentDatabase> {
    // Always fetch fresh metadata (bypass cache)
    this.metadataCache.delete(databaseId);

    return this.databaseService.getDatabaseMetadata(databaseId).pipe(
      switchMap(metadata => {
        const existingColumnNames = new Set(metadata.config.columns.map(c => c.name));
        const missingColumns = this.REQUIRED_EVENT_COLUMNS.filter(
          col => !existingColumnNames.has(col.name)
        );

        if (missingColumns.length === 0) {
          // All columns present — update cache and return
          this.setCacheWithTimer(databaseId, metadata);
          return of(metadata);
        }

        // Add missing columns sequentially
        const maxOrder = Math.max(...metadata.config.columns.map(c => c.order), -1);
        const addOps = missingColumns.map((col, index) => {
          const column: DatabaseColumn = {
            id: crypto.randomUUID(),
            name: col.name,
            type: col.type,
            visible: col.visible,
            readonly: col.readonly,
            width: col.width,
            color: col.color,
            order: maxOrder + 1 + index,
          };
          return this.databaseService.addColumn({ databaseId, column });
        });

        return concat(...addOps).pipe(
          toArray(),
          switchMap(() => {
            // Re-fetch fresh metadata after adding columns
            return this.databaseService.getDatabaseMetadata(databaseId).pipe(
              tap(freshMetadata => {
                this.setCacheWithTimer(databaseId, freshMetadata);
              })
            );
          })
        );
      }),
      catchError(err => {
        console.error('[ensureEventColumns] Failed:', err);
        return throwError(() => err);
      })
    );
  }

  // =====================================================================
  // Private Helper Methods
  // =====================================================================

  /**
   * Normalize a database row to EventEntry
   */
  private normalizeRowToEventEntry(row: DatabaseRow, databaseMetadata: DocumentDatabase): EventEntry {
    const columnMapping = this.getColumnMapping(databaseMetadata.config.columns);

    const rawAttendees = this.getCellValue(row, columnMapping, 'Attendees');
    const parsedAttendees = this.parseAttendees(rawAttendees);
    const meetLink = this.getCellValue(row, columnMapping, 'Google Meet') as string;

    const entry: EventEntry = {
      id: row.id,
      databaseId: databaseMetadata.database_id,
      databaseName: databaseMetadata.name,
      title: this.getCellValue(row, columnMapping, 'Title') as string || 'Sans titre',
      description: this.getCellValue(row, columnMapping, 'Description') as string,
      start_date: (() => { const startDateFallback = new Date().toISOString(); return this.getCellValue(row, columnMapping, 'Start Date') as string || startDateFallback; })(),
      end_date: (() => { const startRaw = this.getCellValue(row, columnMapping, 'Start Date') as string; const endRaw = this.getCellValue(row, columnMapping, 'End Date') as string; if (endRaw) return endRaw; const startDate = startRaw ? new Date(startRaw) : new Date(); return new Date(startDate.getTime() + 60 * 60 * 1000).toISOString(); })(),
      all_day: (this.getCellValue(row, columnMapping, 'All Day') as boolean) ?? false,
      category: this.normalizeCategory(this.getCellValue(row, columnMapping, 'Category') as string),
      location: this.getCellValue(row, columnMapping, 'Location') as string,
      recurrence: this.getCellValue(row, columnMapping, 'Recurrence') as string,
      linked_items: (() => { const rawLinkedItems = this.getCellValue(row, columnMapping, 'Linked Items'); return Array.isArray(rawLinkedItems) ? rawLinkedItems as LinkedItem[] : []; })(),
      project_id: this.getCellValue(row, columnMapping, 'Project ID') as string,
      event_number: this.getCellValue(row, columnMapping, 'Event Number') as string,
      reminders: this.parseReminders(this.getCellValue(row, columnMapping, 'Reminders') as string),
      meet_link: meetLink,
      ...parsedAttendees,
      color: (this.getCellValue(row, columnMapping, 'Color') as string) || undefined,
      created_at: row.created_at,
      updated_at: row.updated_at,
      row_order: row.row_order,
    };

    return entry;
  }

  /**
   * Set a metadata cache entry and schedule its expiry,
   * clearing any previously scheduled timer for the same key.
   */
  private setCacheWithTimer(databaseId: string, metadata: DocumentDatabase): void {
    const existingTimer = this.cacheTimers.get(databaseId);
    if (existingTimer !== undefined) {
      clearTimeout(existingTimer);
    }
    this.metadataCache.set(databaseId, metadata);
    const timer = setTimeout(() => {
      this.metadataCache.delete(databaseId);
      this.cacheTimers.delete(databaseId);
    }, this.cacheExpiry);
    this.cacheTimers.set(databaseId, timer);
  }

  /**
   * Get cell value by column name
   */
  private getCellValue(row: DatabaseRow, columnMapping: Record<string, string>, columnName: string): CellValue {
    const columnId = columnMapping[columnName];
    return columnId ? row.cells[columnId] : null;
  }

  /**
   * Map column names to their IDs
   */
  private getColumnMapping(columns: DatabaseColumn[]): Record<string, string> {
    const mapping: Record<string, string> = {};
    columns.forEach(col => {
      mapping[col.name] = col.id;
    });
    return mapping;
  }

  /**
   * Normalize category value to EventCategory key
   * Maps French labels to English keys for backwards compatibility,
   * passes unknown values through as-is (custom categories).
   */
  private normalizeCategory(value: string | null | undefined): EventCategory {
    if (!value) return 'other';

    const normalized = value.toLowerCase();

    // French → English mapping for default categories
    const frenchToEnglish: Record<string, string> = {
      'réunion': 'meeting',
      'reunion': 'meeting',
      'échéance': 'deadline',
      'echeance': 'deadline',
      'jalon': 'milestone',
      'rappel': 'reminder',
      'personnel': 'personal',
      'autre': 'other',
    };

    // Check French mapping first
    if (frenchToEnglish[normalized]) {
      return frenchToEnglish[normalized];
    }

    // Check if it's a known default category key
    if (DEFAULT_CATEGORIES.some(c => c.key === normalized)) {
      return normalized;
    }

    // Pass through as-is (custom category or unknown)
    return normalized;
  }

  /**
   * Parse attendees from JSONB value
   */
  private parseAttendees(value: CellValue): { attendees?: EventAttendee[]; guest_permissions?: EventGuestPermissions } {
    if (!value) return {};
    try {
      const data = typeof value === 'string' ? JSON.parse(value) : value;
      return {
        attendees: Array.isArray(data.attendees) ? data.attendees : undefined,
        guest_permissions: data.permissions ?? undefined,
      };
    } catch {
      return {};
    }
  }

  /**
   * Parse reminders from JSON string
   */
  private parseReminders(value: string | null | undefined): GoogleCalendarReminder[] | undefined {
    if (!value) return undefined;
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
}
