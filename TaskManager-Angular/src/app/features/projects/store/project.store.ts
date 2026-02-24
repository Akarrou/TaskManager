import { computed, inject } from '@angular/core';
import { signalStore, withState, withMethods, withComputed, withHooks, patchState } from '@ngrx/signals';
import { withEntities, setAllEntities, addEntity, updateEntity, removeEntity } from '@ngrx/signals/entities';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { tapResponse } from '@ngrx/operators';
import { pipe, concatMap, switchMap, tap } from 'rxjs';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Project } from '../models/project.model';
import { ProjectService } from '../services/project.service';
import { TrashService } from '../../../core/services/trash.service';
import { TrashStore } from '../../trash/store/trash.store';
import { withRealtimeSync } from '../../../core/stores/features/with-realtime-sync';

interface ProjectStoreState {
  selectedProjectId: string | null;
  loading: boolean;
  error: string | null;
  showArchived: boolean;
}

export const ProjectStore = signalStore(
  { providedIn: 'root' },

  withEntities<Project>(),

  withState<ProjectStoreState>({
    selectedProjectId: null,
    loading: false,
    error: null,
    showArchived: false,
  }),

  withComputed((store) => ({
    selectedProject: computed(() => {
      const id = store.selectedProjectId();
      if (!id) return null;
      return store.entityMap()[id] ?? null;
    }),
    allProjects: computed(() => store.entities()),
    activeProjects: computed(() => {
      const projects = store.entities();
      if (store.showArchived()) {
        return projects;
      }
      return projects.filter(p => !p.archived);
    }),
    archivedProjects: computed(() => store.entities().filter(p => p.archived)),
    archivedCount: computed(() => store.entities().filter(p => p.archived).length), // derives from same filter, memoized by Angular
  })),

  withMethods((
    store,
    projectService = inject(ProjectService),
    trashService = inject(TrashService),
    trashStore = inject(TrashStore),
    router = inject(Router),
    snackBar = inject(MatSnackBar),
  ) => ({
    selectProject(projectId: string): void {
      patchState(store, { selectedProjectId: projectId });
      localStorage.setItem('selectedProjectId', projectId);
    },

    toggleShowArchived(): void {
      patchState(store, { showArchived: !store.showArchived() });
    },

    loadProjects: rxMethod<void>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        switchMap(() =>
          projectService.getProjects().pipe(
            tapResponse({
              next: (projects) => {
                patchState(store, setAllEntities(projects), { loading: false });
              },
              error: (error: Error) => {
                patchState(store, { loading: false, error: error.message });
              },
            })
          )
        )
      )
    ),

    createProject: rxMethod<{ projectData: Partial<Project>; skipNavigation?: boolean }>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        concatMap(({ projectData, skipNavigation }) =>
          projectService.createProject(projectData).pipe(
            tapResponse({
              next: (project) => {
                patchState(store, addEntity(project), { loading: false });
                if (!skipNavigation) {
                  snackBar.open(`Projet "${project.name}" créé avec succès!`, 'Fermer', { duration: 3000 });
                  router.navigate(['/projects']);
                }
              },
              error: (error: Error) => {
                patchState(store, { loading: false, error: error.message });
              },
            })
          )
        )
      )
    ),

    updateProject: rxMethod<{ projectId: string; projectData: Partial<Project> }>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        concatMap(({ projectId, projectData }) =>
          projectService.updateProject(projectId, projectData).pipe(
            tapResponse({
              next: (project) => {
                patchState(store, updateEntity({ id: project.id, changes: project }), { loading: false });
                snackBar.open(`Projet "${project.name}" modifié avec succès!`, 'Fermer', { duration: 3000 });
                router.navigate(['/projects']);
              },
              error: (error: Error) => {
                patchState(store, { loading: false, error: error.message });
              },
            })
          )
        )
      )
    ),

    deleteProject: rxMethod<{ projectId: string; projectName: string }>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        concatMap(({ projectId, projectName }) =>
          trashService.softDelete(
            'project',
            projectId,
            'projects',
            projectName || 'Projet sans nom',
          ).pipe(
            tapResponse({
              next: () => {
                patchState(store, removeEntity(projectId), { loading: false });
                trashStore.loadTrashCount();
                snackBar.open('Projet déplacé dans la corbeille', 'Fermer', { duration: 3000 });
              },
              error: (error: Error) => {
                patchState(store, { loading: false, error: error.message });
              },
            })
          )
        )
      )
    ),

    archiveProject: rxMethod<{ projectId: string }>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        concatMap(({ projectId }) =>
          projectService.archiveProject(projectId).pipe(
            tapResponse({
              next: (project) => {
                patchState(store, updateEntity({ id: project.id, changes: project }), { loading: false });
                snackBar.open(`Projet "${project.name}" archivé`, 'Fermer', { duration: 3000 });
              },
              error: (error: Error) => {
                patchState(store, { loading: false, error: error.message });
              },
            })
          )
        )
      )
    ),

    restoreProject: rxMethod<{ projectId: string }>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        concatMap(({ projectId }) =>
          projectService.restoreProject(projectId).pipe(
            tapResponse({
              next: (project) => {
                patchState(store, updateEntity({ id: project.id, changes: project }), { loading: false });
                snackBar.open(`Projet "${project.name}" restauré`, 'Fermer', { duration: 3000 });
              },
              error: (error: Error) => {
                patchState(store, { loading: false, error: error.message });
              },
            })
          )
        )
      )
    ),
  })),

  withHooks({
    onInit(store) {
      const savedProjectId = localStorage.getItem('selectedProjectId');
      if (savedProjectId) {
        patchState(store, { selectedProjectId: savedProjectId });
      }
    },
  }),

  withRealtimeSync({
    tables: ['projects'],
    onTableChange: (store) => {
      const fn = store['loadProjects'];
      if (typeof fn === 'function') fn();
    },
  }),
);
