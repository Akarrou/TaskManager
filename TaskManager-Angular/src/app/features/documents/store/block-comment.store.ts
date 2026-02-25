import { inject } from '@angular/core';
import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { tapResponse } from '@ngrx/operators';
import { pipe, switchMap, tap, concatMap } from 'rxjs';
import { BlockCommentService } from '../services/block-comment.service';
import { BlockComment, BlockCommentsMap } from '../models/block-comment.model';
import { TrashService } from '../../../core/services/trash.service';
import { TrashStore } from '../../trash/store/trash.store';
import { withRealtimeSync } from '../../../core/stores/features/with-realtime-sync';

interface BlockCommentStoreState {
  commentsByBlock: Record<string, BlockComment[]>;
  blocksWithComments: string[];
  currentDocumentId: string | null;
  loading: boolean;
  submitting: boolean;
  error: string | null;
}

export const BlockCommentStore = signalStore(
  { providedIn: 'root' },

  withState<BlockCommentStoreState>({
    commentsByBlock: {},
    blocksWithComments: [],
    currentDocumentId: null,
    loading: false,
    submitting: false,
    error: null,
  }),

  withMethods((
    store,
    commentService = inject(BlockCommentService),
    trashService = inject(TrashService),
    trashStore = inject(TrashStore),
  ) => ({
    setCurrentDocument(documentId: string | null): void {
      patchState(store, { currentDocumentId: documentId });
    },

    loadCommentsForDocument: rxMethod<{ documentId: string }>(
      pipe(
        tap(({ documentId }) => patchState(store, { loading: true, error: null, currentDocumentId: documentId })),
        switchMap(({ documentId }) =>
          commentService.getCommentsForDocument(documentId).pipe(
            tapResponse({
              next: (comments) => {
                const grouped = commentService.groupCommentsByBlock(comments);
                const blockIds = [...new Set(Object.keys(grouped))];
                patchState(store, {
                  commentsByBlock: grouped,
                  blocksWithComments: blockIds,
                  loading: false,
                });
              },
              error: (error: Error) => {
                patchState(store, { loading: false, error: error.message });
              },
            })
          )
        )
      )
    ),

    loadCommentsForBlock: rxMethod<{ documentId: string; blockId: string }>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        switchMap(({ documentId, blockId }) =>
          commentService.getCommentsForBlock(documentId, blockId).pipe(
            tapResponse({
              next: (comments) => {
                const updated = { ...store.commentsByBlock(), [blockId]: comments };
                patchState(store, { commentsByBlock: updated, loading: false });
              },
              error: (error: Error) => {
                patchState(store, { loading: false, error: error.message });
              },
            })
          )
        )
      )
    ),

    addComment: rxMethod<{ documentId: string; blockId: string; content: string }>(
      pipe(
        tap(() => patchState(store, { submitting: true, error: null })),
        concatMap(({ documentId, blockId, content }) =>
          commentService.addComment(documentId, blockId, content).pipe(
            tapResponse({
              next: (comment) => {
                const currentComments = store.commentsByBlock()[blockId] || [];
                const updated = {
                  ...store.commentsByBlock(),
                  [blockId]: [...currentComments, comment],
                };
                const blockIds = store.blocksWithComments().includes(blockId)
                  ? store.blocksWithComments()
                  : [...store.blocksWithComments(), blockId];
                patchState(store, {
                  commentsByBlock: updated,
                  blocksWithComments: blockIds,
                  submitting: false,
                });
              },
              error: (error: Error) => {
                patchState(store, { submitting: false, error: error.message });
              },
            })
          )
        )
      )
    ),

    updateComment: rxMethod<{ commentId: string; content: string; blockId: string }>(
      pipe(
        tap(() => patchState(store, { submitting: true, error: null })),
        concatMap(({ commentId, content, blockId }) =>
          commentService.updateComment(commentId, content).pipe(
            tapResponse({
              next: (updatedComment) => {
                const currentComments = store.commentsByBlock()[blockId] || [];
                const updatedList = currentComments.map(c =>
                  c.id === commentId ? updatedComment : c
                );
                const updated = { ...store.commentsByBlock(), [blockId]: updatedList };
                patchState(store, { commentsByBlock: updated, submitting: false });
              },
              error: (error: Error) => {
                patchState(store, { submitting: false, error: error.message });
              },
            })
          )
        )
      )
    ),

    deleteComment: rxMethod<{ commentId: string; blockId: string; documentId: string; displayName: string }>(
      pipe(
        tap(() => patchState(store, { submitting: true, error: null })),
        concatMap(({ commentId, blockId, documentId, displayName }) =>
          trashService.softDelete(
            'comment',
            commentId,
            'block_comments',
            displayName,
            { documentId },
          ).pipe(
            tapResponse({
              next: () => {
                const currentComments = store.commentsByBlock()[blockId] || [];
                const filtered = currentComments.filter(c => c.id !== commentId);
                const updated = { ...store.commentsByBlock() };
                if (filtered.length === 0) {
                  delete updated[blockId];
                  patchState(store, {
                    commentsByBlock: updated,
                    blocksWithComments: store.blocksWithComments().filter(id => id !== blockId),
                    submitting: false,
                  });
                } else {
                  updated[blockId] = filtered;
                  patchState(store, { commentsByBlock: updated, submitting: false });
                }
                trashStore.loadTrashCount();
              },
              error: (error: Error) => {
                patchState(store, { submitting: false, error: error.message });
              },
            })
          )
        )
      )
    ),

    groupCommentsByBlock(comments: BlockComment[]): BlockCommentsMap {
      return commentService.groupCommentsByBlock(comments);
    },
  })),

  withRealtimeSync({
    tables: ['block_comments'],
    onTableChange: (store) => {
      const docId = store['currentDocumentId'];
      const loadFn = store['loadCommentsForDocument'];
      if (typeof docId === 'function' && typeof loadFn === 'function') {
        const id = docId() as string | null;
        if (id) loadFn({ documentId: id });
      }
    },
  }),
);
