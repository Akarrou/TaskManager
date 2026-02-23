import {
  ActionReducerMap,
  MetaReducer
} from '@ngrx/store';
import { AppState } from '../../app.state';

import { reducer as projectReducer } from '../../features/projects/store/project.reducer';
import { documentReducer } from '../../features/documents/store/document.reducer';

export const reducers: ActionReducerMap<AppState> = {
  projects: projectReducer,
  documents: documentReducer,
};

export const metaReducers: MetaReducer<AppState>[] = [];
