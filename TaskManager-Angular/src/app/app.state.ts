import { State as ProjectState } from './features/projects/store/project.reducer';
import { State as DocumentState } from './features/documents/store/document.reducer';

export interface AppState {
  projects: ProjectState;
  documents: DocumentState;
}
