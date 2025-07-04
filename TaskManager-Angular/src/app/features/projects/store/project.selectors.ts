import { createFeatureSelector, createSelector } from '@ngrx/store';
import * as fromProject from './project.reducer';

export const selectProjectsState = createFeatureSelector<fromProject.State>('projects');

export const selectAllProjects = createSelector(
    selectProjectsState,
    fromProject.selectAll
);

export const selectProjectEntities = createSelector(
    selectProjectsState,
    fromProject.selectEntities
);

export const selectSelectedProjectId = createSelector(
    selectProjectsState,
    (state) => state.selectedProjectId
);

export const selectSelectedProject = createSelector(
    selectProjectEntities,
    selectSelectedProjectId,
    (entities, selectedId) => selectedId ? entities[selectedId] ?? null : null
);

export const selectProjectsLoading = createSelector(
    selectProjectsState,
    (state) => state.loading
);
