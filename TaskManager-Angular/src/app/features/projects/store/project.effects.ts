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

    ngrxOnInitEffects(): Action {
        return ProjectActions.init();
    }
}
