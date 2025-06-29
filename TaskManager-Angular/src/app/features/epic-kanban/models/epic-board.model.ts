import { Task } from '../../../core/services/task';

// ============================================================================
// INTERFACES PRINCIPALES EPIC KANBAN
// ============================================================================

export interface EpicBoard {
  epic: Task;
  columns: KanbanColumn[];
  features: Task[];
  tasks: Task[];
  metrics: EpicMetrics;
  settings: BoardSettings;
  lastUpdated: string;
  isLoading: boolean;
  error?: string;
}

export interface KanbanColumn {
  id: string;
  title: string;
  order: number;
  wipLimit?: number;
  color: string;
  bgColor: string;
  isCollapsed: boolean;
  isVisible: boolean;
  statusValue: TaskStatus;
  description?: string;
  taskCount: number;
  acceptsNewTasks: boolean;
}

// ============================================================================
// MÉTRIQUES ET ANALYTICS
// ============================================================================

export interface EpicMetrics {
  // Métriques de base
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  pendingTasks: number;
  cancelledTasks: number;
  progressPercentage: number;
  
  // Métriques avancées
  velocity: VelocityMetrics;
  burndown: BurndownData;
  cycleTime: CycleTimeMetrics;
  blockedTasks: Task[];
  teamLoad: TeamMember[];
  
  // Estimations et temps
  estimatedHours: number;
  actualHours: number;
  remainingHours: number;
  
  // Dates importantes
  startDate?: string;
  plannedEndDate?: string;
  actualEndDate?: string;
  
  // Métriques par priorité
  highPriorityTasks: number;
  mediumPriorityTasks: number;
  lowPriorityTasks: number;
}

export interface VelocityMetrics {
  currentSprint: number;
  previousSprint: number;
  averageVelocity: number;
  trend: 'up' | 'down' | 'stable';
  sprintHistory: SprintVelocity[];
}

export interface SprintVelocity {
  sprintId: string;
  startDate: string;
  endDate: string;
  completedTasks: number;
  committedTasks: number;
}

export interface BurndownData {
  points: BurndownPoint[];
  idealLine: BurndownPoint[];
  isOnTrack: boolean;
  projectedCompletion?: string;
}

export interface BurndownPoint {
  date: string;
  remainingTasks: number;
  completedTasks: number;
  cumulativeCompleted: number;
}

export interface CycleTimeMetrics {
  averageCycleTime: number; // en jours
  medianCycleTime: number;
  fastest: number;
  slowest: number;
  distribution: CycleTimeDistribution[];
}

export interface CycleTimeDistribution {
  range: string; // "1-2 days", "3-5 days", etc.
  count: number;
  percentage: number;
}

// ============================================================================
// TEAM ET WORKLOAD
// ============================================================================

export interface TeamMember {
  userId: string;
  email: string;
  displayName?: string;
  avatar?: string;
  assignedTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  workload: WorkloadLevel;
  capacity: number; // heures par semaine
  utilization: number; // pourcentage
  recentActivity: UserActivity[];
}

export interface UserActivity {
  taskId: string;
  taskTitle: string;
  action: 'created' | 'updated' | 'completed' | 'assigned';
  timestamp: string;
}

// ============================================================================
// CONFIGURATION ET SETTINGS
// ============================================================================

export interface BoardSettings {
  // Affichage
  showMetricsPanel: boolean;
  showTeamPanel: boolean;
  showBurndownChart: boolean;
  defaultView: ViewMode;
  compactMode: boolean;
  
  // Fonctionnalités
  enableWipLimits: boolean;
  enableDragDrop: boolean;
  enableQuickEdit: boolean;
  enableAutoAssign: boolean;
  
  // Actualisation
  autoRefresh: boolean;
  refreshInterval: number; // en secondes
  
  // Notifications
  showNotifications: boolean;
  notifyOnStatusChange: boolean;
  notifyOnDueDateApproach: boolean;
  
  // Colonnes personnalisées
  customColumns: boolean;
  columnSettings: ColumnSettings[];
  
  // Filtres par défaut
  defaultFilters: DefaultFilters;
}

export interface ColumnSettings {
  columnId: string;
  isVisible: boolean;
  order: number;
  wipLimit?: number;
  customTitle?: string;
}

export interface DefaultFilters {
  showCompletedTasks: boolean;
  showCancelledTasks: boolean;
  priorityFilter: TaskPriority[];
  assigneeFilter: string[];
  environmentFilter: string[];
}

// ============================================================================
// TYPES ET ENUMS
// ============================================================================

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'review' | 'blocked';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type ViewMode = 'compact' | 'expanded' | 'detailed';
export type WorkloadLevel = 'light' | 'normal' | 'high' | 'overloaded';

// ============================================================================
// ACTIONS ET EVENTS
// ============================================================================

export interface KanbanAction {
  type: KanbanActionType;
  payload: any;
  timestamp: string;
  userId?: string;
}

export type KanbanActionType = 
  | 'TASK_MOVED'
  | 'TASK_UPDATED'
  | 'COLUMN_UPDATED'
  | 'FILTER_APPLIED'
  | 'BOARD_REFRESHED'
  | 'SETTINGS_CHANGED';

export interface TaskMoveEvent {
  taskId: string;
  fromColumn: string;
  toColumn: string;
  fromIndex: number;
  toIndex: number;
  newStatus: TaskStatus;
}

// ============================================================================
// FILTER ET SEARCH
// ============================================================================

export interface KanbanFilters {
  searchText?: string;
  status?: TaskStatus[];
  priority?: TaskPriority[];
  assignee?: string[];
  environment?: string[];
  tags?: string[];
  dueDateRange?: DateRange;
  showCompleted: boolean;
  showCancelled: boolean;
}

export interface DateRange {
  start?: string;
  end?: string;
}

// ============================================================================
// CONFIGURATION AVANCÉE
// ============================================================================

export interface BoardConfiguration {
  id: string;
  name: string;
  description?: string;
  epicId: string;
  ownerId: string;
  isPublic: boolean;
  permissions: BoardPermissions;
  theme: BoardTheme;
  createdAt: string;
  updatedAt: string;
}

export interface BoardPermissions {
  canView: string[];
  canEdit: string[];
  canAdmin: string[];
  isPublic: boolean;
}

export interface BoardTheme {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  cardStyle: 'minimal' | 'detailed' | 'compact';
  columnStyle: 'simple' | 'material' | 'custom';
} 