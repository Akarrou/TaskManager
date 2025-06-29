// ============================================================================
// EXPORTS CENTRALISÉS - MODELS EPIC KANBAN
// ============================================================================

// Interfaces principales
export type {
  EpicBoard,
  KanbanColumn,
  EpicMetrics,
  BoardSettings
} from './epic-board.model';

// Interfaces de métriques
export type {
  VelocityMetrics,
  SprintVelocity,
  BurndownData,
  BurndownPoint,
  CycleTimeMetrics,
  CycleTimeDistribution
} from './epic-board.model';

// Interfaces team et workload
export type {
  TeamMember,
  UserActivity
} from './epic-board.model';

// Interfaces de configuration
export type {
  ColumnSettings,
  DefaultFilters,
  BoardConfiguration,
  BoardPermissions,
  BoardTheme
} from './epic-board.model';

// Interfaces d'actions et events
export type {
  KanbanAction,
  TaskMoveEvent
} from './epic-board.model';

// Interfaces de filtres
export type {
  KanbanFilters,
  DateRange
} from './epic-board.model';

// Types et enums
export type {
  TaskStatus,
  TaskPriority,
  ViewMode,
  WorkloadLevel,
  KanbanActionType
} from './epic-board.model'; 