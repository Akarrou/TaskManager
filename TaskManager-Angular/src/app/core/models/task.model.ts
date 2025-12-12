/**
 * Legacy Task Model
 *
 * This interface is kept for backward compatibility with components
 * that still use the legacy Task structure. New code should use
 * TaskEntry from task-database.service.ts instead.
 *
 * The TaskDatabaseService provides a convertEntryToLegacyTask() method
 * to convert from the new TaskEntry format to this legacy format.
 *
 * IMPORTANT: This interface maintains backward compatibility.
 * - Status values: 'pending' | 'in_progress' | 'review' | 'completed' | 'cancelled'
 * - Priority values: 'low' | 'medium' | 'high' | 'urgent'
 *
 * New TaskEntry model uses:
 * - Status: 'backlog' | 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'blocked' | 'awaiting_info'
 * - Priority: 'low' | 'medium' | 'high' | 'critical'
 *
 * Conversion happens via TaskDatabaseService methods:
 * - normalizeStatus() and normalizePriority() for reading from database
 * - mapStatusToLegacy() and mapPriorityToLegacy() for converting to legacy format
 */

export interface ISubtask {
  id?: string;
  task_id?: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'review' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent' | 'None';
  completed: boolean;
  created_at?: string;
  updated_at?: string;
  order_index?: number;
  environment?: 'frontend' | 'backend' | 'OPS' | null;
  slug?: string;
  estimated_hours?: number;
  guideline_refs?: string[];
  tags?: string[];
  task_number?: string;
}

export interface Task {
  id?: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'review' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to?: string;
  created_by?: string;
  due_date?: string;
  created_at?: string;
  updated_at?: string;
  completed_at?: string;
  tags?: string[];
  slug: string;
  prd_slug: string;
  estimated_hours?: number;
  actual_hours?: number;
  task_number?: string;
  subtasks?: ISubtask[];
  environment: string[];
  guideline_refs: string[];
  type: 'epic' | 'feature' | 'task';
  parent_task_id?: string | null;
  project_id: string;
  epic_id?: string;
  feature_id?: string;
}

export interface TaskComment {
  id?: string;
  task_id: string;
  user_id: string;
  comment: string;
  created_at?: string;
  updated_at?: string;
  users?: {
    email?: string;
  } | null;
}

export interface KanbanItem {
  id: string | number;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'review' | 'completed' | 'cancelled' | string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  type: 'epic' | 'feature' | 'task';
  task_number?: string;
  type_icon?: string;
  tags?: string[];
  assignee?: string;
  dueDate?: string;
  commentCount?: number;
  attachmentCount?: number;
  prd_slug?: string;
  environment?: string[];
  parent_task_id?: string;
  subItems?: KanbanItem[];
  progress?: {
    completed: number;
    total: number;
    percentage: number;
  };
}
