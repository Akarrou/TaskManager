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
