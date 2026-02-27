import { inject } from '@angular/core';
import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { tapResponse } from '@ngrx/operators';
import { pipe, concatMap, tap, EMPTY } from 'rxjs';
import { Router } from '@angular/router';
import { DemoSeedService, SeedProgress } from '../services/demo-seed.service';
import { ProjectService } from '../../projects/services/project.service';
import { ProjectStore } from '../../projects/store/project.store';

export type OnboardingStep = 'welcome' | 'create-form' | 'seeding' | 'complete';

interface OnboardingState {
  step: OnboardingStep;
  loading: boolean;
  error: string | null;
  seedProgress: SeedProgress | null;
  createdProjectId: string | null;
}

export const OnboardingStore = signalStore(
  withState<OnboardingState>({
    step: 'welcome',
    loading: false,
    error: null,
    seedProgress: null,
    createdProjectId: null,
  }),

  withMethods((
    store,
    router = inject(Router),
    demoSeedService = inject(DemoSeedService),
    projectService = inject(ProjectService),
    projectStore = inject(ProjectStore),
  ) => ({
    setStep(step: OnboardingStep): void {
      patchState(store, { step, error: null });
    },

    createDemoProject: rxMethod<void>(
      pipe(
        tap(() => patchState(store, { step: 'seeding', loading: true, error: null })),
        concatMap(() => {
          // Subscribe to progress updates
          const sub = demoSeedService.progress$.subscribe(progress => {
            patchState(store, { seedProgress: progress });
          });

          return demoSeedService.seedDemoProject().pipe(
            tapResponse({
              next: ({ projectId }) => {
                sub.unsubscribe();
                patchState(store, {
                  step: 'complete',
                  loading: false,
                  createdProjectId: projectId,
                });
                projectStore.selectProject(projectId);
                projectStore.loadProjects();
                router.navigate(['/dashboard'], { queryParams: { tour: 'start' } });
              },
              error: (error: Error) => {
                sub.unsubscribe();
                patchState(store, {
                  step: 'welcome',
                  loading: false,
                  error: error.message || 'Une erreur est survenue lors de la création du projet démo.',
                });
              },
            }),
          );
        }),
      )
    ),

    createCustomProject: rxMethod<{ name: string; description: string }>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        concatMap(({ name, description }) =>
          projectService.createProject({ name, description: description || null }).pipe(
            tapResponse({
              next: (project) => {
                patchState(store, {
                  step: 'complete',
                  loading: false,
                  createdProjectId: project.id,
                });
                projectStore.selectProject(project.id);
                projectStore.loadProjects();
                router.navigate(['/dashboard'], { queryParams: { tour: 'start' } });
              },
              error: (error: Error) => {
                patchState(store, {
                  loading: false,
                  error: error.message || 'Une erreur est survenue lors de la création du projet.',
                });
              },
            }),
          )
        ),
      )
    ),

    resetError(): void {
      patchState(store, { error: null });
    },
  })),
);
