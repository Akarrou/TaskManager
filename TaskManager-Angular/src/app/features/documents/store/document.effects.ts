import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of } from 'rxjs';
import { map, catchError, mergeMap, tap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DocumentService } from '../services/document.service';
import { TrashService } from '../../../core/services/trash.service';
import { TrashStore } from '../../trash/store/trash.store';
import * as DocumentActions from './document.actions';

@Injectable()
export class DocumentEffects {
    private actions$ = inject(Actions);
    private documentService = inject(DocumentService);
    private trashService = inject(TrashService);
    private trashStore = inject(TrashStore);
    private router = inject(Router);
    private snackBar = inject(MatSnackBar);

    loadDocuments$ = createEffect(() =>
        this.actions$.pipe(
            ofType(DocumentActions.loadDocuments),
            mergeMap(() =>
                this.documentService.getDocuments().pipe(
                    map((documents) => DocumentActions.loadDocumentsSuccess({ documents })),
                    catchError((error) => of(DocumentActions.loadDocumentsFailure({ error })))
                )
            )
        )
    );

    loadDocumentsByProject$ = createEffect(() =>
        this.actions$.pipe(
            ofType(DocumentActions.loadDocumentsByProject),
            mergeMap(({ projectId }) =>
                this.documentService.getDocumentsByProject(projectId).pipe(
                    map((documents) => DocumentActions.loadDocumentsByProjectSuccess({ documents })),
                    catchError((error) => of(DocumentActions.loadDocumentsByProjectFailure({ error })))
                )
            )
        )
    );

    loadDocument$ = createEffect(() =>
        this.actions$.pipe(
            ofType(DocumentActions.loadDocument),
            mergeMap(({ documentId }) =>
                this.documentService.getDocument(documentId).pipe(
                    map((document) => {
                        if (!document) {
                            throw new Error('Document not found');
                        }
                        return DocumentActions.loadDocumentSuccess({ document });
                    }),
                    catchError((error) => of(DocumentActions.loadDocumentFailure({ error })))
                )
            )
        )
    );

    createDocument$ = createEffect(() =>
        this.actions$.pipe(
            ofType(DocumentActions.createDocument),
            mergeMap(({ document }) =>
                this.documentService.createDocument(document).pipe(
                    map((createdDocument) => DocumentActions.createDocumentSuccess({ document: createdDocument })),
                    catchError((error) => of(DocumentActions.createDocumentFailure({ error })))
                )
            )
        )
    );

    createDocumentSuccess$ = createEffect(() =>
        this.actions$.pipe(
            ofType(DocumentActions.createDocumentSuccess),
            tap(({ document }) => {
                this.snackBar.open('Document créé avec succès', 'Fermer', { duration: 3000 });
                this.router.navigate(['/documents', document.id]);
            })
        ),
        { dispatch: false }
    );

    updateDocument$ = createEffect(() =>
        this.actions$.pipe(
            ofType(DocumentActions.updateDocument),
            mergeMap(({ documentId, updates }) =>
                this.documentService.updateDocument(documentId, updates).pipe(
                    map((document) => DocumentActions.updateDocumentSuccess({ document })),
                    catchError((error) => of(DocumentActions.updateDocumentFailure({ error })))
                )
            )
        )
    );

    updateDocumentSuccess$ = createEffect(() =>
        this.actions$.pipe(
            ofType(DocumentActions.updateDocumentSuccess),
            tap(() => {
                this.snackBar.open('Document mis à jour', 'Fermer', { duration: 2000 });
            })
        ),
        { dispatch: false }
    );

    deleteDocument$ = createEffect(() =>
        this.actions$.pipe(
            ofType(DocumentActions.deleteDocument),
            mergeMap(({ documentId, documentTitle, projectId }) => {
                const displayName = documentTitle || 'Document sans titre';
                const parentInfo: Record<string, string> = {};
                if (projectId) {
                    parentInfo['projectId'] = projectId;
                }
                return this.trashService.softDelete(
                    'document',
                    documentId,
                    'documents',
                    displayName,
                    Object.keys(parentInfo).length > 0 ? parentInfo : undefined,
                ).pipe(
                    map(() => DocumentActions.deleteDocumentSuccess({ documentId })),
                    catchError((error) => of(DocumentActions.deleteDocumentFailure({ error })))
                );
            })
        )
    );

    deleteDocumentSuccess$ = createEffect(() =>
        this.actions$.pipe(
            ofType(DocumentActions.deleteDocumentSuccess),
            tap(() => {
                this.trashStore.loadTrashCount();
                this.snackBar.open('Document déplacé dans la corbeille', 'Fermer', { duration: 3000 });
                this.router.navigate(['/documents']);
            })
        ),
        { dispatch: false }
    );

    handleError$ = createEffect(() =>
        this.actions$.pipe(
            ofType(
                DocumentActions.loadDocumentsFailure,
                DocumentActions.loadDocumentsByProjectFailure,
                DocumentActions.loadDocumentFailure,
                DocumentActions.createDocumentFailure,
                DocumentActions.updateDocumentFailure,
                DocumentActions.deleteDocumentFailure
            ),
            tap(({ error }) => {
                console.error('Document Error:', error);
                this.snackBar.open(
                    error?.message || 'Une erreur est survenue',
                    'Fermer',
                    { duration: 5000 }
                );
            })
        ),
        { dispatch: false }
    );
}
