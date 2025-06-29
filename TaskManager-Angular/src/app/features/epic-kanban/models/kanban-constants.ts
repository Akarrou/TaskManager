import { KanbanColumn, BoardSettings, DefaultFilters, KanbanFilters } from './epic-board.model';

// ============================================================================
// CONSTANTES COLONNES KANBAN PAR DÉFAUT
// ============================================================================

export const DEFAULT_KANBAN_COLUMNS: KanbanColumn[] = [
  {
    id: 'pending',
    title: 'À faire',
    order: 1,
    color: '#6B7280',
    bgColor: '#F9FAFB',
    isCollapsed: false,
    isVisible: true,
    statusValue: 'pending',
    description: 'Tâches en attente de démarrage',
    taskCount: 0,
    acceptsNewTasks: true,
    wipLimit: undefined
  },
  {
    id: 'in_progress',
    title: 'En cours',
    order: 2,
    color: '#F59E0B',
    bgColor: '#FFFBEB',
    isCollapsed: false,
    isVisible: true,
    statusValue: 'in_progress',
    description: 'Tâches actuellement en développement',
    taskCount: 0,
    acceptsNewTasks: true,
    wipLimit: 5
  },
  {
    id: 'review',
    title: 'Review',
    order: 3,
    color: '#3B82F6',
    bgColor: '#EFF6FF',
    isCollapsed: false,
    isVisible: true,
    statusValue: 'review',
    description: 'Tâches en révision et validation',
    taskCount: 0,
    acceptsNewTasks: true,
    wipLimit: 3
  },
  {
    id: 'completed',
    title: 'Terminé',
    order: 4,
    color: '#10B981',
    bgColor: '#ECFDF5',
    isCollapsed: false,
    isVisible: true,
    statusValue: 'completed',
    description: 'Tâches terminées et validées',
    taskCount: 0,
    acceptsNewTasks: false,
    wipLimit: undefined
  }
];

// ============================================================================
// CONFIGURATIONS PAR DÉFAUT
// ============================================================================

export const DEFAULT_BOARD_SETTINGS: BoardSettings = {
  // Affichage
  showMetricsPanel: true,
  showTeamPanel: true,
  showBurndownChart: false,
  defaultView: 'expanded',
  compactMode: false,
  
  // Fonctionnalités
  enableWipLimits: true,
  enableDragDrop: true,
  enableQuickEdit: true,
  enableAutoAssign: false,
  
  // Actualisation
  autoRefresh: true,
  refreshInterval: 30, // 30 secondes
  
  // Notifications
  showNotifications: true,
  notifyOnStatusChange: true,
  notifyOnDueDateApproach: true,
  
  // Colonnes personnalisées
  customColumns: false,
  columnSettings: DEFAULT_KANBAN_COLUMNS.map(col => ({
    columnId: col.id,
    isVisible: col.isVisible,
    order: col.order,
    wipLimit: col.wipLimit,
    customTitle: undefined
  })),
  
  // Filtres par défaut
  defaultFilters: {
    showCompletedTasks: true,
    showCancelledTasks: false,
    priorityFilter: ['low', 'medium', 'high', 'urgent'],
    assigneeFilter: [],
    environmentFilter: []
  }
};

export const DEFAULT_KANBAN_FILTERS: KanbanFilters = {
  searchText: undefined,
  status: undefined,
  priority: undefined,
  assignee: undefined,
  environment: undefined,
  tags: undefined,
  dueDateRange: undefined,
  showCompleted: true,
  showCancelled: false
};

// ============================================================================
// CONSTANTES MÉTRIQUES
// ============================================================================

export const METRIC_DEFAULTS = {
  REFRESH_INTERVAL: 30000, // 30 secondes
  BURNDOWN_LOOKBACK_DAYS: 30,
  VELOCITY_SPRINT_COUNT: 4,
  CYCLE_TIME_BUCKET_DAYS: [1, 3, 7, 14, 30],
  WIP_LIMIT_WARNING_THRESHOLD: 0.8, // 80% de la limite
  OVERDUE_WARNING_DAYS: 3
} as const;

// ============================================================================
// CONSTANTES COULEURS ET STYLES
// ============================================================================

export const STATUS_COLORS = {
  pending: {
    text: '#6B7280',
    bg: '#F9FAFB',
    border: '#E5E7EB',
    icon: 'schedule'
  },
  in_progress: {
    text: '#F59E0B',
    bg: '#FFFBEB',
    border: '#FDE68A',
    icon: 'hourglass_empty'
  },
  review: {
    text: '#3B82F6',
    bg: '#EFF6FF',
    border: '#BFDBFE',
    icon: 'rate_review'
  },
  completed: {
    text: '#10B981',
    bg: '#ECFDF5',
    border: '#A7F3D0',
    icon: 'check_circle'
  },
  cancelled: {
    text: '#EF4444',
    bg: '#FEF2F2',
    border: '#FCA5A5',
    icon: 'cancel'
  },
  blocked: {
    text: '#DC2626',
    bg: '#FEF2F2',
    border: '#F87171',
    icon: 'block'
  }
} as const;

export const PRIORITY_COLORS = {
  urgent: {
    text: '#DC2626',
    bg: '#FEF2F2',
    border: '#F87171',
    icon: 'priority_high'
  },
  high: {
    text: '#F59E0B',
    bg: '#FFFBEB',
    border: '#FDE68A',
    icon: 'arrow_upward'
  },
  medium: {
    text: '#3B82F6',
    bg: '#EFF6FF',
    border: '#BFDBFE',
    icon: 'remove'
  },
  low: {
    text: '#10B981',
    bg: '#ECFDF5',
    border: '#A7F3D0',
    icon: 'arrow_downward'
  }
} as const;

// ============================================================================
// CONSTANTES DE VALIDATION
// ============================================================================

export const VALIDATION_LIMITS = {
  MIN_COLUMN_COUNT: 2,
  MAX_COLUMN_COUNT: 8,
  MIN_WIP_LIMIT: 1,
  MAX_WIP_LIMIT: 20,
  MAX_TITLE_LENGTH: 100,
  MAX_DESCRIPTION_LENGTH: 500,
  MIN_REFRESH_INTERVAL: 5, // 5 secondes
  MAX_REFRESH_INTERVAL: 300 // 5 minutes
} as const;

// ============================================================================
// CONSTANTES ANIMATIONS
// ============================================================================

export const ANIMATION_DURATIONS = {
  CARD_MOVE: 300,
  COLUMN_COLLAPSE: 250,
  MODAL_FADE: 200,
  TOOLTIP_DELAY: 500,
  AUTO_SAVE_DELAY: 1000
} as const; 