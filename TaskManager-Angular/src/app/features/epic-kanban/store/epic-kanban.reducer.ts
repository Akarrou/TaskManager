import { createReducer, on } from '@ngrx/store';
import { EpicKanbanActions } from './epic-kanban.actions';
import { Task } from '../../../core/services/task';
import { EpicMetrics } from '../models/epic-board.model';

export const epicKanbanFeatureKey = 'epicKanban';

export interface EpicKanbanState {
  epic: Task | null;
  features: Task[];
  tasks: Task[];
  featureTasks: Task[]; // Tasks for the feature-specific kanban
  metrics: EpicMetrics | null;
  loading: boolean;
  loadingTasks: boolean;
  saving: boolean;
  error: string | null;
  expandedFeatures: Set<string>;
}

export const initialState: EpicKanbanState = {
  epic: null,
  features: [],
  tasks: [],
  featureTasks: [],
  metrics: null,
  loading: false,
  loadingTasks: false,
  saving: false,
  error: null,
  expandedFeatures: new Set<string>(),
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
  on(EpicKanbanActions.loadFeatureTasks, (state) => ({ ...state, loadingTasks: true, error: null, featureTasks: [] })),
  on(EpicKanbanActions.loadFeatureTasksSuccess, (state, { tasks }) => ({
    ...state,
    loadingTasks: false,
    featureTasks: tasks,
  })),
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
  })
);
