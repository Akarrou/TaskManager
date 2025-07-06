import { createReducer, on } from '@ngrx/store';
import { EpicKanbanActions, loadFeatureTasks, loadFeatureTasksSuccess, loadFeatureTasksFailure, updateTaskStatus } from './epic-kanban.actions';
import { Task } from '../../../core/services/task';
import { EpicMetrics } from '../models/epic-board.model';

export const epicKanbanFeatureKey = 'epicKanban';

export interface EpicKanbanState {
  epic: Task | null;
  features: Task[];
  tasks: Task[];
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
  on(loadFeatureTasks, (state) => ({ ...state, loadingTasks: true, error: null })),
  on(loadFeatureTasksSuccess, (state, { tasks }) => ({
    ...state,
    loadingTasks: false,
    tasks: tasks, // Here we expect tasks of type Task[], not KanbanItem[]
  })),
  on(loadFeatureTasksFailure, (state, { error }) => ({ ...state, loadingTasks: false, error })),

  // Optimistic update for task status
  on(updateTaskStatus, (state, { taskId, newStatus }) => ({
    ...state,
    tasks: state.tasks.map(t => t.id === taskId ? { ...t, status: newStatus as Task['status'] } : t)
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
