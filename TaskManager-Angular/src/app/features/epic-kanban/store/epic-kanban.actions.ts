import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { Task } from '../../../core/services/task';
import { EpicBoard, KanbanColumn } from '../models/epic-board.model';

export const EpicKanbanActions = createActionGroup({
  source: 'Epic Kanban',
  events: {
    // Chargement Epic Board
    'Load Epic Board': props<{ epicId: string }>(),
    'Load Epic Board Success': props<{ epicBoard: EpicBoard }>(),
    'Load Epic Board Failure': props<{ error: string }>(),

    // Gestion Features
    'Move Feature': props<{ 
      featureId: string; 
      fromColumnId: string; 
      toColumnId: string; 
      newStatus: string;
    }>(),
    'Move Feature Success': props<{ 
      featureId: string; 
      newStatus: string; 
    }>(),
    'Move Feature Failure': props<{ error: string }>(),

    // Gestion Tasks
    'Update Task Status': props<{ 
      taskId: string; 
      newStatus: string; 
    }>(),
    'Update Task Status Success': props<{ 
      taskId: string; 
      newStatus: string; 
    }>(),
    'Update Task Status Failure': props<{ error: string }>(),

    // Gestion des colonnes
    'Update Columns Configuration': props<{ columns: KanbanColumn[] }>(),
    'Update Columns Configuration Success': props<{ columns: KanbanColumn[] }>(),
    'Update Columns Configuration Failure': props<{ error: string }>(),

    // Expansion des features
    'Toggle Feature Expansion': props<{ featureId: string }>(),
    'Expand All Features': emptyProps(),
    'Collapse All Features': emptyProps(),

    // Filtres
    'Update Filters': props<{ 
      searchText?: string;
      priority?: string;
      assignee?: string;
      status?: string;
    }>(),
    'Clear Filters': emptyProps(),

    // Actions sur Epic
    'Update Epic': props<{ epic: Partial<Task> }>(),
    'Update Epic Success': props<{ epic: Task }>(),
    'Update Epic Failure': props<{ error: string }>(),

    // Reset state
    'Reset Epic Kanban State': emptyProps(),

    // Métriques
    'Refresh Metrics': emptyProps(),
    'Refresh Metrics Success': props<{ metrics: any }>(),
    'Refresh Metrics Failure': props<{ error: string }>(),
  }
}); 