import { computed, inject } from '@angular/core';
import { signalStore, withState, withMethods, withComputed, patchState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, tap, switchMap, catchError, of, concatMap } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PinnedDocumentService } from '../services/pinned-document.service';

interface PinnedDocumentState {
  pinnedIds: string[];
  loading: boolean;
  currentProjectId: string | null;
}

export const PinnedDocumentStore = signalStore(
  { providedIn: 'root' },

  withState<PinnedDocumentState>({
    pinnedIds: [],
    loading: false,
    currentProjectId: null,
  }),

  withComputed((store) => ({
    /**
     * Set for O(1) lookup of pinned status
     */
    pinnedSet: computed(() => new Set(store.pinnedIds())),
  })),

  withMethods((
    store,
    pinnedService = inject(PinnedDocumentService),
    snackBar = inject(MatSnackBar),
  ) => ({
    /**
     * Load pinned documents for a project
     */
    loadPinned: rxMethod<{ projectId: string }>(
      pipe(
        tap(() => patchState(store, { loading: true })),
        switchMap(({ projectId }) =>
          pinnedService.getPinnedByProject(projectId).pipe(
            tap((pinned) => {
              patchState(store, {
                pinnedIds: pinned.map((p) => p.document_id),
                loading: false,
                currentProjectId: projectId,
              });
            }),
            catchError(() => {
              patchState(store, { loading: false });
              return of(null);
            })
          )
        )
      )
    ),

    /**
     * Pin a document
     */
    pin: rxMethod<{ documentId: string; projectId: string }>(
      pipe(
        tap(({ documentId }) => {
          // Optimistic update
          patchState(store, {
            pinnedIds: [...store.pinnedIds(), documentId],
          });
        }),
        concatMap(({ documentId, projectId }) =>
          pinnedService.pinDocument(documentId, projectId).pipe(
            tap(() => {
              snackBar.open('Document épinglé', 'Fermer', { duration: 2000 });
            }),
            catchError(() => {
              // Rollback
              patchState(store, {
                pinnedIds: store.pinnedIds().filter((id) => id !== documentId),
              });
              snackBar.open('Erreur lors de l\'épinglage', 'Fermer', { duration: 3000 });
              return of(null);
            })
          )
        )
      )
    ),

    /**
     * Unpin a document
     */
    unpin: rxMethod<{ documentId: string }>(
      pipe(
        tap(({ documentId }) => {
          // Optimistic update
          patchState(store, {
            pinnedIds: store.pinnedIds().filter((id) => id !== documentId),
          });
        }),
        concatMap(({ documentId }) =>
          pinnedService.unpinDocument(documentId).pipe(
            tap(() => {
              snackBar.open('Document désépinglé', 'Fermer', { duration: 2000 });
            }),
            catchError(() => {
              // Rollback
              patchState(store, {
                pinnedIds: [...store.pinnedIds(), documentId],
              });
              snackBar.open('Erreur lors du désépinglage', 'Fermer', { duration: 3000 });
              return of(null);
            })
          )
        )
      )
    ),

    /**
     * Reset the store
     */
    reset(): void {
      patchState(store, { pinnedIds: [], loading: false, currentProjectId: null });
    },
  })),
);
