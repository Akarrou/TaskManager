import { createSelector, createFeatureSelector } from '@ngrx/store';
import * as fromReducer from './epic-kanban.reducer';
import * as fromRouter from '@ngrx/router-store';
import { Task } from '../../../core/services/task';
import { KanbanItem } from '../models/kanban-item.model';
import { DEFAULT_KANBAN_COLUMNS } from '../models/kanban-constants';

export const selectEpicKanbanState = createFeatureSelector<fromReducer.EpicKanbanState>(
  fromReducer.epicKanbanFeatureKey
);
export const selectRouterState = createFeatureSelector<fromRouter.RouterReducerState>('router');

export const selectAllFeatures = createSelector(selectEpicKanbanState, (state) => state.features);
export const selectAllTasks = createSelector(selectEpicKanbanState, (state) => state.tasks);
export const selectLoading = createSelector(selectEpicKanbanState, (state) => state.loading);
export const selectError = createSelector(selectEpicKanbanState, (state) => state.error);
export const selectExpandedFeatures = createSelector(selectEpicKanbanState, state => state.expandedFeatures);
export const selectMetrics = createSelector(selectEpicKanbanState, state => state.metrics);
export const selectCurrentEpic = createSelector(selectEpicKanbanState, state => state.epic);

export const selectColumns = createSelector(
  selectEpicKanbanState,
  (state) => DEFAULT_KANBAN_COLUMNS
);

export const selectCurrentEpicAsKanbanItem = createSelector(
  selectCurrentEpic,
  (epic) => epic ? taskToKanbanItem(epic) : null
)

export const selectFeaturesAsKanbanItems = createSelector(
  selectAllFeatures,
  (features): KanbanItem[] => features.map(f => taskToKanbanItem(f as unknown as Task))
);

// Selectors for Feature Kanban View
export const selectCurrentFeatureId = createSelector(
  selectRouterState,
  (router) => router?.state?.root?.firstChild?.params['featureId']
);

export const selectCurrentFeature = createSelector(
  selectAllFeatures,
  selectCurrentFeatureId,
  (features, featureId) => features.find(f => f.id === featureId)
);

export const selectCurrentFeatureAsKanbanItem = createSelector(
  selectCurrentFeature,
  (feature) => feature ? taskToKanbanItem(feature as unknown as Task) : null
);

export const selectTasksForCurrentFeature = createSelector(
  selectAllTasks,
  selectCurrentFeatureId,
  (tasks, featureId) => tasks.filter(t => t.feature_id === featureId)
);

// New selector for the dedicated feature kanban tasks
export const selectFeatureTasks = createSelector(
  selectEpicKanbanState,
  (state) => state.featureTasks
);

export const selectTasksForCurrentFeatureAsKanbanItems = createSelector(
  selectFeatureTasks,
  (tasks): KanbanItem[] => tasks.map(t => taskToKanbanItem(t as unknown as Task))
);

export const selectFeatureTasksLoading = createSelector(
  selectEpicKanbanState,
  (state) => state.loadingTasks
);

export const selectFeatureTasksError = createSelector(
  selectEpicKanbanState,
  (state) => state.error
);

// Helper function
function taskToKanbanItem(task: Task): KanbanItem {
  let type_icon = '';
  switch (task.type) {
    case 'epic': type_icon = 'E'; break;
    case 'feature': type_icon = 'F'; break;
    case 'task': type_icon = 'T'; break;
  }
  return {
    id: task.id!,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    type: task.type,
    task_number: task.task_number,
    type_icon: type_icon,
    tags: task.tags,
    assignee: task.assigned_to,
    dueDate: task.due_date,
  };
}
