import { Task } from '../../../core/services/task';

export interface EpicBoard {
  epic: Task;
  columns: KanbanColumn[];
  features: Task[];
  tasks: Task[];
  metrics: EpicMetrics;
  settings: BoardSettings;
}

export interface KanbanColumn {
  id: string;
  title: string;
  order: number;
  wipLimit?: number;
  color: string;
  isCollapsed: boolean;
  statusValue: 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'review';
}

export interface EpicMetrics {
  totalTasks: number;
  completedTasks: number;
  progressPercentage: number;
  velocity: number;
  burndownData: BurndownPoint[];
  blockedTasks: Task[];
  teamLoad: TeamMember[];
}

export interface BurndownPoint {
  date: string;
  remainingTasks: number;
  completedTasks: number;
}

export interface TeamMember {
  userId: string;
  email: string;
  assignedTasks: number;
  completedTasks: number;
  workload: 'low' | 'medium' | 'high' | 'overloaded';
}

export interface BoardSettings {
  showMetricsPanel: boolean;
  autoRefresh: boolean;
  refreshInterval: number; // en secondes
  defaultView: 'compact' | 'expanded';
  enableWipLimits: boolean;
} 