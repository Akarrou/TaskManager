import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';
import { inject } from '@angular/core';
import { TaskDatabaseService, TaskStats } from '../services/task-database.service';
import { DocumentService } from '../../features/documents/services/document.service';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, tap, switchMap, catchError, of, forkJoin } from 'rxjs';

/**
 * Interface pour les statistiques de documents
 */
export interface DocumentStats {
  total: number;
  recentCount: number;
  byType?: Record<string, number>;
}

/**
 * État du store de statistiques unifié pour le dashboard
 */
interface DashboardStatsState {
  taskStats: TaskStats;
  documentStats: DocumentStats;
  taskLoading: boolean;
  documentLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

/**
 * Store NgRx SignalStore pour gérer les statistiques du dashboard
 *
 * Centralise les stats de tâches ET documents
 * Partage entre General Dashboard et Tasks Dashboard
 *
 * @example
 * ```typescript
 * export class DashboardComponent implements OnInit {
 *   private dashboardStatsStore = inject(DashboardStatsStore);
 *
 *   ngOnInit() {
 *     // Charger toutes les stats
 *     this.dashboardStatsStore.loadAllStats({});
 *   }
 *
 *   stats = computed(() => {
 *     const taskStats = this.dashboardStatsStore.taskStats();
 *     return [
 *       { title: 'Total', value: taskStats.total },
 *       ...
 *     ];
 *   });
 * }
 * ```
 */
export const DashboardStatsStore = signalStore(
  { providedIn: 'root' },

  // État initial
  withState<DashboardStatsState>({
    taskStats: {
      total: 0,
      pending: 0,
      inProgress: 0,
      completed: 0,
      blocked: 0,
      completionRate: 0
    },
    documentStats: {
      total: 0,
      recentCount: 0,
      byType: {}
    },
    taskLoading: false,
    documentLoading: false,
    error: null,
    lastUpdated: null
  }),

  // Méthodes publiques
  withMethods((
    store,
    taskDatabaseService = inject(TaskDatabaseService),
    documentService = inject(DocumentService)
  ) => ({
    /**
     * Charger les statistiques des tâches depuis la BDD via RPC
     *
     * Utilise la fonction RPC Supabase 'get_task_stats_aggregated'
     * pour un calcul côté serveur performant.
     *
     * @param projectId - ID du projet pour filtrer les tâches (optionnel)
     */
    loadTaskStats: rxMethod<{ projectId?: string }>(
      pipe(
        tap(() => patchState(store, { taskLoading: true, error: null })),
        switchMap(({ projectId }) =>
          taskDatabaseService.getTaskStatsFromDatabase(projectId).pipe(
            tap(taskStats => {
              patchState(store, {
                taskStats,
                taskLoading: false,
                lastUpdated: new Date()
              });
            }),
            catchError((error: Error) => {
              patchState(store, {
                error: error.message,
                taskLoading: false
              });
              return of(null);
            })
          )
        )
      )
    ),

    /**
     * Charger les statistiques des documents
     *
     * Utilise DocumentService.getDocumentsStats() pour récupérer
     * le nombre total de documents et documents récents.
     */
    loadDocumentStats: rxMethod<void>(
      pipe(
        tap(() => patchState(store, { documentLoading: true, error: null })),
        switchMap(() =>
          documentService.getDocumentsStats().pipe(
            tap(documentStats => {
              patchState(store, {
                documentStats,
                documentLoading: false,
                lastUpdated: new Date()
              });
            }),
            catchError((error: Error) => {
              patchState(store, {
                error: error.message,
                documentLoading: false
              });
              return of(null);
            })
          )
        )
      )
    ),

    /**
     * Charger toutes les stats en parallèle
     *
     * Utilise forkJoin pour charger les stats de tâches ET documents
     * en parallèle pour une performance optimale.
     *
     * Recommandé pour le General Dashboard qui affiche les deux types de stats.
     *
     * @param projectId - ID du projet pour filtrer les tâches (optionnel)
     */
    loadAllStats: rxMethod<{ projectId?: string }>(
      pipe(
        tap(() => patchState(store, {
          taskLoading: true,
          documentLoading: true,
          error: null
        })),
        switchMap(({ projectId }) =>
          forkJoin({
            taskStats: taskDatabaseService.getTaskStatsFromDatabase(projectId),
            documentStats: documentService.getDocumentsStats()
          }).pipe(
            tap(({ taskStats, documentStats }) => {
              patchState(store, {
                taskStats,
                documentStats,
                taskLoading: false,
                documentLoading: false,
                lastUpdated: new Date()
              });
            }),
            catchError((error: Error) => {
              patchState(store, {
                error: error.message,
                taskLoading: false,
                documentLoading: false
              });
              return of(null);
            })
          )
        )
      )
    ),

    /**
     * Réinitialiser toutes les stats
     *
     * Remet les stats à zéro et efface les erreurs.
     */
    reset(): void {
      patchState(store, {
        taskStats: {
          total: 0,
          pending: 0,
          inProgress: 0,
          completed: 0,
          blocked: 0,
          completionRate: 0
        },
        documentStats: {
          total: 0,
          recentCount: 0,
          byType: {}
        },
        taskLoading: false,
        documentLoading: false,
        error: null,
        lastUpdated: null
      });
    },

    /**
     * Rafraîchir toutes les stats
     *
     * Recharge les stats de tâches et documents en parallèle.
     *
     * @param projectId - ID du projet pour filtrer les tâches (optionnel)
     */
    refresh: rxMethod<{ projectId?: string }>(
      pipe(
        tap(() => patchState(store, {
          taskLoading: true,
          documentLoading: true,
          error: null
        })),
        switchMap(({ projectId }) =>
          forkJoin({
            taskStats: taskDatabaseService.getTaskStatsFromDatabase(projectId),
            documentStats: documentService.getDocumentsStats()
          }).pipe(
            tap(({ taskStats, documentStats }) => {
              patchState(store, {
                taskStats,
                documentStats,
                taskLoading: false,
                documentLoading: false,
                lastUpdated: new Date()
              });
            }),
            catchError((error: Error) => {
              patchState(store, {
                error: error.message,
                taskLoading: false,
                documentLoading: false
              });
              return of(null);
            })
          )
        )
      )
    )
  }))
);
