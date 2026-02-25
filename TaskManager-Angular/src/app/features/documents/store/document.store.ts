import { computed, inject } from '@angular/core';
import { signalStore, withState, withMethods, withComputed, patchState } from '@ngrx/signals';
import { withEntities, setAllEntities, addEntity, upsertEntity, removeEntity } from '@ngrx/signals/entities';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { tapResponse } from '@ngrx/operators';
import { pipe, concatMap, switchMap, tap } from 'rxjs';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DocumentService, Document } from '../services/document.service';
import { TrashService } from '../../../core/services/trash.service';
import { TrashStore } from '../../trash/store/trash.store';
import { DocumentTabsStore } from './document-tabs.store';
import { withRealtimeSync } from '../../../core/stores/features/with-realtime-sync';
import { JSONContent } from '@tiptap/core';

interface DocumentStoreState {
  selectedDocumentId: string | null;
  loading: boolean;
  error: string | null;
}

export const DocumentStore = signalStore(
  { providedIn: 'root' },

  withEntities<Document>(),

  withState<DocumentStoreState>({
    selectedDocumentId: null,
    loading: false,
    error: null,
  }),

  withComputed((store) => ({
    selectedDocument: computed(() => {
      const id = store.selectedDocumentId();
      if (!id) return null;
      return store.entityMap()[id] ?? null;
    }),
    allDocuments: computed(() => store.entities()),
  })),

  withMethods((
    store,
    documentService = inject(DocumentService),
    tabsStore = inject(DocumentTabsStore),
    trashService = inject(TrashService),
    trashStore = inject(TrashStore),
    router = inject(Router),
    snackBar = inject(MatSnackBar),
  ) => ({
    selectDocument(documentId: string | null): void {
      patchState(store, { selectedDocumentId: documentId });
    },

    extractDatabaseIds(content: JSONContent): string[] {
      return documentService.extractDatabaseIds(content);
    },

    upsertDocumentEntity(document: Document): void {
      patchState(store, upsertEntity(document));
    },

    loadDocuments: rxMethod<void>(
      pipe(
        tap(() => {
          // Only show loading on initial load to avoid page jumps on realtime refreshes
          if (store.entities().length === 0) {
            patchState(store, { loading: true, error: null });
          }
        }),
        switchMap(() =>
          documentService.getDocuments().pipe(
            tapResponse({
              next: (documents) => {
                patchState(store, setAllEntities(documents), { loading: false });
              },
              error: (error: Error) => {
                console.error('Document Error:', error);
                snackBar.open(error?.message || 'Une erreur est survenue', 'Fermer', { duration: 5000 });
                patchState(store, { loading: false, error: error.message });
              },
            })
          )
        )
      )
    ),

    loadDocumentsByProject: rxMethod<{ projectId: string }>(
      pipe(
        tap(() => {
          if (store.entities().length === 0) {
            patchState(store, { loading: true, error: null });
          }
        }),
        switchMap(({ projectId }) =>
          documentService.getDocumentsByProject(projectId).pipe(
            tapResponse({
              next: (documents) => {
                patchState(store, setAllEntities(documents), { loading: false });
              },
              error: (error: Error) => {
                console.error('Document Error:', error);
                snackBar.open(error?.message || 'Une erreur est survenue', 'Fermer', { duration: 5000 });
                patchState(store, { loading: false, error: error.message });
              },
            })
          )
        )
      )
    ),

    loadDocument: rxMethod<{ documentId: string }>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        switchMap(({ documentId }) =>
          documentService.getDocument(documentId).pipe(
            tapResponse({
              next: (document) => {
                if (!document) {
                  patchState(store, { loading: false, error: 'Document not found' });
                  snackBar.open('Document introuvable', 'Fermer', { duration: 5000 });
                  return;
                }
                patchState(store, upsertEntity(document), { loading: false });
              },
              error: (error: Error) => {
                console.error('Document Error:', error);
                snackBar.open(error?.message || 'Une erreur est survenue', 'Fermer', { duration: 5000 });
                patchState(store, { loading: false, error: error.message });
              },
            })
          )
        )
      )
    ),

    createDocument: rxMethod<{ document: Partial<Document> }>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        concatMap(({ document }) =>
          documentService.createDocument(document).pipe(
            tapResponse({
              next: (createdDocument) => {
                patchState(store, addEntity(createdDocument), { loading: false });
                snackBar.open('Document créé avec succès', 'Fermer', { duration: 3000 });
                router.navigate(['/documents', createdDocument.id]);
              },
              error: (error: Error) => {
                console.error('Document Error:', error);
                snackBar.open(error?.message || 'Une erreur est survenue', 'Fermer', { duration: 5000 });
                patchState(store, { loading: false, error: error.message });
              },
            })
          )
        )
      )
    ),

    updateDocument: rxMethod<{ documentId: string; updates: Partial<Document> }>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        concatMap(({ documentId, updates }) =>
          documentService.updateDocument(documentId, updates).pipe(
            tapResponse({
              next: (document) => {
                patchState(store, upsertEntity(document), { loading: false });
                snackBar.open('Document mis à jour', 'Fermer', { duration: 2000 });
              },
              error: (error: Error) => {
                console.error('Document Error:', error);
                snackBar.open(error?.message || 'Une erreur est survenue', 'Fermer', { duration: 5000 });
                patchState(store, { loading: false, error: error.message });
              },
            })
          )
        )
      )
    ),

    deleteDocument: rxMethod<{ documentId: string; documentTitle: string; projectId?: string }>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        concatMap(({ documentId, documentTitle, projectId }) => {
          const displayName = documentTitle || 'Document sans titre';
          const parentInfo = projectId ? { projectId } : undefined;
          // Soft-delete all tab references (immediate state update + async DB soft-delete)
          // References are auto-restored when document is restored from trash
          tabsStore.softDeleteAllDocumentReferences(documentId);
          // Soft-delete the document
          return trashService.softDelete(
            'document',
            documentId,
            'documents',
            displayName,
            parentInfo,
          ).pipe(
            tapResponse({
              next: () => {
                patchState(store, removeEntity(documentId), { loading: false });
                trashStore.loadTrashCount();
                snackBar.open('Document déplacé dans la corbeille', 'Fermer', { duration: 3000 });
                router.navigate(['/documents']);
              },
              error: (error: Error) => {
                console.error('Document Error:', error);
                snackBar.open(error?.message || 'Une erreur est survenue', 'Fermer', { duration: 5000 });
                patchState(store, { loading: false, error: error.message });
              },
            })
          );
        })
      )
    ),
  })),

  withRealtimeSync({
    tables: ['documents'],
    onTableChange: (store) => {
      const fn = store['loadDocuments'];
      if (typeof fn === 'function') fn();
    },
  }),
);
