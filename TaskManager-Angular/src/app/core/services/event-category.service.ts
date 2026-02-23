import { Injectable, inject } from '@angular/core';
import { from, Observable, throwError } from 'rxjs';
import { map, switchMap, catchError } from 'rxjs/operators';
import { SupabaseService } from './supabase';
import { CategoryDefinition } from '../../shared/models/event-constants';

interface EventCategoryRow {
  id: string;
  user_id: string;
  key: string;
  label: string;
  color_key: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

@Injectable({ providedIn: 'root' })
export class EventCategoryService {
  private supabase = inject(SupabaseService);

  private get client() {
    return this.supabase.client;
  }

  getCustomCategories(): Observable<CategoryDefinition[]> {
    return from(
      this.client
        .from('event_categories')
        .select('*')
        .order('sort_order', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data as EventCategoryRow[]).map(row => this.toCategoryDefinition(row));
      }),
      catchError(err => throwError(() => new Error(`Failed to load custom categories: ${err.message}`))),
    );
  }

  addCategory(params: { key: string; label: string; colorKey: string; sortOrder: number }): Observable<CategoryDefinition> {
    return from(this.client.auth.getUser()).pipe(
      switchMap(({ data: authData, error: authError }) => {
        if (authError || !authData.user) {
          return throwError(() => new Error('User not authenticated'));
        }
        return from(
          this.client
            .from('event_categories')
            .insert({
              user_id: authData.user.id,
              key: params.key,
              label: params.label,
              color_key: params.colorKey,
              sort_order: params.sortOrder,
            })
            .select()
            .single()
        ).pipe(
          map(({ data, error }) => {
            if (error) throw new Error(`Failed to create category: ${error.message}`);
            return this.toCategoryDefinition(data as EventCategoryRow);
          }),
        );
      }),
      catchError(err => throwError(() => err instanceof Error ? err : new Error(String(err)))),
    );
  }

  updateCategory(key: string, updates: { label?: string; colorKey?: string }): Observable<CategoryDefinition> {
    return from(this.client.auth.getUser()).pipe(
      switchMap(({ data: authData, error: authError }) => {
        if (authError || !authData.user) {
          return throwError(() => new Error('User not authenticated'));
        }

        const updateData: Record<string, string> = {};
        if (updates.label !== undefined) updateData['label'] = updates.label;
        if (updates.colorKey !== undefined) updateData['color_key'] = updates.colorKey;

        return from(
          this.client
            .from('event_categories')
            .update(updateData)
            .eq('user_id', authData.user.id)
            .eq('key', key)
            .select()
            .single()
        ).pipe(
          map(({ data, error }) => {
            if (error) throw new Error(`Failed to update category: ${error.message}`);
            return this.toCategoryDefinition(data as EventCategoryRow);
          }),
        );
      }),
      catchError(err => throwError(() => err instanceof Error ? err : new Error(String(err)))),
    );
  }

  deleteCategory(key: string): Observable<void> {
    return from(this.client.auth.getUser()).pipe(
      switchMap(({ data: authData, error: authError }) => {
        if (authError || !authData.user) {
          return throwError(() => new Error('User not authenticated'));
        }
        return from(
          this.client
            .from('event_categories')
            .delete()
            .eq('user_id', authData.user.id)
            .eq('key', key)
        ).pipe(
          map(({ error }) => {
            if (error) throw new Error(`Failed to delete category: ${error.message}`);
          }),
        );
      }),
      catchError(err => throwError(() => err instanceof Error ? err : new Error(String(err)))),
    );
  }

  private toCategoryDefinition(row: EventCategoryRow): CategoryDefinition {
    return {
      key: row.key,
      label: row.label,
      colorKey: row.color_key,
      isDefault: false,
      sortOrder: row.sort_order,
    };
  }
}
