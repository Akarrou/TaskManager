// ============================================================================
// EXPORTS CENTRALISÉS - NGRX EPIC KANBAN STORE
// ============================================================================

// Actions
export { EpicKanbanActions } from './epic-kanban.actions';

// State et Reducer
export type { EpicKanbanState } from './epic-kanban.reducer';
export { 
  epicKanbanReducer, 
  initialState 
} from './epic-kanban.reducer';

// Effects
export { EpicKanbanEffects } from './epic-kanban.effects';

// Selectors principaux
export {
  selectEpicKanbanState,
  selectEpicBoard,
  selectCurrentEpic,
  selectFeatures,
  selectTasks,
  selectColumns,
  selectMetrics
} from './epic-kanban.selectors';

// Selectors UI et état
export {
  selectLoading,
  selectSaving,
  selectError,
  selectExpandedFeatures,
  selectEpicKanbanFilters,
  selectLastUpdated
} from './epic-kanban.selectors';

// Selectors composés et avancés
export {
  selectFeaturesByColumn,
  selectTasksForFeature,
  selectFeatureProgress,
  selectIsFeatureExpanded,
  selectColumnWorkload,
  selectHasUnsavedChanges,
  selectEpicProgress,
  selectEpicBoardSummary
} from './epic-kanban.selectors';

// Selectors pour métriques
export {
  selectVelocityMetrics,
  selectBurndownData,
  selectTeamWorkload,
  selectBlockedTasks
} from './epic-kanban.selectors';

// Selectors pour performance et filtrage
export {
  selectColumnWithTaskCounts,
  selectWipLimitWarnings,
  selectUniqueAssignees,
  selectUniqueEnvironments,
  selectUniqueTags
} from './epic-kanban.selectors'; 