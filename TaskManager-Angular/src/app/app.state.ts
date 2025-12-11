import { EpicKanbanState } from './features/epic-kanban/store/epic-kanban.reducer';
import { State as ProjectState } from './features/projects/store/project.reducer';
import { State as DocumentState } from './features/documents/store/document.reducer';

export interface AppState {
  epicKanban: EpicKanbanState;
  projects: ProjectState;
  documents: DocumentState;
}
