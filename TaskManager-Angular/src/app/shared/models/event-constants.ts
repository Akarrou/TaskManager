/**
 * Event Constants - Single Source of Truth
 *
 * Defines all event categories with their labels and colors.
 * - Internal values: English (meeting, deadline, milestone, etc.)
 * - UI labels: French (Réunion, Échéance, Jalon, etc.)
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * EventCategory - All possible event categories
 */
export type EventCategory =
  | 'meeting'
  | 'deadline'
  | 'milestone'
  | 'reminder'
  | 'personal'
  | 'other';

// ============================================================================
// French UI Labels
// ============================================================================

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  meeting: 'Réunion',
  deadline: 'Échéance',
  milestone: 'Jalon',
  reminder: 'Rappel',
  personal: 'Personnel',
  other: 'Autre',
};

// ============================================================================
// Category Colors (Tailwind classes)
// ============================================================================

export const CATEGORY_COLORS: Record<EventCategory, { bg: string; text: string; border: string }> = {
  meeting: { bg: 'bg-blue-200', text: 'text-blue-800', border: 'border-blue-400' },
  deadline: { bg: 'bg-red-200', text: 'text-red-800', border: 'border-red-400' },
  milestone: { bg: 'bg-purple-200', text: 'text-purple-800', border: 'border-purple-400' },
  reminder: { bg: 'bg-yellow-200', text: 'text-yellow-800', border: 'border-yellow-400' },
  personal: { bg: 'bg-green-200', text: 'text-green-800', border: 'border-green-400' },
  other: { bg: 'bg-gray-200', text: 'text-gray-800', border: 'border-gray-400' },
};

/**
 * FullCalendar-compatible hex colors for each category
 */
export const CATEGORY_HEX_COLORS: Record<EventCategory, string> = {
  meeting: '#3b82f6',
  deadline: '#ef4444',
  milestone: '#8b5cf6',
  reminder: '#eab308',
  personal: '#22c55e',
  other: '#6b7280',
};

// ============================================================================
// Helper Functions
// ============================================================================

export function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category as EventCategory] || category;
}

export function getCategoryColor(category: string): string {
  return CATEGORY_HEX_COLORS[category as EventCategory] || CATEGORY_HEX_COLORS.other;
}
