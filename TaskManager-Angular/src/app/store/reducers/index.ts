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
    console.groupEnd();

    return result;
  };
}

import { reducer as projectReducer } from '../../features/projects/store/project.reducer';
import { documentReducer } from '../../features/documents/store/document.reducer';

export const reducers: ActionReducerMap<AppState> = {
  projects: projectReducer,
  documents: documentReducer
};

export const metaReducers: MetaReducer<AppState>[] = isDevMode() ? [logger] : [];
