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
export const selectFilters = createSelector(selectEpicKanbanState, state => state.filters);

export const selectColumns = createSelector(
  selectEpicKanbanState,
  () => DEFAULT_KANBAN_COLUMNS
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
  selectEpicKanbanState,
  (state) => state.currentFeatureId
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

export const selectFeatureTasksLoading = createSelector(
  selectEpicKanbanState,
  (state) => state.loadingTasks
);

export const selectFeatureTasksError = createSelector(
  selectEpicKanbanState,
  (state) => state.error
);

// Filtered selectors
export const selectFilteredFeatures = createSelector(
  selectAllFeatures,
  selectFilters,
  (features, filters) => {
    return features.filter(feature => {
      // Search text filter
      if (filters.searchText) {
        const searchLower = filters.searchText.toLowerCase();
        const titleMatch = feature.title?.toLowerCase().includes(searchLower);
        const descMatch = feature.description?.toLowerCase().includes(searchLower);
        const taskNumberMatch = feature.task_number?.toString().toLowerCase().includes(searchLower);
        if (!titleMatch && !descMatch && !taskNumberMatch) {
          return false;
        }
      }
      
      // Priority filter
      if (filters.priority && feature.priority !== filters.priority) {
        return false;
      }
      
      // Status filter
      if (filters.status && feature.status !== filters.status) {
        return false;
      }
      
      // Assignee filter
      if (filters.assignee) {
        if (filters.assignee === 'unassigned' && feature.assigned_to) {
          return false;
        }
        if (filters.assignee !== 'unassigned' && feature.assigned_to !== filters.assignee) {
          return false;
        }
      }
      
      // Environment filter - handle environment as string or array
      if (filters.environment) {
        const featureEnv = Array.isArray(feature.environment) ? feature.environment[0] : feature.environment;
        if (featureEnv !== filters.environment) {
          return false;
        }
      }
      
      // Tags filter
      if (filters.tags && filters.tags.length > 0) {
        const featureTags = feature.tags || [];
        const hasAllTags = filters.tags.every(tag => featureTags.includes(tag));
        if (!hasAllTags) {
          return false;
        }
      }
      
      return true;
    });
  }
);

export const selectFilteredFeaturesAsKanbanItems = createSelector(
  selectFilteredFeatures,
  (features): KanbanItem[] => features.map(f => taskToKanbanItem(f as unknown as Task))
);

export const selectFilteredTasks = createSelector(
  selectFeatureTasks,
  selectFilters,
  (tasks, filters) => {
    return tasks.filter(task => {
      // Search text filter
      if (filters.searchText) {
        const searchLower = filters.searchText.toLowerCase();
        const titleMatch = task.title?.toLowerCase().includes(searchLower);
        const descMatch = task.description?.toLowerCase().includes(searchLower);
        const taskNumberMatch = task.task_number?.toString().toLowerCase().includes(searchLower);
        if (!titleMatch && !descMatch && !taskNumberMatch) {
          return false;
        }
      }
      
      // Priority filter
      if (filters.priority && task.priority !== filters.priority) {
        return false;
      }
      
      // Status filter
      if (filters.status && task.status !== filters.status) {
        return false;
      }
      
      // Assignee filter
      if (filters.assignee) {
        if (filters.assignee === 'unassigned' && task.assigned_to) {
          return false;
        }
        if (filters.assignee !== 'unassigned' && task.assigned_to !== filters.assignee) {
          return false;
        }
      }
      
      // Environment filter - handle environment as string or array
      if (filters.environment) {
        const taskEnv = Array.isArray(task.environment) ? task.environment[0] : task.environment;
        if (taskEnv !== filters.environment) {
          return false;
        }
      }
      
      // Tags filter
      if (filters.tags && filters.tags.length > 0) {
        const taskTags = task.tags || [];
        const hasAllTags = filters.tags.every(tag => taskTags.includes(tag));
        if (!hasAllTags) {
          return false;
        }
      }
      
      return true;
    });
  }
);

export const selectFilteredTasksAsKanbanItems = createSelector(
  selectFilteredTasks,
  (tasks): KanbanItem[] => tasks.map(t => taskToKanbanItem(t as unknown as Task))
);

export const selectTasksForCurrentFeatureAsKanbanItems = createSelector(
  selectFilteredTasks,
  (tasks): KanbanItem[] => tasks.map(t => taskToKanbanItem(t as unknown as Task))
);

// Unique values selectors for filter options
export const selectUniqueAssignees = createSelector(
  selectAllFeatures,
  selectFeatureTasks,
  (features, tasks) => {
    const allItems = [...features, ...tasks];
    const assignees = new Set<string>();
    allItems.forEach(item => {
      if (item.assigned_to) {
        assignees.add(item.assigned_to);
      }
    });
    return Array.from(assignees);
  }
);

export const selectUniqueEnvironments = createSelector(
  selectAllFeatures,
  selectFeatureTasks,
  (features, tasks) => {
    const allItems = [...features, ...tasks];
    const environments = new Set<string>();
    allItems.forEach(item => {
      if (item.environment) {
        const env = Array.isArray(item.environment) ? item.environment[0] : item.environment;
        if (typeof env === 'string') {
          environments.add(env);
        }
      }
    });
    return Array.from(environments);
  }
);

export const selectUniqueTags = createSelector(
  selectAllFeatures,
  selectFeatureTasks,
  (features, tasks) => {
    const allItems = [...features, ...tasks];
    const tags = new Set<string>();
    allItems.forEach(item => {
      if (item.tags) {
        item.tags.forEach(tag => tags.add(tag));
      }
    });
    return Array.from(tags);
  }
);

export const selectFilteredFeaturesCount = createSelector(
  selectFilteredFeatures,
  (features) => features.length
);

export const selectFilteredTasksCount = createSelector(
  selectFilteredTasks,
  (tasks) => tasks.length
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
    prd_slug: task.prd_slug,
    environment: task.environment,
    ...(task as any).parent_task_id && { parent_task_id: (task as any).parent_task_id }
  };
}