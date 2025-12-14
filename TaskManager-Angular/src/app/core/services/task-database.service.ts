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
  Filter,
  SortOrder,
} from '../../features/documents/models/database.model';
import { DatabaseService } from '../../features/documents/services/database.service';
import { Task } from '../models/task.model';
import { TaskStatus, TaskPriority, LEGACY_STATUS_MAP, LEGACY_PRIORITY_MAP } from '../../shared/models/task-constants';

/**
 * TaskEntry - Normalized task entry from database rows
 * Compatible with existing dashboard views while supporting database-based tasks
 */
export interface TaskEntry {
  // Identifiers
  id: string;                    // Database row ID
  databaseId: string;            // Source database ID
  databaseName: string;          // Database display name
  task_number?: string;          // Formatted task number (e.g., "ID-0001")

  // Standard task properties (mapped from columns)
  title: string;
  description?: string;
  status: TaskStatus;            // Now using imported TaskStatus type
  priority: TaskPriority;        // Now using imported TaskPriority type
  type: 'epic' | 'feature' | 'task';
  assigned_to?: string;
  due_date?: string;
  tags?: string[];
  estimated_hours?: number;
  actual_hours?: number;

  // Relations (hidden columns from template)
  parent_task_id?: string;
  epic_id?: string;
  feature_id?: string;
  project_id?: string;

  // Metadata
  created_at: string;
  updated_at: string;
  row_order: number;

  // Extra properties for non-standard columns
  extraProperties?: Record<string, CellValue>;
}

/**
 * TaskStats - Aggregated statistics for task entries
 */
export interface TaskStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  blocked: number;
  backlog: number;        // NEW: Count of tasks in backlog
  awaitingInfo: number;   // NEW: Count of tasks awaiting information
  cancelled: number;      // NEW: Count of cancelled tasks
  completionRate: number;
}

/**
 * QueryParams - Parameters for querying task entries
 */
export interface QueryParams {
  filters?: TaskFilter[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/**
 * TaskFilter - Filter criteria for task entries
 */
export interface TaskFilter {
  property: string;
  operator: 'equals' | 'contains' | 'is_empty' | 'is_not_empty' | 'greater_than' | 'less_than' | 'starts_with' | 'ends_with';
  value: unknown;
}

/**
 * TaskDatabaseService
 *
 * Service responsible for aggregating and normalizing task entries from all task-type databases.
 * Provides a unified interface for querying tasks across multiple database sources.
 */
@Injectable({
  providedIn: 'root',
})
export class TaskDatabaseService {
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
   * Get all task-type databases
   * Queries document_databases table for databases with config.type = 'task'
   */
  getAllTaskDatabases(): Observable<DocumentDatabase[]> {
    return from(
      this.client
        .from('document_databases')
        .select('*')
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[getAllTaskDatabases] Error:', error);
          throw error;
        }

        // Filter for task-type databases
        return (data || []).filter((db: DocumentDatabase) => {
          const config = db.config as DatabaseConfigExtended;
          return config?.type === 'task';
        });
      }),
      catchError((err) => {
        console.error('[getAllTaskDatabases] Failed to fetch task databases:', err);
        return throwError(() => new Error(`Failed to fetch task databases: ${err.message}`));
      })
    );
  }

  /**
   * Get all task entries from all task databases
   * Aggregates rows from multiple databases and normalizes them to TaskEntry[]
   */
  getAllTaskEntries(params?: QueryParams): Observable<{ entries: TaskEntry[]; totalCount: number }> {
    return this.getAllTaskDatabases().pipe(
      switchMap(databases => {
        if (databases.length === 0) {
          return of({ entries: [], totalCount: 0 });
        }

        // Query rows from each database in parallel
        const rowQueries = databases.map(db =>
          this.databaseService.getRowsWithCount({
            databaseId: db.database_id,
            limit: params?.limit || 1000,
            offset: params?.offset || 0,
            filters: this.convertFiltersToDbFilters(params?.filters || [], db),
            sortBy: params?.sortBy,
            sortOrder: params?.sortOrder as SortOrder
          }).pipe(
            map(result => ({
              database: db,
              rows: result.rows,
              count: result.totalCount
            })),
            catchError(err => {
              console.error(`[getAllTaskEntries] Error fetching rows from database ${db.name}:`, err);
              // Return empty result for this database instead of failing entirely
              return of({ database: db, rows: [], count: 0 });
            })
          )
        );

        return forkJoin(rowQueries);
      }),
      map(results => {
        // Normalize all rows to TaskEntry
        const entries: TaskEntry[] = [];
        let totalCount = 0;

        if (Array.isArray(results)) {
          results.forEach((result: { database: DocumentDatabase; rows: DatabaseRow[]; count: number }) => {
            const normalized = result.rows.map((row: DatabaseRow) =>
              this.normalizeRowToTaskEntry(row, result.database)
            );
            entries.push(...normalized);
            totalCount += result.count;
          });
        }

        // Apply client-side sorting if needed (for cross-database sorting)
        const sorted = this.sortEntries(entries, params?.sortBy, params?.sortOrder);

        return { entries: sorted, totalCount };
      }),
      catchError(err => {
        console.error('[getAllTaskEntries] Failed to aggregate task entries:', err);
        return of({ entries: [], totalCount: 0 });
      })
    );
  }

  /**
   * Get task entries from a specific database
   */
  getTaskEntriesForDatabase(databaseId: string, params?: QueryParams): Observable<TaskEntry[]> {
    return this.getDatabaseMetadata(databaseId).pipe(
      switchMap(dbMetadata => {
        return this.databaseService.getRows({
          databaseId: databaseId,
          limit: params?.limit || 1000,
          offset: params?.offset || 0,
          filters: this.convertFiltersToDbFilters(params?.filters || [], dbMetadata),
          sortBy: params?.sortBy,
          sortOrder: params?.sortOrder as SortOrder
        }).pipe(
          map(rows => rows.map(row => this.normalizeRowToTaskEntry(row, dbMetadata)))
        );
      }),
      catchError(err => {
        console.error(`[getTaskEntriesForDatabase] Error for database ${databaseId}:`, err);
        return of([]);
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

  /**
   * Calculate statistics from task entries (client-side)
   * Keep for local filtering scenarios and backward compatibility
   */
  getTaskStats(entries: TaskEntry[]): TaskStats {
    const total = entries.length;
    const backlog = entries.filter(e => e.status === 'backlog').length;
    const pending = entries.filter(e => e.status === 'pending').length;
    const inProgress = entries.filter(e => e.status === 'in_progress').length;
    const completed = entries.filter(e => e.status === 'completed').length;
    const blocked = entries.filter(e => e.status === 'blocked').length;
    const awaitingInfo = entries.filter(e => e.status === 'awaiting_info').length;
    const cancelled = entries.filter(e => e.status === 'cancelled').length;
    const completionRate = total > 0 ? (completed / total) * 100 : 0;

    return {
      total,
      backlog,
      pending,
      inProgress,
      completed,
      blocked,
      awaitingInfo,
      cancelled,
      completionRate
    };
  }

  /**
   * Get task statistics from database using RPC aggregation
   * More performant than client-side filtering for large datasets
   * Uses Supabase RPC function 'get_task_stats_aggregated'
   *
   * @param projectId Optional project ID to filter tasks by project
   * @returns Observable of aggregated task statistics
   */
  getTaskStatsFromDatabase(projectId?: string): Observable<TaskStats> {
    return from(
      this.client.rpc('get_task_stats_aggregated', {
        p_project_id: projectId || null
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[getTaskStatsFromDatabase] RPC error:', error);
          throw error;
        }

        // Data is already in TaskStats format from RPC
        return data as TaskStats;
      }),
      catchError(err => {
        console.error('[getTaskStatsFromDatabase] Failed to fetch stats:', err);
        // Return empty stats on error instead of throwing
        return of({
          total: 0,
          pending: 0,
          inProgress: 0,
          completed: 0,
          blocked: 0,
          backlog: 0,
          awaitingInfo: 0,
          cancelled: 0,
          completionRate: 0
        });
      })
    );
  }

  /**
   * Convert TaskEntry to legacy Task interface for view component compatibility
   */
  convertEntryToLegacyTask(entry: TaskEntry): Task {
    return {
      id: entry.id,
      title: entry.title,
      description: entry.description,
      status: this.mapStatusToLegacy(entry.status),
      priority: this.mapPriorityToLegacy(entry.priority),
      assigned_to: entry.assigned_to,
      due_date: entry.due_date,
      created_at: entry.created_at,
      updated_at: entry.updated_at,
      tags: entry.tags,
      estimated_hours: entry.estimated_hours,
      actual_hours: entry.actual_hours,
      type: entry.type,
      parent_task_id: entry.parent_task_id,
      project_id: entry.project_id || '',
      epic_id: entry.epic_id,
      feature_id: entry.feature_id,
      task_number: entry.task_number,
      // Fields not available in database tasks
      slug: '',
      prd_slug: '',
      environment: [],
      guideline_refs: [],
      created_by: undefined,
      completed_at: entry.status === 'completed' ? entry.updated_at : undefined,
      subtasks: []
    };
  }

  // =====================================================================
  // Private Helper Methods
  // =====================================================================

  /**
   * Normalize a database row to TaskEntry
   */
  private normalizeRowToTaskEntry(row: DatabaseRow, databaseMetadata: DocumentDatabase): TaskEntry {
    const columnMapping = this.getColumnMapping(databaseMetadata.config.columns);

    const entry: TaskEntry = {
      id: row.id,
      databaseId: databaseMetadata.database_id,
      databaseName: databaseMetadata.name,
      task_number: this.getCellValue(row, columnMapping, 'Task Number') as string,
      title: this.getCellValue(row, columnMapping, 'Title') as string || 'Sans titre',
      description: this.getCellValue(row, columnMapping, 'Description') as string,
      status: this.normalizeStatus(this.getCellValue(row, columnMapping, 'Status') as string),
      priority: this.normalizePriority(this.getCellValue(row, columnMapping, 'Priority') as string),
      type: this.normalizeType(this.getCellValue(row, columnMapping, 'Type') as string),
      assigned_to: this.getCellValue(row, columnMapping, 'Assigned To') as string,
      due_date: this.getCellValue(row, columnMapping, 'Due Date') as string,
      tags: this.normalizeTags(this.getCellValue(row, columnMapping, 'Tags')),
      estimated_hours: this.getCellValue(row, columnMapping, 'Estimated Hours') as number,
      actual_hours: this.getCellValue(row, columnMapping, 'Actual Hours') as number,
      parent_task_id: this.getCellValue(row, columnMapping, 'Parent Task ID') as string,
      epic_id: this.getCellValue(row, columnMapping, 'Epic ID') as string,
      feature_id: this.getCellValue(row, columnMapping, 'Feature ID') as string,
      project_id: this.getCellValue(row, columnMapping, 'Project ID') as string,
      created_at: row.created_at,
      updated_at: row.updated_at,
      row_order: row.row_order,
      extraProperties: this.extractExtraProperties(row, columnMapping)
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
   * Normalize status value to TaskEntry status enum
   * Supports English, French, and legacy values for backward compatibility
   */
  private normalizeStatus(value: string | null | undefined): TaskStatus {
    if (!value) return 'pending';

    const normalized = value.toLowerCase().replace(/\s+/g, '-');

    // Check legacy mappings first
    if (LEGACY_STATUS_MAP[normalized]) {
      return LEGACY_STATUS_MAP[normalized];
    }

    // Direct mappings
    switch (normalized) {
      case 'backlog':
        return 'backlog';
      case 'pending':
      case 'en-attente':
      case 'à-faire':
      case 'todo':
        return 'pending';
      case 'in-progress':
      case 'en-cours':
      case 'in_progress':
        return 'in_progress';
      case 'completed':
      case 'terminée':
      case 'done':
        return 'completed';
      case 'cancelled':
      case 'annulée':
        return 'cancelled';
      case 'blocked':
      case 'bloquée':
        return 'blocked';
      case 'awaiting-info':
      case 'awaiting_info':
      case 'en-attente-d-infos':
        return 'awaiting_info';
      default:
        console.warn(`Unknown status value: ${value}, defaulting to 'pending'`);
        return 'pending';
    }
  }

  /**
   * Normalize priority value to TaskEntry priority enum
   * Supports English, French, and legacy values for backward compatibility
   */
  private normalizePriority(value: string | null | undefined): TaskPriority {
    if (!value) return 'medium';

    const normalized = value.toLowerCase();

    // Check legacy mappings first
    if (LEGACY_PRIORITY_MAP[normalized]) {
      return LEGACY_PRIORITY_MAP[normalized];
    }

    // Direct mappings
    switch (normalized) {
      case 'low':
      case 'faible':
      case 'basse':
        return 'low';
      case 'medium':
      case 'moyenne':
      case 'normal':
        return 'medium';
      case 'high':
      case 'haute':
      case 'élevée':
      case 'elevee':
        return 'high';
      case 'critical':
      case 'critique':
        return 'critical';
      default:
        console.warn(`Unknown priority value: ${value}, defaulting to 'medium'`);
        return 'medium';
    }
  }

  /**
   * Normalize type value to TaskEntry type enum
   */
  private normalizeType(value: string | null | undefined): TaskEntry['type'] {
    if (!value) return 'task';

    const normalized = value.toLowerCase();

    switch (normalized) {
      case 'epic':
        return 'epic';
      case 'feature':
      case 'fonctionnalité':
        return 'feature';
      case 'task':
      case 'tâche':
        return 'task';
      default:
        return 'task';
    }
  }

  /**
   * Normalize tags value to string array
   */
  private normalizeTags(value: CellValue): string[] | undefined {
    if (!value) return undefined;

    // Handle multi-select (already an array)
    if (Array.isArray(value)) {
      return value.map(v => String(v));
    }

    // Handle comma-separated string
    if (typeof value === 'string') {
      return value.split(',').map(t => t.trim()).filter(t => t.length > 0);
    }

    return undefined;
  }

  /**
   * Extract non-standard column values
   */
  private extractExtraProperties(row: DatabaseRow, columnMapping: Record<string, string>): Record<string, CellValue> {
    const standardColumns = [
      'Title', 'Description', 'Status', 'Priority', 'Type',
      'Assigned To', 'Due Date', 'Tags', 'Estimated Hours', 'Actual Hours',
      'Parent Task ID', 'Epic ID', 'Feature ID', 'Project ID', 'Task Number'
    ];

    const extraProps: Record<string, CellValue> = {};

    // Reverse mapping: columnId -> columnName
    const idToName: Record<string, string> = {};
    Object.entries(columnMapping).forEach(([name, id]) => {
      idToName[id] = name;
    });

    // Extract values for non-standard columns
    Object.entries(row.cells).forEach(([columnId, value]) => {
      const columnName = idToName[columnId];
      if (columnName && !standardColumns.includes(columnName)) {
        extraProps[columnName] = value;
      }
    });

    return Object.keys(extraProps).length > 0 ? extraProps : {} as Record<string, CellValue>;
  }

  /**
   * Convert TaskFilter[] to database Filter[]
   */
  private convertFiltersToDbFilters(filters: TaskFilter[], dbMetadata: DocumentDatabase): Filter[] {
    const columnMapping = this.getColumnMapping(dbMetadata.config.columns);
    const dbFilters: Filter[] = [];

    filters.forEach(filter => {
      const columnId = columnMapping[this.propertyToColumnName(filter.property)];
      if (columnId) {
        dbFilters.push({
          columnId: columnId,
          operator: filter.operator,
          value: filter.value
        });
      }
    });

    return dbFilters;
  }

  /**
   * Map TaskEntry property names to database column names
   */
  private propertyToColumnName(property: string): string {
    const mapping: Record<string, string> = {
      'task_number': 'Task Number',
      'title': 'Title',
      'description': 'Description',
      'status': 'Status',
      'priority': 'Priority',
      'type': 'Type',
      'assigned_to': 'Assigned To',
      'due_date': 'Due Date',
      'tags': 'Tags',
      'estimated_hours': 'Estimated Hours',
      'actual_hours': 'Actual Hours',
      'parent_task_id': 'Parent Task ID',
      'epic_id': 'Epic ID',
      'feature_id': 'Feature ID',
      'project_id': 'Project ID'
    };

    return mapping[property] || property;
  }

  /**
   * Sort task entries
   */
  private sortEntries(entries: TaskEntry[], sortBy?: string, sortOrder?: string): TaskEntry[] {
    if (!sortBy) return entries;

    return [...entries].sort((a, b) => {
      const aValue = this.getPropertyValue(a, sortBy);
      const bValue = this.getPropertyValue(b, sortBy);

      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;

      let comparison = 0;
      if (aValue < bValue) comparison = -1;
      if (aValue > bValue) comparison = 1;

      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }

  /**
   * Get property value for sorting
   */
  private getPropertyValue(entry: TaskEntry, property: string): unknown {
    const value = (entry as unknown as Record<string, unknown>)[property];
    return value;
  }

  /**
   * Map TaskEntry status to legacy Task status
   * Now preserves all status values since Task type supports them
   */
  private mapStatusToLegacy(status: TaskStatus): Task['status'] {
    switch (status) {
      case 'backlog':
        return 'backlog';
      case 'pending':
        return 'pending';
      case 'in_progress':
        return 'in_progress';
      case 'completed':
        return 'completed';
      case 'blocked':
        return 'blocked';
      case 'cancelled':
        return 'cancelled';
      case 'awaiting_info':
        return 'awaiting_info';
      default:
        return 'pending';
    }
  }

  /**
   * Map TaskEntry priority to legacy Task priority
   * Maps new priority values to legacy format for backward compatibility
   */
  private mapPriorityToLegacy(priority: TaskPriority): Task['priority'] {
    switch (priority) {
      case 'low':
        return 'low';
      case 'medium':
        return 'medium';
      case 'high':
        return 'high';
      case 'critical':
        return 'urgent'; // Map critical to urgent as legacy uses 'urgent'
      default:
        return 'medium';
    }
  }
}
