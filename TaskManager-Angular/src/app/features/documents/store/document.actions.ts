import { createAction, props } from '@ngrx/store';
import { Document } from '../services/document.service';

// Load Documents
export const loadDocuments = createAction('[Documents Page] Load Documents');
export const loadDocumentsSuccess = createAction(
    '[Documents API] Load Documents Success',
    props<{ documents: Document[] }>()
);
export const loadDocumentsFailure = createAction(
    '[Documents API] Load Documents Failure',
    props<{ error: any }>()
);

// Load Documents by Project
export const loadDocumentsByProject = createAction(
    '[Documents Page] Load Documents By Project',
    props<{ projectId: string }>()
);
export const loadDocumentsByProjectSuccess = createAction(
    '[Documents API] Load Documents By Project Success',
    props<{ documents: Document[] }>()
);
export const loadDocumentsByProjectFailure = createAction(
    '[Documents API] Load Documents By Project Failure',
    props<{ error: any }>()
);

// Select Document
export const selectDocument = createAction(
    '[Documents Page] Select Document',
    props<{ documentId: string | null }>()
);

// Create Document
export const createDocument = createAction(
    '[Documents Page] Create Document',
    props<{ document: Partial<Document> }>()
);
export const createDocumentSuccess = createAction(
    '[Documents API] Create Document Success',
    props<{ document: Document }>()
);
export const createDocumentFailure = createAction(
    '[Documents API] Create Document Failure',
    props<{ error: any }>()
);

// Update Document
export const updateDocument = createAction(
    '[Documents Page] Update Document',
    props<{ documentId: string; updates: Partial<Document> }>()
);
export const updateDocumentSuccess = createAction(
    '[Documents API] Update Document Success',
    props<{ document: Document }>()
);
export const updateDocumentFailure = createAction(
    '[Documents API] Update Document Failure',
    props<{ error: any }>()
);

// Delete Document
export const deleteDocument = createAction(
    '[Documents Page] Delete Document',
    props<{ documentId: string; documentTitle: string; projectId?: string }>()
);
export const deleteDocumentSuccess = createAction(
    '[Documents API] Delete Document Success',
    props<{ documentId: string }>()
);
export const deleteDocumentFailure = createAction(
    '[Documents API] Delete Document Failure',
    props<{ error: any }>()
);

// Load Single Document
export const loadDocument = createAction(
    '[Document Editor] Load Document',
    props<{ documentId: string }>()
);
export const loadDocumentSuccess = createAction(
    '[Documents API] Load Document Success',
    props<{ document: Document }>()
);
export const loadDocumentFailure = createAction(
    '[Documents API] Load Document Failure',
    props<{ error: any }>()
);
