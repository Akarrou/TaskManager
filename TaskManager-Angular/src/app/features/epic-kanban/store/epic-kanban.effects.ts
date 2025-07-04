import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { catchError, map, switchMap, tap, withLatestFrom, filter } from 'rxjs/operators';
import { of, from } from 'rxjs';
import { Router } from '@angular/router';

import { EpicKanbanActions } from './epic-kanban.actions';
import { EpicKanbanService } from '../services/epic-kanban.service';
import { TaskService, Task } from '../../../core/services/task';
import * as ProjectActions from '../../projects/store/project.actions';
import { selectCurrentEpic } from './epic-kanban.selectors';

@Injectable()
export class EpicKanbanEffects {
  private actions$ = inject(Actions);
  private store = inject(Store);
  private epicKanbanService = inject(EpicKanbanService);
  private taskService = inject(TaskService);
  private router = inject(Router);

  // Rediriger si l'epic actuel n'appartient pas au projet sélectionné
  redirectOnProjectChange$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ProjectActions.selectProject),
      withLatestFrom(this.store.select(selectCurrentEpic)),
      filter(([{ projectId }, epic]) => {
        // Ne rien faire si aucun epic n'est chargé
        if (!epic || !epic.id) {
          return false;
        }
        // Rediriger si l'epic n'appartient pas au projet
        return epic.project_id !== projectId;
      }),
      tap(() => this.router.navigate(['/dashboard']))
    ),
    { dispatch: false }
  );

  // Charger Epic Board
  loadEpicBoard$ = createEffect(() =>
    this.actions$.pipe(
      ofType(EpicKanbanActions.loadEpicBoard),
      switchMap(({ epicId }) =>
        from(this.epicKanbanService.loadEpicBoard(epicId)).pipe(
          map(epicBoard => EpicKanbanActions.loadEpicBoardSuccess({ epicBoard })),
          catchError(error => of(EpicKanbanActions.loadEpicBoardFailure({
            error: error?.message || 'Erreur lors du chargement du board Epic'
          })))
        )
      )
    )
  );

  // Redirection en cas d'échec de chargement du board
  loadEpicBoardFailure$ = createEffect(() =>
    this.actions$.pipe(
      ofType(EpicKanbanActions.loadEpicBoardFailure),
      tap(() => this.router.navigate(['/dashboard']))
    ),
    { dispatch: false }
  );

  // Déplacer Feature
  moveFeature$ = createEffect(() =>
    this.actions$.pipe(
      ofType(EpicKanbanActions.moveFeature),
      switchMap(({ featureId, fromColumnId, toColumnId, newStatus }) => {
        return from(this.taskService.updateTask(featureId, { status: newStatus as any })).pipe(
          map((success) => {
            if (success) {
              return EpicKanbanActions.moveFeatureSuccess({ featureId, newStatus });
            } else {
              return EpicKanbanActions.moveFeatureFailure({
                error: 'Échec de la mise à jour en base de données'
              });
            }
          }),
          catchError(error => {
            return of(EpicKanbanActions.moveFeatureFailure({
              error: error?.message || 'Erreur lors du déplacement de la feature'
            }));
          })
        );
      })
    )
  );

  // Mettre à jour statut Task
  updateTaskStatus$ = createEffect(() =>
    this.actions$.pipe(
      ofType(EpicKanbanActions.updateTaskStatus),
      switchMap(({ taskId, newStatus }) =>
        from(this.taskService.updateTask(taskId, { status: newStatus as any })).pipe(
          map(() => EpicKanbanActions.updateTaskStatusSuccess({ taskId, newStatus })),
          catchError(error => of(EpicKanbanActions.updateTaskStatusFailure({
            error: error?.message || 'Erreur lors de la mise à jour du statut'
          })))
        )
      )
    )
  );

  // Auto-refresh après mise à jour de Feature
  autoRefreshAfterFeatureMove$ = createEffect(() =>
    this.actions$.pipe(
      ofType(EpicKanbanActions.moveFeatureSuccess),
      map(() => EpicKanbanActions.refreshMetrics())
    )
  );

  // Auto-refresh après mise à jour de Task
  autoRefreshAfterTaskUpdate$ = createEffect(() =>
    this.actions$.pipe(
      ofType(EpicKanbanActions.updateTaskStatusSuccess),
      map(() => EpicKanbanActions.refreshMetrics())
    )
  );

  // Refresh métriques
  refreshMetrics$ = createEffect(() =>
    this.actions$.pipe(
      ofType(EpicKanbanActions.refreshMetrics),
      switchMap(() => {
        // Récupérer l'epic ID depuis le store ou depuis le state actuel
        const currentState = this.store.pipe(map(state => (state as any).epicKanban));
        return currentState.pipe(
          switchMap(epicKanbanState => {
            if (epicKanbanState?.currentEpic?.id) {
              return from(this.epicKanbanService.loadEpicBoard(epicKanbanState.currentEpic.id)).pipe(
                map(epicBoard => EpicKanbanActions.refreshMetricsSuccess({
                  metrics: epicBoard.metrics
                })),
                catchError(error => of(EpicKanbanActions.refreshMetricsFailure({
                  error: error?.message || 'Erreur lors du rafraîchissement des métriques'
                })))
              );
            }
            return of(EpicKanbanActions.refreshMetricsFailure({
              error: 'Aucun epic actuel trouvé'
            }));
          })
        );
      })
    )
  );

  // Bulk update features
  bulkUpdateFeatures$ = createEffect(() =>
    this.actions$.pipe(
      ofType(EpicKanbanActions.bulkUpdateFeatures),
      switchMap(({ featureIds, updates }) => {
        const updatePromises = featureIds.map(id =>
          this.taskService.updateTask(id, updates)
        );

        return from(Promise.all(updatePromises)).pipe(
          switchMap(() =>
            // Recharger les données pour obtenir les features mises à jour
            from(this.taskService.loadTasks()).pipe(
              map(() => {
                const allTasks = this.taskService.tasks();
                const updatedFeatures = allTasks.filter(task =>
                  featureIds.includes(task.id || '') && task.type === 'feature'
                );
                return EpicKanbanActions.bulkUpdateFeaturesSuccess({ updatedFeatures });
              })
            )
          ),
          catchError(error => of(EpicKanbanActions.bulkUpdateFeaturesFailure({
            error: error?.message || 'Erreur lors de la mise à jour des features'
          })))
        );
      })
    )
  );

  // Auto-refresh après bulk update
  autoRefreshAfterBulkUpdate$ = createEffect(() =>
    this.actions$.pipe(
      ofType(EpicKanbanActions.bulkUpdateFeaturesSuccess),
      map(() => EpicKanbanActions.refreshMetrics())
    )
  );

  // T018 - Update Task
  updateTask$ = createEffect(() =>
    this.actions$.pipe(
      ofType(EpicKanbanActions.updateTask),
      switchMap(({ task }) =>
        from(this.taskService.updateTask(task.id!, task)).pipe(
          map(() => EpicKanbanActions.updateTaskSuccess({ task })),
          catchError(error => of(EpicKanbanActions.updateTaskFailure({
            error: error?.message || 'Erreur lors de la mise à jour de la tâche'
          })))
        )
      )
    )
  );

  // T018 - Delete Task
  deleteTask$ = createEffect(() =>
    this.actions$.pipe(
      ofType(EpicKanbanActions.deleteTask),
      switchMap(({ taskId }) =>
        from(this.taskService.deleteTask(taskId)).pipe(
          map(() => EpicKanbanActions.deleteTaskSuccess({ taskId })),
          catchError(error => of(EpicKanbanActions.deleteTaskFailure({
            error: error?.message || 'Erreur lors de la suppression de la tâche'
          })))
        )
      )
    )
  );

  // T018 - Create Task
  createTask$ = createEffect(() =>
    this.actions$.pipe(
      ofType(EpicKanbanActions.createTask),
      switchMap(({ task }) => {
        const taskToCreate = {
          ...task,
          priority: task.priority || 'medium' as const
        };
        return from(this.taskService.createTask(taskToCreate as any)).pipe(
          map(success => EpicKanbanActions.createTaskSuccess({ task: task as Task })),
          catchError(error => of(EpicKanbanActions.createTaskFailure({
            error: error?.message || 'Erreur lors de la création de la tâche'
          })))
        );
      })
    )
  );

  // T018 - Auto-refresh après operations sur tasks
  autoRefreshAfterTaskOperations$ = createEffect(() =>
    this.actions$.pipe(
      ofType(
        EpicKanbanActions.updateTaskSuccess,
        EpicKanbanActions.deleteTaskSuccess,
        EpicKanbanActions.createTaskSuccess
      ),
      map(() => EpicKanbanActions.refreshMetrics())
    )
  );
}
