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

/**
 * TaskEntry - Normalized task entry from database rows
 * Compatible with existing dashboard views while supporting database-based tasks
 */
export interface TaskEntry {
  // Identifiers
  id: string;                    // Database row ID
  databaseId: string;            // Source database ID
  databaseName: string;          // Database display name

  // Standard task properties (mapped from columns)
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  priority: 'low' | 'medium' | 'high' | 'critical';
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
    const pending = entries.filter(e => e.status === 'pending').length;
    const inProgress = entries.filter(e => e.status === 'in_progress').length;
    const completed = entries.filter(e => e.status === 'completed').length;
    const blocked = entries.filter(e => e.status === 'blocked').length;
    const completionRate = total > 0 ? (completed / total) * 100 : 0;

    return {
      total,
      pending,
      inProgress,
      completed,
      blocked,
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
      // Fields not available in database tasks
      slug: '',
      prd_slug: '',
      environment: [],
      guideline_refs: [],
      created_by: undefined,
      completed_at: entry.status === 'completed' ? entry.updated_at : undefined,
      task_number: undefined,
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
   */
  private normalizeStatus(value: string | null | undefined): TaskEntry['status'] {
    if (!value) return 'pending';

    const normalized = value.toLowerCase().replace(/\s+/g, '-');

    switch (normalized) {
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
      case 'blocked':
      case 'bloquée':
        return 'blocked';
      default:
        return 'pending';
    }
  }

  /**
   * Normalize priority value to TaskEntry priority enum
   */
  private normalizePriority(value: string | null | undefined): TaskEntry['priority'] {
    if (!value) return 'medium';

    const normalized = value.toLowerCase();

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
        return 'high';
      case 'critical':
      case 'critique':
      case 'urgent':
        return 'critical';
      default:
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
      'Parent Task ID', 'Epic ID', 'Feature ID', 'Project ID'
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
   */
  private mapStatusToLegacy(status: TaskEntry['status']): Task['status'] {
    switch (status) {
      case 'pending':
        return 'pending';
      case 'in_progress':
        return 'in_progress';
      case 'completed':
        return 'completed';
      case 'blocked':
        return 'cancelled'; // Map blocked to cancelled as legacy doesn't have blocked
      default:
        return 'pending';
    }
  }

  /**
   * Map TaskEntry priority to legacy Task priority
   */
  private mapPriorityToLegacy(priority: TaskEntry['priority']): Task['priority'] {
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
