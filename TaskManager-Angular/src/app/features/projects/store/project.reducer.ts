import { createReducer, on } from '@ngrx/store';
import { EntityState, EntityAdapter, createEntityAdapter } from '@ngrx/entity';
import { Project } from '../models/project.model';
import * as ProjectActions from './project.actions';

export interface State extends EntityState<Project> {
    selectedProjectId: string | null;
    loading: boolean;
    error: any;
    showArchived: boolean;
}

export const adapter: EntityAdapter<Project> = createEntityAdapter<Project>();

export const initialState: State = adapter.getInitialState({
    selectedProjectId: null,
    loading: false,
    error: null,
    showArchived: false,
});

export const reducer = createReducer(
    initialState,
    on(ProjectActions.loadProjects, (state) => ({
        ...state,
        loading: true,
        error: null,
    })),
    on(ProjectActions.loadProjectsSuccess, (state, { projects }) => {
        return adapter.setAll(projects, { ...state, loading: false });
    }),
    on(ProjectActions.loadProjectsFailure, (state, { error }) => ({
        ...state,
        loading: false,
        error,
    })),
    on(ProjectActions.selectProject, (state, { projectId }) => ({
        ...state,
        selectedProjectId: projectId,
    })),
    on(ProjectActions.createProject, (state) => ({
        ...state,
        loading: true,
    })),
    on(ProjectActions.createProjectSuccess, (state, { project }) => {
        return adapter.addOne(project, { ...state, loading: false });
    }),
    on(ProjectActions.createProjectFailure, (state, { error }) => ({
        ...state,
        loading: false,
        error,
    })),
    on(ProjectActions.updateProject, (state) => ({
        ...state,
        loading: true,
    })),
    on(ProjectActions.updateProjectSuccess, (state, { project }) => {
        return adapter.updateOne({ id: project.id, changes: project }, { ...state, loading: false });
    }),
    on(ProjectActions.updateProjectFailure, (state, { error }) => ({
        ...state,
        loading: false,
        error,
    })),
    on(ProjectActions.deleteProject, (state) => ({
        ...state,
        loading: true,
    })),
    on(ProjectActions.deleteProjectSuccess, (state, { projectId }) => {
        return adapter.removeOne(projectId, { ...state, loading: false });
    }),
    on(ProjectActions.deleteProjectFailure, (state, { error }) => ({
        ...state,
        loading: false,
        error,
    })),
    on(ProjectActions.archiveProject, (state) => ({
        ...state,
        loading: true,
    })),
    on(ProjectActions.archiveProjectSuccess, (state, { project }) => {
        return adapter.updateOne({ id: project.id, changes: project }, { ...state, loading: false });
    }),
    on(ProjectActions.archiveProjectFailure, (state, { error }) => ({
        ...state,
        loading: false,
        error,
    })),
    on(ProjectActions.restoreProject, (state) => ({
        ...state,
        loading: true,
    })),
    on(ProjectActions.restoreProjectSuccess, (state, { project }) => {
        return adapter.updateOne({ id: project.id, changes: project }, { ...state, loading: false });
    }),
    on(ProjectActions.restoreProjectFailure, (state, { error }) => ({
        ...state,
        loading: false,
        error,
    })),
    on(ProjectActions.toggleShowArchived, (state) => ({
        ...state,
        showArchived: !state.showArchived,
    }))
);

export const {
    selectIds,
    selectEntities,
    selectAll,
    selectTotal,
} = adapter.getSelectors();
