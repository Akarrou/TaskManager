import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { catchError, map, switchMap } from 'rxjs/operators';
import { of, from } from 'rxjs';

import { EpicKanbanActions } from './epic-kanban.actions';
import { EpicKanbanService } from '../services/epic-kanban.service';
import { TaskService } from '../../../core/services/task';

@Injectable()
export class EpicKanbanEffects {
  private actions$ = inject(Actions);
  private store = inject(Store);
  private epicKanbanService = inject(EpicKanbanService);
  private taskService = inject(TaskService);

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

  // Déplacer Feature
  moveFeature$ = createEffect(() =>
    this.actions$.pipe(
      ofType(EpicKanbanActions.moveFeature),
      switchMap(({ featureId, fromColumnId, toColumnId, newStatus }) =>
        from(this.taskService.updateTask(featureId, { status: newStatus as any })).pipe(
          map(() => EpicKanbanActions.moveFeatureSuccess({ featureId, newStatus })),
          catchError(error => of(EpicKanbanActions.moveFeatureFailure({ 
            error: error?.message || 'Erreur lors du déplacement de la feature' 
          })))
        )
      )
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
} 