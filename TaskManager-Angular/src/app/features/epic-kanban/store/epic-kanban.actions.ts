import { props, createActionGroup, emptyProps } from '@ngrx/store';
import { Task } from '../../../core/services/task';
import { EpicBoard, KanbanColumn, EpicMetrics, TaskMoveEvent } from '../models/epic-board.model';
import { KanbanItem } from '../models/kanban-item.model';

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
      newStatus: Task['status'];
    }>(),
    'Move Feature Success': props<{
      featureId: string;
      newStatus: Task['status'];
    }>(),
    'Move Feature Failure': props<{ error: string }>(),

    // Gestion Tasks
    'Update Task Status': props<{
      taskId: string;
      newStatus: Task['status'];
    }>(),
    'Update Task Status Success': props<{
      taskId: string;
      newStatus: Task['status'];
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

    // T020 - Filtres enrichis
    'Update Filters': props<{
      searchText?: string;
      priority?: string | null;
      assignee?: string | null;
      status?: string | null;
      environment?: string | null;
      tags?: string[];
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
    'Refresh Metrics Success': props<{ metrics: EpicMetrics }>(),
    'Refresh Metrics Failure': props<{ error: string }>(),

    // Actions drag & drop enrichies
    'Start Feature Drag': props<{ featureId: string }>(),
    'End Feature Drag': emptyProps(),
    'Move Feature Complete': props<{ moveEvent: TaskMoveEvent }>(),

    // Actions batch
    'Bulk Update Features': props<{
      featureIds: string[];
      updates: Partial<Task>
    }>(),
    'Bulk Update Features Success': props<{
      updatedFeatures: Task[]
    }>(),
    'Bulk Update Features Failure': props<{ error: string }>(),

    // T018 - Task CRUD Actions
    'Update Task': props<{ task: Partial<Task> & { id: string } }>(),
    'Update Task Success': props<{ task: Partial<Task> & { id: string } }>(),
    'Update Task Failure': props<{ error: string }>(),

    'Delete Task': props<{ taskId: string }>(),
    'Delete Task Success': props<{ taskId: string }>(),
    'Delete Task Failure': props<{ error: string }>(),

    'Create Task': props<{ task: Partial<Task> }>(),
    'Create Task Success': props<{ task: Task }>(),
    'Create Task Failure': props<{ error: string }>(),

    // Actions for Feature-specific Kanban View
    'Load Feature Tasks': props<{ featureId: string }>(),
    'Load Feature Tasks Success': props<{ feature: Task, tasks: Task[] }>(),
    'Load Feature Tasks Failure': props<{ error: any }>(),

    // Generic Task actions (if they don't exist elsewhere)
    'Update Feature Status': props<{ featureId: string; newStatus: string }>(),
    'Update Feature Status Success': props<{ feature: KanbanItem }>(),
    'Update Feature Status Failure': props<{ error: any }>(),

    'Delete Feature': props<{ featureId: string }>(),
    'Delete Feature Success': props<{ featureId: string }>(),
    'Delete Feature Failure': props<{ error: any }>(),

    'Load Epic Kanban Success': props<{ board: EpicBoard }>(),
    'Load Epic Kanban Failure': props<{ error: string }>(),

    'Move Task': props<{ event: TaskMoveEvent }>(),
  }
});
