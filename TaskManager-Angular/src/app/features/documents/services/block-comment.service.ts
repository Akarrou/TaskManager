import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase';
import { from, Observable, throwError, switchMap } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import {
  BlockComment,
  BlockCommentsMap,
} from '../models/block-comment.model';

/**
 * BlockCommentService
 *
 * Service responsible for CRUD operations on block comments.
 * Block comments are Notion-style comments attached to specific blocks in documents.
 */
@Injectable({
  providedIn: 'root',
})
export class BlockCommentService {
  supabase = inject(SupabaseService);

  private get client() {
    return this.supabase.client;
  }

  /**
   * Get all comments for a document
   */
  getCommentsForDocument(documentId: string): Observable<BlockComment[]> {
    return from(
      this.client
        .from('block_comments')
        .select('*')
        .eq('document_id', documentId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[getCommentsForDocument] Error:', error);
          throw error;
        }
        return (data || []) as BlockComment[];
      }),
      catchError((err) => {
        console.error('[getCommentsForDocument] Error:', err);
        return throwError(() => new Error(`Failed to load comments: ${err.message}`));
      })
    );
  }

  /**
   * Get comments for a specific block
   */
  getCommentsForBlock(documentId: string, blockId: string): Observable<BlockComment[]> {
    return from(
      this.client
        .from('block_comments')
        .select('*')
        .eq('document_id', documentId)
        .eq('block_id', blockId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[getCommentsForBlock] Error:', error);
          throw error;
        }
        return (data || []) as BlockComment[];
      }),
      catchError((err) => {
        console.error('[getCommentsForBlock] Error:', err);
        return throwError(() => new Error(`Failed to load block comments: ${err.message}`));
      })
    );
  }

  /**
   * Add a new comment on a block
   */
  addComment(
    documentId: string,
    blockId: string,
    content: string
  ): Observable<BlockComment> {
    return from(this.client.auth.getUser()).pipe(
      switchMap(({ data, error }) => {
        if (error || !data.user) {
          return throwError(() => new Error('User not authenticated'));
        }
        const user = data.user;
        return from(
          this.client
            .from('block_comments')
            .insert({
              document_id: documentId,
              block_id: blockId,
              content: content,
              user_id: user.id,
              user_email: user.email || null,
            })
            .select()
            .single()
        );
      }),
      map(({ data, error }) => {
        if (error) {
          console.error('[addComment] Error:', error);
          throw error;
        }
        return data as BlockComment;
      }),
      catchError((err) => {
        console.error('[addComment] Error:', err);
        return throwError(() => new Error(`Failed to create comment: ${err.message}`));
      })
    );
  }

  /**
   * Update an existing comment
   */
  updateComment(
    commentId: string,
    content: string
  ): Observable<BlockComment> {
    return from(
      this.client
        .from('block_comments')
        .update({ content, updated_at: new Date().toISOString() })
        .eq('id', commentId)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[updateComment] Error:', error);
          throw error;
        }
        return data as BlockComment;
      }),
      catchError((err) => {
        console.error('[updateComment] Error:', err);
        return throwError(() => new Error(`Failed to update comment: ${err.message}`));
      })
    );
  }

  /**
   * Delete a comment
   */
  deleteComment(commentId: string): Observable<void> {
    return from(
      this.client
        .from('block_comments')
        .delete()
        .eq('id', commentId)
    ).pipe(
      map(({ error }) => {
        if (error) {
          console.error('[deleteComment] Error:', error);
          throw error;
        }
      }),
      catchError((err) => {
        console.error('[deleteComment] Error:', err);
        return throwError(() => new Error(`Failed to delete comment: ${err.message}`));
      })
    );
  }

  /**
   * Get list of block IDs that have comments in a document
   */
  getBlocksWithComments(documentId: string): Observable<string[]> {
    return from(
      this.client
        .from('block_comments')
        .select('block_id')
        .eq('document_id', documentId)
        .is('deleted_at', null)
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[getBlocksWithComments] Error:', error);
          throw error;
        }
        // Get unique block IDs
        const blockIds = new Set((data || []).map((row: { block_id: string }) => row.block_id));
        return Array.from(blockIds);
      }),
      catchError((err) => {
        console.error('[getBlocksWithComments] Error:', err);
        return throwError(() => new Error(`Failed to get blocks with comments: ${err.message}`));
      })
    );
  }

  /**
   * Group comments by block ID for efficient rendering
   */
  groupCommentsByBlock(comments: BlockComment[]): BlockCommentsMap {
    return comments.reduce((acc, comment) => {
      if (!acc[comment.block_id]) {
        acc[comment.block_id] = [];
      }
      acc[comment.block_id].push(comment);
      return acc;
    }, {} as BlockCommentsMap);
  }

  /**
   * Get comment count for a specific block
   */
  getCommentCount(documentId: string, blockId: string): Observable<number> {
    return from(
      this.client
        .from('block_comments')
        .select('id', { count: 'exact', head: true })
        .eq('document_id', documentId)
        .eq('block_id', blockId)
        .is('deleted_at', null)
    ).pipe(
      map(({ count, error }) => {
        if (error) {
          console.error('[getCommentCount] Error:', error);
          throw error;
        }
        return count || 0;
      }),
      catchError((err) => {
        console.error('[getCommentCount] Error:', err);
        return throwError(() => new Error(`Failed to get comment count: ${err.message}`));
      })
    );
  }
}
