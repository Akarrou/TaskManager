import { createReducer, on } from '@ngrx/store';
import { EpicKanbanActions } from './epic-kanban.actions';
import { Task } from '../../../core/services/task';
import { EpicMetrics } from '../models/epic-board.model';
import { KanbanSearchFilters } from '../components/search-filters/search-filters.component';

export const epicKanbanFeatureKey = 'epicKanban';

export interface EpicKanbanState {
  epic: Task | null;
  features: Task[];
  tasks: Task[];
  featureTasks: Task[]; // Tasks for the feature-specific kanban
  currentFeatureId: string | null; // ID of the feature being viewed
  metrics: EpicMetrics | null;
  loading: boolean;
  loadingTasks: boolean;
  saving: boolean;
  error: string | null;
  expandedFeatures: Set<string>;
  filters: KanbanSearchFilters;
}

export const initialState: EpicKanbanState = {
  epic: null,
  features: [],
  tasks: [],
  featureTasks: [],
  currentFeatureId: null,
  metrics: null,
  loading: false,
  loadingTasks: false,
  saving: false,
  error: null,
  expandedFeatures: new Set<string>(),
  filters: {
    searchText: '',
    priority: null,
    assignee: null,
    status: null,
    environment: null,
    tags: []
  }
};

export const epicKanbanReducer = createReducer(
  initialState,
  on(EpicKanbanActions.loadEpicBoard, (state) => ({ ...state, loading: true, error: null })),
  on(EpicKanbanActions.loadEpicBoardSuccess, (state, { epicBoard }) => ({
    ...state,
    loading: false,
    epic: epicBoard.epic,
    features: epicBoard.features,
    tasks: epicBoard.tasks, // Store all tasks initially
    metrics: epicBoard.metrics,
  })),
  on(EpicKanbanActions.loadEpicBoardFailure, (state, { error }) => ({ ...state, loading: false, error })),

  // Reducers for Feature Kanban
  on(EpicKanbanActions.loadFeatureTasks, (state, { featureId }) => ({
    ...state,
    loadingTasks: true,
    error: null,
    featureTasks: [],
    currentFeatureId: featureId
  })),
  on(EpicKanbanActions.loadFeatureTasksSuccess, (state, { feature, tasks }) => {
    // Upsert the feature into the features array
    const featureExists = state.features.some(f => f.id === feature.id);
    const updatedFeatures = featureExists
      ? state.features.map(f => f.id === feature.id ? feature : f)
      : [...state.features, feature];

    return {
      ...state,
      loadingTasks: false,
      featureTasks: tasks,
      features: updatedFeatures,
    };
  }),
  on(EpicKanbanActions.loadFeatureTasksFailure, (state, { error }) => ({ ...state, loadingTasks: false, error })),

  // Optimistic update for task status
  on(EpicKanbanActions.updateTaskStatus, (state, { taskId, newStatus }) => {
    const newStatusTyped = newStatus as Task['status'];
    return {
      ...state,
      tasks: state.tasks.map(t => t.id === taskId ? { ...t, status: newStatusTyped } : t),
      featureTasks: state.featureTasks.map(t => t.id === taskId ? { ...t, status: newStatusTyped } : t)
    };
  }),

  // Optimistic update for feature movement
  on(EpicKanbanActions.moveFeature, (state, { featureId, newStatus }) => {
    return {
      ...state,
      features: state.features.map(feature =>
        feature.id === featureId
          ? { ...feature, status: newStatus as Task['status'] }
          : feature
      ),
    };
  }),

  on(EpicKanbanActions.moveFeatureFailure, (state, { error }) => ({
    // Here you might want to revert the optimistic update
    // For now, just log the error. A more robust solution would be to
    // store the original state before the optimistic update.
    ...state,
    error,
  })),

  // Handle task updates from main epic view as well
  on(EpicKanbanActions.updateTaskSuccess, (state, { task }) => ({
    ...state,
    tasks: state.tasks.map(t => t.id === task.id ? { ...t, ...task } : t),
    features: state.features.map(f => f.id === task.id ? { ...f, ...task } : f),
  })),

  on(EpicKanbanActions.toggleFeatureExpansion, (state, { featureId }) => {
    const newSet = new Set(state.expandedFeatures);
    if (newSet.has(featureId)) {
      newSet.delete(featureId);
    } else {
      newSet.add(featureId);
    }
    return { ...state, expandedFeatures: newSet };
  }),

  // Filter actions
  on(EpicKanbanActions.updateFilters, (state, filters) => ({
    ...state,
    filters: {
      searchText: filters.searchText ?? state.filters.searchText,
      priority: filters.priority ?? state.filters.priority,
      assignee: filters.assignee ?? state.filters.assignee,
      status: filters.status ?? state.filters.status,
      environment: filters.environment ?? state.filters.environment,
      tags: filters.tags ?? state.filters.tags
    }
  })),

  on(EpicKanbanActions.clearFilters, (state) => ({
    ...state,
    filters: {
      searchText: '',
      priority: null,
      assignee: null,
      status: null,
      environment: null,
      tags: []
    }
  }))
);
