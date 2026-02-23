import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase';
import { from, Observable, throwError, of } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import { TrashItem, TrashItemType } from '../models/trash.model';

@Injectable({
  providedIn: 'root',
})
export class TrashService {
  private supabase = inject(SupabaseService);

  private get client() {
    return this.supabase.client;
  }

  /**
   * Soft delete an item: sets deleted_at on original table + inserts into trash_items
   */
  softDelete(
    itemType: TrashItemType,
    itemId: string,
    tableName: string,
    displayName: string,
    parentInfo?: Record<string, string>,
  ): Observable<TrashItem> {
    const now = new Date().toISOString();

    // 0. Get current user ID for RLS compliance
    return from(this.client.auth.getUser()).pipe(
      switchMap(({ data: authData, error: authError }) => {
        if (authError || !authData.user) {
          return throwError(() => new Error('User not authenticated'));
        }
        const userId = authData.user.id;

        // 1. Update deleted_at on the original table
        return from(
          this.client
            .from(tableName)
            .update({ deleted_at: now })
            .eq('id', itemId),
        ).pipe(
          switchMap(({ error: updateError }) => {
            if (updateError) {
              console.error('[TrashService.softDelete] Update error:', updateError);
              return throwError(() => new Error(`Failed to mark item as deleted: ${updateError.message}`));
            }

            // 2. Insert into trash_items
            return from(
              this.client
                .from('trash_items')
                .insert({
                  item_type: itemType,
                  item_id: itemId,
                  item_table: tableName,
                  display_name: displayName,
                  parent_info: parentInfo ?? null,
                  user_id: userId,
                  deleted_at: now,
                })
                .select()
                .single(),
            );
          }),
        );
      }),
      map(({ data, error }) => {
        if (error) {
          console.error('[TrashService.softDelete] Insert error:', error);
          throw error;
        }
        return data as TrashItem;
      }),
      catchError((err) => {
        console.error('[TrashService.softDelete] Error:', err);
        return throwError(() => new Error(`Soft delete failed: ${err.message}`));
      }),
    );
  }

  /**
   * Insert into trash_items only (deleted_at already set by another service).
   * Used when the caller has already set deleted_at on the original table.
   */
  softDeleteTrashOnly(
    itemType: TrashItemType,
    itemId: string,
    tableName: string,
    displayName: string,
    parentInfo?: Record<string, string>,
  ): Observable<TrashItem> {
    const now = new Date().toISOString();

    return from(this.client.auth.getUser()).pipe(
      switchMap(({ data: authData, error: authError }) => {
        if (authError || !authData.user) {
          return throwError(() => new Error('User not authenticated'));
        }

        return from(
          this.client
            .from('trash_items')
            .insert({
              item_type: itemType,
              item_id: itemId,
              item_table: tableName,
              display_name: displayName,
              parent_info: parentInfo ?? null,
              user_id: authData.user.id,
              deleted_at: now,
            })
            .select()
            .single(),
        );
      }),
      map(({ data, error }) => {
        if (error) {
          console.error('[TrashService.softDeleteTrashOnly] Insert error:', error);
          throw error;
        }
        return data as TrashItem;
      }),
      catchError((err) => {
        console.error('[TrashService.softDeleteTrashOnly] Error:', err);
        return throwError(() => new Error(`Trash insert failed: ${err.message}`));
      }),
    );
  }

  /**
   * Restore an item from trash: clears deleted_at on original table + removes from trash_items
   */
  restore(trashItem: TrashItem): Observable<boolean> {
    // 1. Clear deleted_at on original table
    return from(
      this.client
        .from(trashItem.item_table)
        .update({ deleted_at: null })
        .eq('id', trashItem.item_id),
    ).pipe(
      switchMap(({ error: updateError }) => {
        if (updateError) {
          console.error('[TrashService.restore] Update error:', updateError);
          return throwError(() => new Error(`Failed to restore item: ${updateError.message}`));
        }

        // 2. Remove from trash_items
        return from(
          this.client
            .from('trash_items')
            .delete()
            .eq('id', trashItem.id),
        );
      }),
      map(({ error }) => {
        if (error) {
          console.error('[TrashService.restore] Delete error:', error);
          throw error;
        }
        return true;
      }),
      catchError((err) => {
        console.error('[TrashService.restore] Error:', err);
        return throwError(() => new Error(`Restore failed: ${err.message}`));
      }),
    );
  }

  /**
   * Permanently delete an item from trash (hard delete from original table + trash_items)
   */
  permanentDelete(trashItem: TrashItem): Observable<boolean> {
    // 1. Hard delete from original table
    return from(
      this.client
        .from(trashItem.item_table)
        .delete()
        .eq('id', trashItem.item_id),
    ).pipe(
      switchMap(({ error: deleteError }) => {
        if (deleteError) {
          console.error('[TrashService.permanentDelete] Delete error:', deleteError);
          // Continue to clean up trash_items even if original deletion fails
        }

        // 2. Remove from trash_items
        return from(
          this.client
            .from('trash_items')
            .delete()
            .eq('id', trashItem.id),
        );
      }),
      map(({ error }) => {
        if (error) {
          console.error('[TrashService.permanentDelete] Trash cleanup error:', error);
          throw error;
        }
        return true;
      }),
      catchError((err) => {
        console.error('[TrashService.permanentDelete] Error:', err);
        return throwError(() => new Error(`Permanent delete failed: ${err.message}`));
      }),
    );
  }

  /**
   * Get all trash items, optionally filtered by type
   */
  getTrashItems(filter?: TrashItemType): Observable<TrashItem[]> {
    let query = this.client
      .from('trash_items')
      .select('*')
      .order('deleted_at', { ascending: false });

    if (filter) {
      query = query.eq('item_type', filter);
    }

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[TrashService.getTrashItems] Error:', error);
          throw error;
        }
        return (data || []) as TrashItem[];
      }),
      catchError((err) => {
        console.error('[TrashService.getTrashItems] Error:', err);
        return of([]);
      }),
    );
  }

  /**
   * Get count of items in trash (for badge)
   */
  getTrashCount(): Observable<number> {
    return from(
      this.client
        .from('trash_items')
        .select('id', { count: 'exact', head: true }),
    ).pipe(
      map(({ count, error }) => {
        if (error) {
          console.error('[TrashService.getTrashCount] Error:', error);
          return 0;
        }
        return count ?? 0;
      }),
      catchError(() => of(0)),
    );
  }

  /**
   * Empty all trash items (permanent delete for all)
   */
  emptyTrash(): Observable<boolean> {
    return this.getTrashItems().pipe(
      switchMap((items) => {
        if (items.length === 0) return of(true);

        // Delete from original tables first
        const deletePromises = items.map((item) =>
          this.client
            .from(item.item_table)
            .delete()
            .eq('id', item.item_id),
        );

        return from(Promise.all(deletePromises)).pipe(
          switchMap(() =>
            // Then clear all trash_items
            from(
              this.client
                .from('trash_items')
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000'), // delete all
            ),
          ),
          map(({ error }) => {
            if (error) {
              console.error('[TrashService.emptyTrash] Error:', error);
              throw error;
            }
            return true;
          }),
        );
      }),
      catchError((err) => {
        console.error('[TrashService.emptyTrash] Error:', err);
        return throwError(() => new Error(`Failed to empty trash: ${err.message}`));
      }),
    );
  }
}
