import { createReducer, on } from '@ngrx/store';
import { Task } from '../../../core/services/task';
import { EpicBoard, KanbanColumn, EpicMetrics } from '../models/epic-board.model';
import { DEFAULT_KANBAN_COLUMNS } from '../models/kanban-constants';
import { EpicKanbanActions } from './epic-kanban.actions';

export interface EpicKanbanState {
  // Données principales
  epicBoard: EpicBoard | null;
  currentEpic: Task | null;
  features: Task[];
  tasks: Task[];
  columns: KanbanColumn[];
  metrics: EpicMetrics | null;

  // États UI
  expandedFeatures: Set<string>;
  loading: boolean;
  saving: boolean;
  error: string | null;

  // Filtres
  filters: {
    searchText: string;
    priority: string | null;
    assignee: string | null;
    status: string | null;
  };

  // Meta
  lastUpdated: Date | null;
}

export const initialState: EpicKanbanState = {
  // Données principales
  epicBoard: null,
  currentEpic: null,
  features: [],
  tasks: [],
  columns: [...DEFAULT_KANBAN_COLUMNS],
  metrics: null,

  // États UI
  expandedFeatures: new Set<string>(),
  loading: false,
  saving: false,
  error: null,

  // Filtres
  filters: {
    searchText: '',
    priority: null,
    assignee: null,
    status: null
  },

  // Meta
  lastUpdated: null
};

export const epicKanbanReducer = createReducer(
  initialState,

  // Chargement Epic Board
  on(EpicKanbanActions.loadEpicBoard, (state) => ({
    ...state,
    loading: true,
    error: null
  })),

  on(EpicKanbanActions.loadEpicBoardSuccess, (state, { epicBoard }) => ({
    ...state,
    epicBoard,
    currentEpic: epicBoard.epic,
    features: epicBoard.features,
    tasks: epicBoard.tasks,
    metrics: epicBoard.metrics,
    loading: false,
    error: null,
    lastUpdated: new Date()
  })),

  on(EpicKanbanActions.loadEpicBoardFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error
  })),

  // Gestion Features - Move
  on(EpicKanbanActions.moveFeature, (state) => ({
    ...state,
    saving: true,
    error: null
  })),

  on(EpicKanbanActions.moveFeatureSuccess, (state, { featureId, newStatus }) => ({
    ...state,
    features: state.features.map(feature =>
      feature.id === featureId 
        ? { ...feature, status: newStatus as any }
        : feature
    ),
    saving: false,
    error: null,
    lastUpdated: new Date()
  })),

  on(EpicKanbanActions.moveFeatureFailure, (state, { error }) => ({
    ...state,
    saving: false,
    error
  })),

  // Gestion Tasks - Update Status
  on(EpicKanbanActions.updateTaskStatus, (state) => ({
    ...state,
    saving: true,
    error: null
  })),

  on(EpicKanbanActions.updateTaskStatusSuccess, (state, { taskId, newStatus }) => ({
    ...state,
    tasks: state.tasks.map(task =>
      task.id === taskId 
        ? { ...task, status: newStatus as any }
        : task
    ),
    saving: false,
    error: null,
    lastUpdated: new Date()
  })),

  on(EpicKanbanActions.updateTaskStatusFailure, (state, { error }) => ({
    ...state,
    saving: false,
    error
  })),

  // Gestion des colonnes
  on(EpicKanbanActions.updateColumnsConfiguration, (state) => ({
    ...state,
    saving: true,
    error: null
  })),

  on(EpicKanbanActions.updateColumnsConfigurationSuccess, (state, { columns }) => ({
    ...state,
    columns,
    saving: false,
    error: null,
    lastUpdated: new Date()
  })),

  on(EpicKanbanActions.updateColumnsConfigurationFailure, (state, { error }) => ({
    ...state,
    saving: false,
    error
  })),

  // Expansion des features
  on(EpicKanbanActions.toggleFeatureExpansion, (state, { featureId }) => {
    const newExpandedFeatures = new Set(state.expandedFeatures);
    if (newExpandedFeatures.has(featureId)) {
      newExpandedFeatures.delete(featureId);
    } else {
      newExpandedFeatures.add(featureId);
    }
    return {
      ...state,
      expandedFeatures: newExpandedFeatures
    };
  }),

  on(EpicKanbanActions.expandAllFeatures, (state) => ({
    ...state,
    expandedFeatures: new Set(state.features.map(f => f.id).filter((id): id is string => id !== undefined))
  })),

  on(EpicKanbanActions.collapseAllFeatures, (state) => ({
    ...state,
    expandedFeatures: new Set<string>()
  })),

  // Filtres
  on(EpicKanbanActions.updateFilters, (state, { searchText, priority, assignee, status }) => ({
    ...state,
    filters: {
      ...state.filters,
      ...(searchText !== undefined && { searchText }),
      ...(priority !== undefined && { priority }),
      ...(assignee !== undefined && { assignee }),
      ...(status !== undefined && { status })
    }
  })),

  on(EpicKanbanActions.clearFilters, (state) => ({
    ...state,
    filters: {
      searchText: '',
      priority: null,
      assignee: null,
      status: null
    }
  })),

  // Actions sur Epic
  on(EpicKanbanActions.updateEpic, (state) => ({
    ...state,
    saving: true,
    error: null
  })),

  on(EpicKanbanActions.updateEpicSuccess, (state, { epic }) => ({
    ...state,
    currentEpic: epic,
    epicBoard: state.epicBoard ? { ...state.epicBoard, epic } : null,
    saving: false,
    error: null,
    lastUpdated: new Date()
  })),

  on(EpicKanbanActions.updateEpicFailure, (state, { error }) => ({
    ...state,
    saving: false,
    error
  })),

  // Métriques
  on(EpicKanbanActions.refreshMetrics, (state) => ({
    ...state,
    loading: true,
    error: null
  })),

  on(EpicKanbanActions.refreshMetricsSuccess, (state, { metrics }) => ({
    ...state,
    metrics,
    loading: false,
    error: null,
    lastUpdated: new Date()
  })),

  on(EpicKanbanActions.refreshMetricsFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error
  })),

  // Reset state
  on(EpicKanbanActions.resetEpicKanbanState, () => ({
    ...initialState
  })),

  // Drag & Drop state
  on(EpicKanbanActions.startFeatureDrag, (state, { featureId }) => ({
    ...state,
    // Peut ajouter un état de drag si nécessaire
  })),

  on(EpicKanbanActions.endFeatureDrag, (state) => ({
    ...state,
    // Reset drag state si nécessaire
  })),

  on(EpicKanbanActions.moveFeatureComplete, (state, { moveEvent }) => ({
    ...state,
    features: state.features.map(feature =>
      feature.id === moveEvent.taskId 
        ? { ...feature, status: moveEvent.newStatus as any }
        : feature
    ),
    lastUpdated: new Date()
  })),

  // Bulk operations
  on(EpicKanbanActions.bulkUpdateFeatures, (state) => ({
    ...state,
    saving: true,
    error: null
  })),

  on(EpicKanbanActions.bulkUpdateFeaturesSuccess, (state, { updatedFeatures }) => ({
    ...state,
    features: state.features.map(feature => {
      const updated = updatedFeatures.find(u => u.id === feature.id);
      return updated || feature;
    }),
    saving: false,
    error: null,
    lastUpdated: new Date()
  })),

  on(EpicKanbanActions.bulkUpdateFeaturesFailure, (state, { error }) => ({
    ...state,
    saving: false,
    error
  }))
); 