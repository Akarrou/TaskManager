import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase';
import { from, Observable, throwError, forkJoin, of } from 'rxjs';
import { map, catchError, switchMap, tap } from 'rxjs/operators';
import {
  DatabaseRow,
  CellValue,
  DocumentDatabase,
  DatabaseColumn,
  DatabaseConfigExtended,
  LinkedItem,
} from '../../features/documents/models/database.model';
import { DatabaseService } from '../../features/documents/services/database.service';
import { EventCategory } from '../../shared/models/event-constants';

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
  private cacheExpiry = 5 * 60 * 1000; // 5 minutes

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
    return this.getDatabaseMetadata(databaseId).pipe(
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
  updateEvent(databaseId: string, rowId: string, updates: Partial<EventEntry>): Observable<EventEntry> {
    return this.getDatabaseMetadata(databaseId).pipe(
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

        return this.databaseService.updateRow(databaseId, rowId, cells).pipe(
          // After update, fetch the updated row to return normalized entry
          switchMap(() => this.databaseService.getRows({
            databaseId,
            limit: 1,
            offset: 0,
          })),
          map(rows => {
            const updatedRow = rows.find(r => r.id === rowId);
            if (!updatedRow) {
              throw new Error(`Updated row ${rowId} not found`);
            }
            return this.normalizeRowToEventEntry(updatedRow, dbMetadata);
          })
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
   * Get database metadata with caching
   */
  getDatabaseMetadata(databaseId: string): Observable<DocumentDatabase> {
    const cached = this.metadataCache.get(databaseId);
    if (cached) {
      return of(cached);
    }

    return this.databaseService.getDatabaseMetadata(databaseId).pipe(
      tap(metadata => {
        this.metadataCache.set(databaseId, metadata);
        // Clear cache after expiry
        setTimeout(() => this.metadataCache.delete(databaseId), this.cacheExpiry);
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

    const entry: EventEntry = {
      id: row.id,
      databaseId: databaseMetadata.database_id,
      databaseName: databaseMetadata.name,
      title: this.getCellValue(row, columnMapping, 'Title') as string || 'Sans titre',
      description: this.getCellValue(row, columnMapping, 'Description') as string,
      start_date: this.getCellValue(row, columnMapping, 'Start Date') as string || new Date().toISOString(),
      end_date: this.getCellValue(row, columnMapping, 'End Date') as string || new Date().toISOString(),
      all_day: (this.getCellValue(row, columnMapping, 'All Day') as boolean) ?? false,
      category: this.normalizeCategory(this.getCellValue(row, columnMapping, 'Category') as string),
      location: this.getCellValue(row, columnMapping, 'Location') as string,
      recurrence: this.getCellValue(row, columnMapping, 'Recurrence') as string,
      linked_items: this.getCellValue(row, columnMapping, 'Linked Items') as LinkedItem[],
      project_id: this.getCellValue(row, columnMapping, 'Project ID') as string,
      event_number: this.getCellValue(row, columnMapping, 'Event Number') as string,
      created_at: row.created_at,
      updated_at: row.updated_at,
      row_order: row.row_order,
    };

    return entry;
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
   * Normalize category value to EventCategory
   * Supports English and French labels
   */
  private normalizeCategory(value: string | null | undefined): EventCategory {
    if (!value) return 'other';

    const normalized = value.toLowerCase();

    switch (normalized) {
      case 'meeting':
      case 'réunion':
      case 'reunion':
        return 'meeting';
      case 'deadline':
      case 'échéance':
      case 'echeance':
        return 'deadline';
      case 'milestone':
      case 'jalon':
        return 'milestone';
      case 'reminder':
      case 'rappel':
        return 'reminder';
      case 'personal':
      case 'personnel':
        return 'personal';
      case 'other':
      case 'autre':
        return 'other';
      default:
        console.warn(`Unknown category value: ${value}, defaulting to 'other'`);
        return 'other';
    }
  }
}
