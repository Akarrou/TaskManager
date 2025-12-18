import { createFeatureSelector, createSelector } from '@ngrx/store';
import * as fromDocument from './document.reducer';

export const selectDocumentsState = createFeatureSelector<fromDocument.State>('documents');

export const selectAllDocuments = createSelector(
    selectDocumentsState,
    fromDocument.selectAll
);

export const selectDocumentEntities = createSelector(
    selectDocumentsState,
    fromDocument.selectEntities
);

export const selectSelectedDocumentId = createSelector(
    selectDocumentsState,
    (state) => state.selectedDocumentId
);

export const selectSelectedDocument = createSelector(
    selectDocumentEntities,
    selectSelectedDocumentId,
    (entities, selectedId) => selectedId ? entities[selectedId] ?? null : null
);

export const selectDocumentsLoading = createSelector(
    selectDocumentsState,
    (state) => state.loading
);

export const selectDocumentsError = createSelector(
    selectDocumentsState,
    (state) => state.error
);

// Select documents by project
export const selectDocumentsByProject = (projectId: string) => createSelector(
    selectAllDocuments,
    (documents) => documents.filter(doc => doc.project_id === projectId)
);

// Select documents without project
export const selectDocumentsWithoutProject = createSelector(
    selectAllDocuments,
    (documents) => documents.filter(doc => !doc.project_id)
);

// Count documents by project
export const selectDocumentsCountByProject = (projectId: string) => createSelector(
    selectDocumentsByProject(projectId),
    (documents) => documents.length
);
