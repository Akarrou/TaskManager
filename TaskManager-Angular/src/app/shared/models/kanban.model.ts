/**
 * Kanban Board Models
 *
 * Shared models for kanban-based views. These were extracted from the
 * legacy epic-kanban feature for reuse across the application.
 */

export interface KanbanColumn {
  id: string;
  title: string;
  order: number;
  wipLimit?: number;
  color: string;
  bgColor: string;
  isCollapsed: boolean;
  isVisible: boolean;
  statusValue: string;
  description?: string;
  taskCount: number;
  acceptsNewTasks: boolean;
}

export interface EpicMetrics {
  // Métriques de base
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  pendingTasks: number;
  cancelledTasks: number;
  progressPercentage: number;

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
