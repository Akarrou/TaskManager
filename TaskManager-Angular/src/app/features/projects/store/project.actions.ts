import { createAction, props } from '@ngrx/store';
import { Project } from '../models/project.model';

export const loadProjects = createAction(
    '[Projects API] Load Projects'
);

export const loadProjectsSuccess = createAction(
    '[Projects API] Load Projects Success',
    props<{ projects: Project[] }>()
);

export const loadProjectsFailure = createAction(
    '[Projects API] Load Projects Failure',
    props<{ error: any }>()
);

export const selectProject = createAction(
    '[Projects Page] Select Project',
    props<{ projectId: string }>()
);

export const createProject = createAction(
    '[Projects Page] Create Project',
    props<{ projectData: Partial<Project> }>()
);

export const createProjectSuccess = createAction(
    '[Projects API] Create Project Success',
    props<{ project: Project }>()
);

export const createProjectFailure = createAction(
    '[Projects API] Create Project Failure',
    props<{ error: any }>()
);

export const updateProject = createAction(
    '[Projects Page] Update Project',
    props<{ projectId: string; projectData: Partial<Project> }>()
);

export const updateProjectSuccess = createAction(
    '[Projects API] Update Project Success',
    props<{ project: Project }>()
);

export const updateProjectFailure = createAction(
    '[Projects API] Update Project Failure',
    props<{ error: any }>()
);

export const deleteProject = createAction(
    '[Projects Page] Delete Project',
    props<{ projectId: string; projectName: string }>()
);

export const deleteProjectSuccess = createAction(
    '[Projects API] Delete Project Success',
    props<{ projectId: string }>()
);

export const deleteProjectFailure = createAction(
    '[Projects API] Delete Project Failure',
    props<{ error: any }>()
);

export const archiveProject = createAction(
    '[Projects Page] Archive Project',
    props<{ projectId: string }>()
);

export const archiveProjectSuccess = createAction(
    '[Projects API] Archive Project Success',
    props<{ project: Project }>()
);

export const archiveProjectFailure = createAction(
    '[Projects API] Archive Project Failure',
    props<{ error: any }>()
);

export const restoreProject = createAction(
    '[Projects Page] Restore Project',
    props<{ projectId: string }>()
);

export const restoreProjectSuccess = createAction(
    '[Projects API] Restore Project Success',
    props<{ project: Project }>()
);

export const restoreProjectFailure = createAction(
    '[Projects API] Restore Project Failure',
    props<{ error: any }>()
);

export const toggleShowArchived = createAction(
    '[Projects Page] Toggle Show Archived'
);

export const init = createAction('[Projects] Init');
