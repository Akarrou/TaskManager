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
    console.groupCollapsed(action.type);
    console.log('prev state', state);
    console.log('action', action);
    console.log('next state', result);
    console.groupEnd();
    return result;
  };
}

export const reducers: ActionReducerMap<AppState> = {
  // Les réducteurs spécifiques aux fonctionnalités seront ajoutés ici
};

export const metaReducers: MetaReducer<AppState>[] = isDevMode() ? [logger] : []; 