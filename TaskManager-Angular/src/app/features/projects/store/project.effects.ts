import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType, OnInitEffects } from '@ngrx/effects';
import { of } from 'rxjs';
import { catchError, map, mergeMap, tap, filter } from 'rxjs/operators';
import * as ProjectActions from './project.actions';
import { ProjectService } from '../services/project.service';
import { Router } from '@angular/router';
import { Action } from '@ngrx/store';

@Injectable()
export class ProjectEffects implements OnInitEffects {
    private actions$ = inject(Actions);
    private projectService = inject(ProjectService);
    private router = inject(Router);

    init$ = createEffect(() =>
        this.actions$.pipe(
            ofType(ProjectActions.init),
            map(() => localStorage.getItem('selectedProjectId')),
            filter((savedProjectId): savedProjectId is string => !!savedProjectId),
            map(savedProjectId => ProjectActions.selectProject({ projectId: savedProjectId }))
        )
    );

    loadProjects$ = createEffect(() =>
        this.actions$.pipe(
            ofType(ProjectActions.loadProjects),
            mergeMap(() =>
                this.projectService.getProjects().pipe(
                    map((projects) => ProjectActions.loadProjectsSuccess({ projects })),
                    catchError((error) =>
                        of(ProjectActions.loadProjectsFailure({ error }))
                    )
                )
            )
        )
    );

    createProject$ = createEffect(() =>
        this.actions$.pipe(
            ofType(ProjectActions.createProject),
            mergeMap(({ projectData }) =>
                this.projectService.createProject(projectData).pipe(
                    map((project) => ProjectActions.createProjectSuccess({ project })),
                    catchError((error) =>
                        of(ProjectActions.createProjectFailure({ error }))
                    )
                )
            )
        )
    );

    createProjectSuccess$ = createEffect(() =>
        this.actions$.pipe(
            ofType(ProjectActions.createProjectSuccess),
            tap(() => this.router.navigate(['/projects']))
        ),
        { dispatch: false }
    );

    updateProject$ = createEffect(() =>
        this.actions$.pipe(
            ofType(ProjectActions.updateProject),
            mergeMap(({ projectId, projectData }) =>
                this.projectService.updateProject(projectId, projectData).pipe(
                    map((project) => ProjectActions.updateProjectSuccess({ project })),
                    catchError((error) =>
                        of(ProjectActions.updateProjectFailure({ error }))
                    )
                )
            )
        )
    );

    updateProjectSuccess$ = createEffect(() =>
        this.actions$.pipe(
            ofType(ProjectActions.updateProjectSuccess),
            tap(() => this.router.navigate(['/projects']))
        ),
        { dispatch: false }
    );

    deleteProject$ = createEffect(() =>
        this.actions$.pipe(
            ofType(ProjectActions.deleteProject),
            mergeMap(({ projectId }) =>
                this.projectService.deleteProject(projectId).pipe(
                    map(() => ProjectActions.deleteProjectSuccess({ projectId })),
                    catchError((error) =>
                        of(ProjectActions.deleteProjectFailure({ error }))
                    )
                )
            )
        )
    );

    archiveProject$ = createEffect(() =>
        this.actions$.pipe(
            ofType(ProjectActions.archiveProject),
            mergeMap(({ projectId }) =>
                this.projectService.archiveProject(projectId).pipe(
                    map((project) => ProjectActions.archiveProjectSuccess({ project })),
                    catchError((error) =>
                        of(ProjectActions.archiveProjectFailure({ error }))
                    )
                )
            )
        )
    );

    restoreProject$ = createEffect(() =>
        this.actions$.pipe(
            ofType(ProjectActions.restoreProject),
            mergeMap(({ projectId }) =>
                this.projectService.restoreProject(projectId).pipe(
                    map((project) => ProjectActions.restoreProjectSuccess({ project })),
                    catchError((error) =>
                        of(ProjectActions.restoreProjectFailure({ error }))
                    )
                )
            )
        )
    );

    selectProject$ = createEffect(() =>
        this.actions$.pipe(
            ofType(ProjectActions.selectProject),
            tap((action) => {
                // Store selected project ID in localStorage for persistence
                localStorage.setItem('selectedProjectId', action.projectId);
                // Note: We don't automatically redirect to dashboard anymore
                // This was causing unwanted redirects when navigating to documents
            })
        ),
        { dispatch: false }
    );

    ngrxOnInitEffects(): Action {
        return ProjectActions.init();
    }
}
