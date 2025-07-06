import { isDevMode } from '@angular/core';
import {
  ActionReducer,
  ActionReducerMap,
  MetaReducer
} from '@ngrx/store';
import { AppState } from '../../app.state';

// Log all actions and state changes to the console in development mode
export function logger(reducer: ActionReducer<AppState>): ActionReducer<AppState> {
  return (state, action) => {
    const result = reducer(state, action);
    console.group(action.type);
    console.log('prev state', state);
    console.log('action', action);
    console.log('next state', result);
    console.groupEnd();

    return result;
  };
}

import * as fromEpicKanban from '../../features/epic-kanban/store';
import { reducer as projectReducer } from '../../features/projects/store/project.reducer';

export const reducers: ActionReducerMap<AppState> = {
  epicKanban: fromEpicKanban.epicKanbanReducer,
  projects: projectReducer
};

export const metaReducers: MetaReducer<AppState>[] = isDevMode() ? [logger] : [];
