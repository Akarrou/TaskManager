/**
 * Event Constants - Single Source of Truth
 *
 * Defines event categories with their labels and colors.
 * Default categories are built-in; custom categories are loaded from the database.
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * EventCategory - built-in categories are strongly typed; custom categories are arbitrary strings.
 * The `string & {}` trick prevents widening to plain `string` while still accepting any string value.
 */
type BuiltinCategory = 'meeting' | 'deadline' | 'milestone' | 'reminder' | 'personal' | 'other';
export type EventCategory = BuiltinCategory | (string & {});

/**
 * Color set for a category (Tailwind classes + hex for FullCalendar)
 */
export interface CategoryColorSet {
  bg: string;
  text: string;
  border: string;
  hex: string;
  bgHex: string;
  textHex: string;
}

/**
 * A category definition (default or custom)
 */
export interface CategoryDefinition {
  key: string;
  label: string;
  colorKey: string;
  isDefault: boolean;
  sortOrder?: number;
}

// ============================================================================
// Color Palette (12 predefined colors)
// ============================================================================

export const CATEGORY_COLOR_PALETTE: Record<string, CategoryColorSet> = {
  blue:   { bg: 'bg-blue-200',   text: 'text-blue-800',   border: 'border-blue-400',   hex: '#3b82f6', bgHex: '#dbeafe', textHex: '#1e40af' },
  red:    { bg: 'bg-red-200',    text: 'text-red-800',    border: 'border-red-400',    hex: '#ef4444', bgHex: '#fee2e2', textHex: '#991b1b' },
  purple: { bg: 'bg-purple-200', text: 'text-purple-800', border: 'border-purple-400', hex: '#8b5cf6', bgHex: '#ede9fe', textHex: '#5b21b6' },
  yellow: { bg: 'bg-yellow-200', text: 'text-yellow-800', border: 'border-yellow-400', hex: '#eab308', bgHex: '#fef9c3', textHex: '#854d0e' },
  green:  { bg: 'bg-green-200',  text: 'text-green-800',  border: 'border-green-400',  hex: '#22c55e', bgHex: '#dcfce7', textHex: '#166534' },
  gray:   { bg: 'bg-gray-200',   text: 'text-gray-800',   border: 'border-gray-400',   hex: '#6b7280', bgHex: '#f3f4f6', textHex: '#374151' },
  orange: { bg: 'bg-orange-200', text: 'text-orange-800', border: 'border-orange-400', hex: '#f97316', bgHex: '#ffedd5', textHex: '#9a3412' },
  teal:   { bg: 'bg-teal-200',   text: 'text-teal-800',   border: 'border-teal-400',   hex: '#14b8a6', bgHex: '#ccfbf1', textHex: '#115e59' },
  pink:   { bg: 'bg-pink-200',   text: 'text-pink-800',   border: 'border-pink-400',   hex: '#ec4899', bgHex: '#fce7f3', textHex: '#9d174d' },
  indigo: { bg: 'bg-indigo-200', text: 'text-indigo-800', border: 'border-indigo-400', hex: '#6366f1', bgHex: '#e0e7ff', textHex: '#3730a3' },
  cyan:   { bg: 'bg-cyan-200',   text: 'text-cyan-800',   border: 'border-cyan-400',   hex: '#06b6d4', bgHex: '#cffafe', textHex: '#155e75' },
  rose:   { bg: 'bg-rose-200',   text: 'text-rose-800',   border: 'border-rose-400',   hex: '#f43f5e', bgHex: '#ffe4e6', textHex: '#9f1239' },
};

// ============================================================================
// Default Categories (the original 6)
// ============================================================================

export const DEFAULT_CATEGORIES: CategoryDefinition[] = [
  { key: 'meeting',   label: 'Réunion',   colorKey: 'blue',   isDefault: true },
  { key: 'deadline',  label: 'Échéance',  colorKey: 'red',    isDefault: true },
  { key: 'milestone', label: 'Jalon',     colorKey: 'purple', isDefault: true },
  { key: 'reminder',  label: 'Rappel',    colorKey: 'yellow', isDefault: true },
  { key: 'personal',  label: 'Personnel', colorKey: 'green',  isDefault: true },
  { key: 'other',     label: 'Autre',     colorKey: 'indigo',   isDefault: true },
];

// ============================================================================
// Google Calendar Color ID Mapping
// ============================================================================

// Google Calendar color mappings
// Duplicated in: supabase/functions/google-calendar-sync/index.ts → GOOGLE_COLOR_ID_TO_HEX
// Keep both in sync when modifying color mappings.
export const GOOGLE_COLOR_ID_MAP: Record<string, { name: string; hex: string }> = {
  '1':  { name: 'Lavande',    hex: '#7986cb' },
  '2':  { name: 'Sauge',      hex: '#33b679' },
  '3':  { name: 'Raisin',     hex: '#8e24aa' },
  '4':  { name: 'Flamant',    hex: '#e67c73' },
  '5':  { name: 'Banane',     hex: '#f6bf26' },
  '6':  { name: 'Mandarine',  hex: '#f4511e' },
  '7':  { name: 'Paon',       hex: '#039be5' },
  '8':  { name: 'Graphite',   hex: '#616161' },
  '9':  { name: 'Myrtille',   hex: '#3f51b5' },
  '10': { name: 'Basilic',    hex: '#0b8043' },
  '11': { name: 'Tomate',     hex: '#d50000' },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a slug key from a label
 */
export function slugify(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Get label for a category key
 */
export function getCategoryLabel(key: string, allCategories: CategoryDefinition[]): string {
  const cat = allCategories.find(c => c.key === key);
  return cat?.label ?? key;
}

/**
 * Get Tailwind color classes for a category key
 */
export function getCategoryColors(key: string, allCategories: CategoryDefinition[]): { bg: string; text: string; border: string } {
  const cat = allCategories.find(c => c.key === key);
  const colorKey = cat?.colorKey ?? 'gray';
  const palette = CATEGORY_COLOR_PALETTE[colorKey] ?? CATEGORY_COLOR_PALETTE['gray'];
  return { bg: palette.bg, text: palette.text, border: palette.border };
}

/**
 * Get hex color for FullCalendar rendering
 */
export function getCategoryHexColor(key: string, allCategories: CategoryDefinition[]): string {
  const cat = allCategories.find(c => c.key === key);
  const colorKey = cat?.colorKey ?? 'gray';
  return (CATEGORY_COLOR_PALETTE[colorKey] ?? CATEGORY_COLOR_PALETTE['gray']).hex;
}

/**
 * Format a Google Calendar reminder for display
 */
export function formatReminder(reminder: { method: string; minutes: number }): string {
  const method = reminder.method === 'popup' ? 'Notification' : 'Email';
  if (reminder.minutes < 60) {
    return `${method} : ${reminder.minutes} min avant`;
  } else if (reminder.minutes < 1440) {
    const hours = Math.floor(reminder.minutes / 60);
    return `${method} : ${hours}h avant`;
  } else {
    const days = Math.floor(reminder.minutes / 1440);
    return `${method} : ${days} jour${days > 1 ? 's' : ''} avant`;
  }
}
