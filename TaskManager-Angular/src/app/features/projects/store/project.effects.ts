import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of } from 'rxjs';
import { catchError, map, mergeMap, tap } from 'rxjs/operators';
import * as ProjectActions from './project.actions';
import { ProjectService } from '../services/project.service';
import { Router } from '@angular/router';

@Injectable()
export class ProjectEffects {
    private actions$ = inject(Actions);
    private projectService = inject(ProjectService);
    private router = inject(Router);

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
}
