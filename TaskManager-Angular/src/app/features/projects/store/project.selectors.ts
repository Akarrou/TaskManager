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

export const selectShowArchived = createSelector(
    selectProjectsState,
    (state) => state.showArchived
);

export const selectActiveProjects = createSelector(
    selectAllProjects,
    selectShowArchived,
    (projects, showArchived) => {
        if (showArchived) {
            return projects;
        }
        return projects.filter(p => !p.archived);
    }
);

export const selectArchivedProjects = createSelector(
    selectAllProjects,
    (projects) => projects.filter(p => p.archived)
);

export const selectArchivedCount = createSelector(
    selectArchivedProjects,
    (projects) => projects.length
);
