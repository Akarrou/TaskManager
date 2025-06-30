import { createFeatureSelector, createSelector } from '@ngrx/store';
import { EpicKanbanState } from './epic-kanban.reducer';

// Selector de base pour le feature
export const selectEpicKanbanState = createFeatureSelector<EpicKanbanState>('epicKanban');

// Selectors pour les données principales
export const selectEpicBoard = createSelector(
  selectEpicKanbanState,
  (state) => state.epicBoard
);

export const selectCurrentEpic = createSelector(
  selectEpicKanbanState,
  (state) => state.currentEpic
);

export const selectFeatures = createSelector(
  selectEpicKanbanState,
  (state) => state.features
);

export const selectTasks = createSelector(
  selectEpicKanbanState,
  (state) => state.tasks
);

export const selectColumns = createSelector(
  selectEpicKanbanState,
  (state) => state.columns
);

export const selectMetrics = createSelector(
  selectEpicKanbanState,
  (state) => state.metrics
);

// Selectors pour l'état UI
export const selectLoading = createSelector(
  selectEpicKanbanState,
  (state) => state.loading
);

export const selectSaving = createSelector(
  selectEpicKanbanState,
  (state) => state.saving
);

export const selectError = createSelector(
  selectEpicKanbanState,
  (state) => state.error
);

export const selectExpandedFeatures = createSelector(
  selectEpicKanbanState,
  (state) => state.expandedFeatures
);

// Selectors pour les filtres
export const selectEpicKanbanFilters = createSelector(
  selectEpicKanbanState,
  (state) => state.filters
);

export const selectLastUpdated = createSelector(
  selectEpicKanbanState,
  (state) => state.lastUpdated
);

// Selectors composés
export const selectFeaturesByColumn = createSelector(
  selectFeatures,
  selectColumns,
  selectEpicKanbanFilters,
  (features, columns, filters) => {
    const filteredFeatures = applyFilters(features, filters);
    
    return columns.map(column => ({
      ...column,
      features: filteredFeatures.filter(feature => feature.status === column.statusValue)
    }));
  }
);

export const selectTasksForFeature = createSelector(
  selectTasks,
  (tasks) => (featureId: string) => 
    tasks.filter(task => task.parent_task_id === featureId)
);

export const selectFeatureProgress = createSelector(
  selectTasks,
  (tasks) => (featureId: string) => {
    const featureTasks = tasks.filter(task => task.parent_task_id === featureId);
    const completedTasks = featureTasks.filter(task => task.status === 'completed');
    
    return {
      total: featureTasks.length,
      completed: completedTasks.length,
      percentage: featureTasks.length > 0 ? Math.round((completedTasks.length / featureTasks.length) * 100) : 0
    };
  }
);

export const selectIsFeatureExpanded = createSelector(
  selectExpandedFeatures,
  (expandedFeatures) => (featureId: string) => 
    expandedFeatures.has(featureId)
);

export const selectColumnWorkload = createSelector(
  selectFeaturesByColumn,
  (columnFeatures) => 
    columnFeatures.map(column => ({
      ...column,
      count: column.features.length,
      isOverWipLimit: column.wipLimit ? column.features.length > column.wipLimit : false
    }))
);

export const selectHasUnsavedChanges = createSelector(
  selectSaving,
  selectLastUpdated,
  (saving, lastUpdated) => saving || (lastUpdated && (new Date().getTime() - lastUpdated.getTime()) < 5000)
);

export const selectEpicProgress = createSelector(
  selectFeatures,
  selectTasks,
  (features, tasks) => {
    const totalFeatures = features.length;
    const completedFeatures = features.filter(f => f.status === 'completed').length;
    
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    
    return {
      features: {
        total: totalFeatures,
        completed: completedFeatures,
        percentage: totalFeatures > 0 ? Math.round((completedFeatures / totalFeatures) * 100) : 0
      },
      tasks: {
        total: totalTasks,
        completed: completedTasks,
        percentage: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
      }
    };
  }
);

// Selectors avancés pour métriques
export const selectVelocityMetrics = createSelector(
  selectMetrics,
  (metrics) => metrics?.velocity
);

export const selectBurndownData = createSelector(
  selectMetrics,
  (metrics) => metrics?.burndown
);

export const selectTeamWorkload = createSelector(
  selectMetrics,
  (metrics) => metrics?.teamLoad || []
);

export const selectBlockedTasks = createSelector(
  selectMetrics,
  (metrics) => metrics?.blockedTasks || []
);

// Selectors pour performance
export const selectColumnWithTaskCounts = createSelector(
  selectFeaturesByColumn,
  selectTasks,
  (columnFeatures, tasks) => 
    columnFeatures.map(column => ({
      ...column,
      taskCount: column.features.reduce((total, feature) => {
        const featureTasks = tasks.filter(task => task.parent_task_id === feature.id);
        return total + featureTasks.length;
      }, 0)
    }))
);

export const selectWipLimitWarnings = createSelector(
  selectColumnWithTaskCounts,
  (columns) => 
    columns.filter(column => 
      column.wipLimit && column.features.length >= (column.wipLimit * 0.8)
    )
);

export const selectEpicBoardSummary = createSelector(
  selectCurrentEpic,
  selectFeatures,
  selectTasks,
  selectMetrics,
  (epic, features, tasks, metrics) => ({
    epic,
    totalFeatures: features.length,
    totalTasks: tasks.length,
    completionPercentage: metrics?.progressPercentage || 0,
    avgVelocity: metrics?.velocity?.averageVelocity || 0,
    blockedItems: (metrics?.blockedTasks?.length || 0),
    overdueItems: features.concat(tasks).filter(item => 
      item.due_date && new Date(item.due_date) < new Date() && item.status !== 'completed'
    ).length
  })
);

// Selectors pour recherche et filtrage avancé
export const selectUniqueAssignees = createSelector(
  selectFeatures,
  selectTasks,
  (features, tasks) => {
    const assignees = new Set<string>();
    [...features, ...tasks].forEach(item => {
      if (item.assigned_to) assignees.add(item.assigned_to);
    });
    return Array.from(assignees).sort();
  }
);

export const selectUniqueEnvironments = createSelector(
  selectFeatures,
  selectTasks,
  (features, tasks) => {
    const environments = new Set<string>();
    [...features, ...tasks].forEach(item => {
      item.environment?.forEach(env => environments.add(env));
    });
    return Array.from(environments).sort();
  }
);

export const selectUniqueTags = createSelector(
  selectFeatures,
  selectTasks,
  (features, tasks) => {
    const tags = new Set<string>();
    [...features, ...tasks].forEach(item => {
      item.tags?.forEach(tag => tags.add(tag));
    });
    return Array.from(tags).sort();
  }
);

// T020 - Fonction utilitaire pour appliquer les filtres enrichis
function applyFilters(features: any[], filters: any) {
  return features.filter(feature => {
    // Filtre par texte de recherche
    if (filters.searchText && filters.searchText.trim()) {
      const searchLower = filters.searchText.toLowerCase();
      const matchesTitle = feature.title?.toLowerCase().includes(searchLower);
      const matchesNumber = feature.task_number?.toString().includes(searchLower.replace('#', ''));
      
      if (!matchesTitle && !matchesNumber) {
        return false;
      }
    }
    
    // Filtre par priorité
    if (filters.priority && feature.priority !== filters.priority) {
      return false;
    }
    
    // Filtre par assigné
    if (filters.assignee && feature.assigned_to !== filters.assignee) {
      return false;
    }
    
    // Filtre par statut
    if (filters.status && feature.status !== filters.status) {
      return false;
    }
    
    // T020 - Filtre par environnement
    if (filters.environment && !feature.environment?.includes(filters.environment)) {
      return false;
    }
    
    // T020 - Filtre par tags
    if (filters.tags && filters.tags.length > 0) {
      const hasMatchingTag = filters.tags.some((tag: string) => 
        feature.tags?.includes(tag)
      );
      if (!hasMatchingTag) {
        return false;
      }
    }
    
    return true;
  });
} 