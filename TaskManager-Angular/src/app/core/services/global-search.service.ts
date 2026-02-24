import { Injectable, inject } from '@angular/core';
import { Observable, from, forkJoin, of } from 'rxjs';
import { map, switchMap, catchError } from 'rxjs/operators';
import { SupabaseService } from './supabase';
import { SearchResult, SearchResponse } from '../../shared/models/search.model';
import { DatabaseConfigExtended } from '../../features/documents/models/database.model';

interface DatabaseRecord {
  database_id: string;
  name: string;
  config: DatabaseConfigExtended;
}

interface FulltextResult {
  id: string;
  title: string;
  excerpt: string;
  parent_id: string | null;
  project_id: string | null;
  rank: number;
  updated_at: string;
}

/** Escape special PostgREST filter characters in user input */
function escapePostgrestValue(value: string): string {
  return value.replace(/[,()\\"]/g, '\\$&');
}

@Injectable({
  providedIn: 'root',
})
export class GlobalSearchService {
  private supabase = inject(SupabaseService);

  private get client() {
    return this.supabase.client;
  }

  search(query: string, limit = 10): Observable<SearchResponse> {
    return from(this.client.auth.getUser()).pipe(
      switchMap(({ data: { user } }) => {
        if (!user) {
          return of({ documents: [], tasks: [], events: [], total: 0 });
        }

        return forkJoin({
          documents: this.searchDocuments(user.id, query, limit),
          tasks: this.searchDatabaseType('task', query, limit),
          events: this.searchDatabaseType('event', query, limit),
        }).pipe(
          map(({ documents, tasks, events }) => ({
            documents,
            tasks,
            events,
            total: documents.length + tasks.length + events.length,
          }))
        );
      })
    );
  }

  private searchDocuments(userId: string, query: string, limit: number): Observable<SearchResult[]> {
    return from(
      this.client.rpc('search_documents_fulltext', {
        p_user_id: userId,
        p_query: query,
        p_project_id: null,
        p_limit: limit,
        p_offset: 0,
      })
    ).pipe(
      map(({ data, error }) => {
        if (error || !data) return [];

        return (data as FulltextResult[]).map((doc) => ({
          id: doc.id,
          type: 'document' as const,
          title: doc.title || 'Sans titre',
          subtitle: this.cleanExcerpt(doc.excerpt),
          icon: 'description',
          navigateTo: '/documents/' + doc.id,
          updatedAt: doc.updated_at,
        }));
      }),
      catchError(() => of([]))
    );
  }

  private searchDatabaseType(
    dbType: 'task' | 'event',
    query: string,
    limit: number
  ): Observable<SearchResult[]> {
    return from(this.client.from('document_databases').select('*')).pipe(
      switchMap(({ data, error }) => {
        if (error || !data) return of([]);

        const databases = (data as DatabaseRecord[]).filter((db) => {
          const config = db.config;
          return config?.type === dbType;
        });

        if (databases.length === 0) return of([]);

        const queries = databases.map((db) => this.searchInDatabase(db, dbType, query, limit));
        return forkJoin(queries).pipe(
          map((results) => results.flat().slice(0, limit))
        );
      }),
      catchError(() => of([]))
    );
  }

  private searchInDatabase(
    db: DatabaseRecord,
    dbType: 'task' | 'event',
    query: string,
    limit: number
  ): Observable<SearchResult[]> {
    const columns = db.config.columns || [];
    const titleCol = columns.find((c) => c.name === 'Title');
    const textTypes = new Set(['text', 'select', 'url', 'email']);
    const textCols = columns.filter((c) => textTypes.has(c.type));

    if (!titleCol || textCols.length === 0) return of([]);

    const tableName = `database_${db.database_id.replace('db-', '').replace(/-/g, '_')}`;

    const safeQuery = escapePostgrestValue(query);
    const orParts = textCols.map((c) =>
      `col_${c.id.replace(/-/g, '_')}.ilike.%${safeQuery}%`
    );

    // If query looks like a date (DD/MM/YYYY or YYYY-MM-DD), add date column filters
    const isoDate = this.parseToIsoDate(query);
    if (isoDate) {
      const dateCols = columns.filter((c) => c.type === 'date' || c.type === 'datetime');
      for (const c of dateCols) {
        const colName = `col_${c.id.replace(/-/g, '_')}`;
        if (c.type === 'datetime') {
          orParts.push(`and(${colName}.gte.${isoDate}T00:00:00,${colName}.lte.${isoDate}T23:59:59)`);
        } else {
          orParts.push(`${colName}.eq.${isoDate}`);
        }
      }
    }

    const orFilter = orParts.join(',');

    return from(
      this.client
        .from(tableName)
        .select('*')
        .is('deleted_at', null)
        .or(orFilter)
        .limit(limit)
    ).pipe(
      map(({ data: rows, error }) => {
        if (error || !rows) return [];

        const getCell = (row: Record<string, unknown>, colName: string): string | null => {
          const col = columns.find((c) => c.name === colName);
          if (!col) return null;
          return row[`col_${col.id.replace(/-/g, '_')}`] as string | null;
        };

        return (rows as Record<string, unknown>[]).map((row) => {
          const title = getCell(row, 'Title') || 'Sans titre';

          if (dbType === 'task') {
            const status = getCell(row, 'Status');
            return {
              id: row['id'] as string,
              type: 'task' as const,
              title,
              subtitle: status || undefined,
              icon: 'task_alt',
              navigateTo: '/bdd/' + db.database_id,
              databaseId: db.database_id,
              updatedAt: row['updated_at'] as string,
            };
          }

          const startDate = getCell(row, 'Start Date');
          return {
            id: row['id'] as string,
            type: 'event' as const,
            title,
            subtitle: startDate ? new Date(startDate).toLocaleDateString('fr-FR') : undefined,
            icon: 'event',
            navigateTo: '/calendar',
            databaseId: db.database_id,
            updatedAt: row['updated_at'] as string,
          };
        });
      }),
      catchError(() => of([]))
    );
  }

  private cleanExcerpt(excerpt: string): string {
    if (!excerpt) return '';
    return excerpt.replace(/>>>/g, '').replace(/<<</g, '').trim();
  }

  /** Try to parse a date string (DD/MM/YYYY or YYYY-MM-DD) into ISO format YYYY-MM-DD */
  private parseToIsoDate(query: string): string | null {
    const trimmed = query.trim();

    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    // DD/MM/YYYY
    const frMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (frMatch) {
      const day = frMatch[1].padStart(2, '0');
      const month = frMatch[2].padStart(2, '0');
      const year = frMatch[3];
      return `${year}-${month}-${day}`;
    }

    return null;
  }
}
