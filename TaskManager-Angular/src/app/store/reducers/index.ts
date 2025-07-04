import { isDevMode } from '@angular/core';
import {
  ActionReducer,
  ActionReducerMap,
  MetaReducer
} from '@ngrx/store';
import { AppState } from '../../app.state'; // Ajustement du chemin si app.state.ts est au même niveau que le dossier store

// Log all actions and state changes to the console in development mode
export function logger(reducer: ActionReducer<AppState>): ActionReducer<AppState> {
  return (state, action) => {
    const result = reducer(state, action);
    return result;
  };
}

import { epicKanbanReducer } from '../../features/epic-kanban/store/epic-kanban.reducer';
import { reducer as projectReducer } from '../../features/projects/store/project.reducer';

export const reducers: ActionReducerMap<AppState> = {
  epicKanban: epicKanbanReducer,
  projects: projectReducer
};

export const metaReducers: MetaReducer<AppState>[] = isDevMode() ? [logger] : [];
