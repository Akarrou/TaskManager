import { EpicKanbanState } from './features/epic-kanban/store/epic-kanban.reducer';
import { State as ProjectState } from './features/projects/store/project.reducer';

export interface AppState {
  epicKanban: EpicKanbanState;
  projects: ProjectState;
}
