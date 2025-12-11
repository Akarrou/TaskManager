import { createReducer, on } from '@ngrx/store';
import { EntityState, EntityAdapter, createEntityAdapter } from '@ngrx/entity';
import { Document } from '../services/document.service';
import * as DocumentActions from './document.actions';

export interface State extends EntityState<Document> {
    selectedDocumentId: string | null;
    loading: boolean;
    error: any;
}

export const adapter: EntityAdapter<Document> = createEntityAdapter<Document>({
    selectId: (document: Document) => document.id,
    sortComparer: (a, b) => {
        // Sort by updated_at descending (most recent first)
        const dateA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const dateB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return dateB - dateA;
    }
});

export const initialState: State = adapter.getInitialState({
    selectedDocumentId: null,
    loading: false,
    error: null
});

export const documentReducer = createReducer(
    initialState,

    // Load Documents
    on(DocumentActions.loadDocuments, (state) => ({
        ...state,
        loading: true,
        error: null
    })),
    on(DocumentActions.loadDocumentsSuccess, (state, { documents }) =>
        adapter.setAll(documents, { ...state, loading: false })
    ),
    on(DocumentActions.loadDocumentsFailure, (state, { error }) => ({
        ...state,
        loading: false,
        error
    })),

    // Load Documents by Project
    on(DocumentActions.loadDocumentsByProject, (state) => ({
        ...state,
        loading: true,
        error: null
    })),
    on(DocumentActions.loadDocumentsByProjectSuccess, (state, { documents }) =>
        adapter.setAll(documents, { ...state, loading: false })
    ),
    on(DocumentActions.loadDocumentsByProjectFailure, (state, { error }) => ({
        ...state,
        loading: false,
        error
    })),

    // Select Document
    on(DocumentActions.selectDocument, (state, { documentId }) => ({
        ...state,
        selectedDocumentId: documentId
    })),

    // Create Document
    on(DocumentActions.createDocument, (state) => ({
        ...state,
        loading: true,
        error: null
    })),
    on(DocumentActions.createDocumentSuccess, (state, { document }) =>
        adapter.addOne(document, { ...state, loading: false })
    ),
    on(DocumentActions.createDocumentFailure, (state, { error }) => ({
        ...state,
        loading: false,
        error
    })),

    // Update Document
    on(DocumentActions.updateDocument, (state) => ({
        ...state,
        loading: true,
        error: null
    })),
    on(DocumentActions.updateDocumentSuccess, (state, { document }) =>
        adapter.updateOne(
            { id: document.id, changes: document },
            { ...state, loading: false }
        )
    ),
    on(DocumentActions.updateDocumentFailure, (state, { error }) => ({
        ...state,
        loading: false,
        error
    })),

    // Delete Document
    on(DocumentActions.deleteDocument, (state) => ({
        ...state,
        loading: true,
        error: null
    })),
    on(DocumentActions.deleteDocumentSuccess, (state, { documentId }) =>
        adapter.removeOne(documentId, { ...state, loading: false })
    ),
    on(DocumentActions.deleteDocumentFailure, (state, { error }) => ({
        ...state,
        loading: false,
        error
    })),

    // Load Single Document
    on(DocumentActions.loadDocument, (state) => ({
        ...state,
        loading: true,
        error: null
    })),
    on(DocumentActions.loadDocumentSuccess, (state, { document }) =>
        adapter.upsertOne(document, { ...state, loading: false })
    ),
    on(DocumentActions.loadDocumentFailure, (state, { error }) => ({
        ...state,
        loading: false,
        error
    }))
);

// Export selectors from entity adapter
export const {
    selectAll,
    selectEntities,
    selectIds,
    selectTotal
} = adapter.getSelectors();
