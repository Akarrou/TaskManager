import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase';
import { from, Observable, throwError, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
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
   * Atomic soft delete via RPC: sets deleted_at on original table + inserts into trash_items
   * in a single database transaction. Prevents orphaned items.
   */
  softDelete(
    itemType: TrashItemType,
    itemId: string,
    tableName: string,
    displayName: string,
    parentInfo?: Record<string, string>,
  ): Observable<TrashItem> {
    return from(
      this.client.rpc('soft_delete_item', {
        p_item_type: itemType,
        p_item_id: itemId,
        p_item_table: tableName,
        p_display_name: displayName,
        p_parent_info: parentInfo ?? null,
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[TrashService.softDelete] RPC error:', error);
          throw error;
        }
        if (!data?.success) {
          throw new Error('Soft delete failed');
        }
        return data.trash_item as TrashItem;
      }),
      catchError((err) => {
        console.error('[TrashService.softDelete] Error:', err);
        return throwError(() => new Error(`Soft delete failed: ${err.message}`));
      }),
    );
  }

  /**
   * Insert into trash_items only via RPC (deleted_at already set by another service).
   * Uses auth.uid() server-side to avoid N client-side getUser() calls.
   */
  softDeleteTrashOnly(
    itemType: TrashItemType,
    itemId: string,
    tableName: string,
    displayName: string,
    parentInfo?: Record<string, string>,
  ): Observable<TrashItem> {
    return from(
      this.client.rpc('soft_delete_trash_only', {
        p_item_type: itemType,
        p_item_id: itemId,
        p_item_table: tableName,
        p_display_name: displayName,
        p_parent_info: parentInfo ?? null,
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[TrashService.softDeleteTrashOnly] RPC error:', error);
          throw error;
        }
        if (!data?.success) {
          throw new Error('Soft delete trash only failed');
        }
        return data.trash_item as TrashItem;
      }),
      catchError((err) => {
        console.error('[TrashService.softDeleteTrashOnly] Error:', err);
        return throwError(() => new Error(`Trash insert failed: ${err.message}`));
      }),
    );
  }

  /**
   * Atomic restore via RPC: clears deleted_at on original table + removes from trash_items
   */
  restore(trashItem: TrashItem): Observable<boolean> {
    return from(
      this.client.rpc('restore_item', {
        p_trash_item_id: trashItem.id,
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[TrashService.restore] RPC error:', error);
          throw error;
        }
        if (!data?.success) {
          throw new Error('Restore failed');
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
   * Atomic permanent delete via RPC (hard delete from original table + trash_items)
   * For projects, cascades to child documents and embedded items.
   */
  permanentDelete(trashItem: TrashItem): Observable<boolean> {
    return from(
      this.client.rpc('permanent_delete_item', {
        p_trash_item_id: trashItem.id,
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[TrashService.permanentDelete] RPC error:', error);
          throw error;
        }
        if (!data?.success) {
          throw new Error('Permanent delete failed');
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
   * Empty all trash items via atomic RPC (permanent delete for all)
   */
  emptyTrash(): Observable<boolean> {
    return from(
      this.client.rpc('empty_user_trash'),
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[TrashService.emptyTrash] RPC error:', error);
          throw error;
        }
        if (!data?.success) {
          throw new Error('Failed to empty trash');
        }
        return true;
      }),
      catchError((err) => {
        console.error('[TrashService.emptyTrash] Error:', err);
        return throwError(() => new Error(`Failed to empty trash: ${err.message}`));
      }),
    );
  }

  /**
   * Check if a parent document exists and is not soft-deleted.
   * Used before restoring embedded items (databases/spreadsheets).
   */
  checkParentDocument(documentId: string): Observable<{ exists: boolean; deleted: boolean }> {
    return from(
      this.client
        .from('documents')
        .select('id, deleted_at')
        .eq('id', documentId)
        .maybeSingle(),
    ).pipe(
      map(({ data, error }) => {
        if (error || !data) return { exists: false, deleted: false };
        return { exists: true, deleted: data.deleted_at !== null };
      }),
      catchError(() => of({ exists: false, deleted: false })),
    );
  }
}
