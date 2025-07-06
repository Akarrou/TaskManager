// ============================================================================
// EXPORTS CENTRALISÉS - NGRX EPIC KANBAN STORE
// ============================================================================

// Actions
export { EpicKanbanActions } from './epic-kanban.actions';

// State et Reducer
export type { EpicKanbanState } from './epic-kanban.reducer';
export {
  epicKanbanFeatureKey,
  epicKanbanReducer,
  initialState
} from './epic-kanban.reducer';

// Effects
export { EpicKanbanEffects } from './epic-kanban.effects';

// Selectors
export * from './epic-kanban.selectors';
