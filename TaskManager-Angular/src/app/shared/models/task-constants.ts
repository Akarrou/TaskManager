/**
 * Task Constants - Single Source of Truth
 *
 * This file defines all task statuses and priorities with their labels and mappings.
 * - Internal values: English (backlog, pending, in_progress, etc.)
 * - UI labels: French (Backlog, À faire, En cours, etc.)
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * TaskStatus - All possible task statuses (7 statuses)
 *
 * - backlog: Tasks planned but not started yet
 * - pending: Tasks ready to be started (À faire)
 * - in_progress: Tasks currently being worked on
 * - completed: Finished tasks
 * - cancelled: Cancelled tasks
 * - blocked: Tasks that are blocked
 * - awaiting_info: Tasks waiting for information
 */
export type TaskStatus =
  | 'backlog'
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'blocked'
  | 'awaiting_info';

/**
 * TaskPriority - All possible task priorities (4 priorities)
 *
 * - low: Low priority tasks
 * - medium: Medium priority tasks (default)
 * - high: High priority tasks
 * - critical: Critical/urgent tasks
 */
export type TaskPriority =
  | 'low'
  | 'medium'
  | 'high'
  | 'critical';

// ============================================================================
// French UI Labels
// ============================================================================

/**
 * STATUS_LABELS - French labels for task statuses
 * Used in UI components for display purposes
 */
export const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  pending: 'À faire',
  in_progress: 'En cours',
  completed: 'Terminée',
  cancelled: 'Annulée',
  blocked: 'Bloquée',
  awaiting_info: 'En attente d\'infos'
};

/**
 * PRIORITY_LABELS - French labels for task priorities
 * Used in UI components for display purposes
 */
export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Faible',
  medium: 'Moyenne',
  high: 'Haute',
  critical: 'Critique'
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get French label for a given status
 * @param status - The status value (English)
 * @returns French label or the original status if not found
 */
export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status as TaskStatus] || status;
}

/**
 * Get French label for a given priority
 * @param priority - The priority value (English)
 * @returns French label or the original priority if not found
 */
export function getPriorityLabel(priority: string): string {
  return PRIORITY_LABELS[priority as TaskPriority] || priority;
}

// ============================================================================
// Legacy Mappings (Backward Compatibility)
// ============================================================================

/**
 * LEGACY_STATUS_MAP - Maps legacy status values to new TaskStatus values
 * Used for backward compatibility with old data
 */
export const LEGACY_STATUS_MAP: Record<string, TaskStatus> = {
  'review': 'in_progress',  // Legacy 'review' status mapped to 'in_progress'
};

/**
 * LEGACY_PRIORITY_MAP - Maps legacy priority values to new TaskPriority values
 * Used for backward compatibility with old data
 */
export const LEGACY_PRIORITY_MAP: Record<string, TaskPriority> = {
  'urgent': 'critical',  // Legacy 'urgent' priority mapped to 'critical'
};
