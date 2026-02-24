/**
 * Database System Models
 *
 * Type definitions for the dynamic database table system integrated in TipTap editor.
 * Follows the Notion-like database pattern with flexible column types and multiple views.
 */

// =====================================================================
// Core Column Types
// =====================================================================

/**
 * All supported column types for database columns
 */
export type ColumnType =
  | 'text'
  | 'number'
  | 'date'
  | 'date-range'
  | 'datetime'
  | 'checkbox'
  | 'select'
  | 'multi-select'
  | 'url'
  | 'email'
  | 'linked-items'
  | 'json';

/**
 * Predefined colors for pinned properties
 */
export type PropertyColor = 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'pink' | 'orange' | 'gray';

/**
 * Color palette for pinned properties (light backgrounds with dark text for readability)
 */
export const PROPERTY_COLORS: Record<PropertyColor, { bg: string; text: string; border: string }> = {
  blue: { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  green: { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  yellow: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  red: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  purple: { bg: '#ede9fe', text: '#5b21b6', border: '#c4b5fd' },
  pink: { bg: '#fce7f3', text: '#9f1239', border: '#f9a8d4' },
  orange: { bg: '#ffedd5', text: '#9a3412', border: '#fdba74' },
  gray: { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' },
};

/**
 * Number format options for number columns
 */
export type NumberFormat = 'integer' | 'decimal' | 'currency' | 'percentage';

/**
 * Choice option for select and multi-select columns
 */
export interface SelectChoice {
  id: string;
  label: string;
  color: string; // Tailwind color class (e.g., 'bg-blue-200')
}

/**
 * Column-specific configuration options
 */
export interface ColumnOptions {
  // For select and multi-select columns
  choices?: SelectChoice[];

  // For number columns
  format?: NumberFormat;

  // For date columns
  dateFormat?: string; // e.g., 'DD/MM/YYYY', 'YYYY-MM-DD'

  // For date-range columns
  includeTime?: boolean; // Whether to include time in the date range
}

/**
 * Value for linked-items column type
 */
export interface LinkedItem {
  type: 'task' | 'document' | 'database';
  id: string;
  databaseId?: string;
  label: string;
}

/**
 * Value for date-range column type
 */
export interface DateRangeValue {
  startDate: string | null; // ISO format: "2026-04-01" or "2026-04-01T10:00:00"
  endDate: string | null;   // ISO format: "2026-04-30" or "2026-04-30T18:00:00"
}

/**
 * Database column definition
 */
export interface DatabaseColumn {
  id: string;
  name: string;
  type: ColumnType;
  options?: ColumnOptions;
  width?: number; // Column width in pixels
  visible: boolean;
  required?: boolean;
  readonly?: boolean; // Prevents editing and deletion of column (for protected task columns)
  order: number;
  color?: PropertyColor; // Color for pinned properties display
  isNameColumn?: boolean; // Marks this column as linked to the document title (cannot be deleted)
}

// =====================================================================
// Views
// =====================================================================

/**
 * Available view types for displaying database content
 */
export type ViewType = 'table' | 'kanban' | 'calendar' | 'timeline';

/**
 * Filter operators
 */
export type FilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'is_empty'
  | 'is_not_empty'
  | 'greater_than'
  | 'less_than'
  | 'greater_than_or_equal'
  | 'less_than_or_equal'
  | 'starts_with'
  | 'ends_with';

/**
 * Sort order
 */
export type SortOrder = 'asc' | 'desc';

/**
 * Filter definition
 */
export interface Filter {
  columnId: string;
  operator: FilterOperator;
  value: unknown;
}

/**
 * View configuration
 */
export interface DatabaseView {
  id: string;
  name: string;
  type: ViewType;
  config: ViewConfig;
}

/**
 * Timeline granularity type
 */
export type TimelineGranularity = 'auto' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';

/**
 * View-specific configuration
 */
export interface ViewConfig {
  // Sorting
  sortBy?: string; // column id
  sortOrder?: SortOrder;

  // Filtering
  filters?: Filter[];

  // Grouping (for kanban view)
  groupBy?: string; // column id (typically a select column)

  // Hidden columns
  hiddenColumns?: string[]; // array of column ids

  // Column order (if different from default)
  columnOrder?: string[]; // array of column ids

  // Calendar view configuration
  calendarDateColumnId?: string;
  calendarDateRangeColumnId?: string;

  // Timeline view configuration
  timelineStartDateColumnId?: string;
  timelineEndDateColumnId?: string;
  timelineDateRangeColumnId?: string;
  timelineGranularity?: TimelineGranularity;
}

// =====================================================================
// Database Configuration
// =====================================================================

/**
 * Complete database configuration
 */
export interface DatabaseConfig {
  name: string;
  columns: DatabaseColumn[];
  views: DatabaseView[];
  defaultView: ViewType;
  pinnedColumns?: string[]; // Array of column IDs that are pinned
}

// =====================================================================
// Data Storage
// =====================================================================

/**
 * Cell value types
 */
export type CellValue = string | number | boolean | string[] | DateRangeValue | LinkedItem[] | null;

/**
 * Database row (stored in PostgreSQL table)
 */
export interface DatabaseRow {
  id: string;
  cells: Record<string, CellValue>; // columnId -> value mapping
  row_order: number;
  created_at: string;
  updated_at: string;
}

/**
 * Database data container
 */
export interface DatabaseData {
  rows: DatabaseRow[];
}

// =====================================================================
// TipTap Node Attributes
// =====================================================================

/**
 * Attributes stored in the TipTap node
 * Note: With dynamic tables approach, 'data' is NOT stored in the node
 */
export interface DatabaseNodeAttributes {
  databaseId: string;
  config: DatabaseConfig;
  storageMode: 'supabase'; // Always 'supabase' for dynamic tables
  deleted?: boolean; // Flag to indicate database deletion for TipTap node removal
  isLinked?: boolean; // True if this is a reference to another document's database (don't delete data on block removal)
}

// =====================================================================
// Metadata (stored in document_databases table)
// =====================================================================

/**
 * Database metadata record
 */
export interface DocumentDatabase {
  id: string;
  document_id: string;
  database_id: string; // Corresponds to databaseId in TipTap node
  table_name: string; // Physical PostgreSQL table name (e.g., 'database_abc123')
  name: string;
  config: DatabaseConfig;
  created_at: string;
  updated_at: string;
}

// =====================================================================
// API Request/Response Types
// =====================================================================

/**
 * Request to create a new database
 */
export interface CreateDatabaseRequest {
  documentId: string;
  config: DatabaseConfig;
}

/**
 * Response when creating a database
 */
export interface CreateDatabaseResponse {
  databaseId: string;
  tableName: string;
}

/**
 * Request to add a row
 */
export interface AddRowRequest {
  databaseId: string;
  cells: Record<string, CellValue>;
  row_order?: number;
}

/**
 * Request to update a cell
 */
export interface UpdateCellRequest {
  databaseId: string;
  rowId: string;
  columnId: string;
  value: CellValue;
}

/**
 * Request to delete rows
 */
export interface DeleteRowsRequest {
  databaseId: string;
  rowIds: string[];
}

/**
 * Request to add a column
 */
export interface AddColumnRequest {
  databaseId: string;
  column: DatabaseColumn;
}

/**
 * Request to update column configuration
 */
export interface UpdateColumnRequest {
  databaseId: string;
  columnId: string;
  updates: Partial<DatabaseColumn>;
}

/**
 * Request to delete a column
 */
export interface DeleteColumnRequest {
  databaseId: string;
  columnId: string;
}

/**
 * Query parameters for fetching rows
 */
export interface QueryRowsParams {
  databaseId: string;
  filters?: Filter[];
  searchQuery?: string;
  sortBy?: string;
  sortOrder?: SortOrder;
  limit?: number;
  offset?: number;
}

// =====================================================================
// UI State Types
// =====================================================================

/**
 * Cell edit state
 */
export interface CellEditState {
  rowId: string;
  columnId: string;
  value: CellValue;
}

/**
 * Column resize state
 */
export interface ColumnResizeState {
  columnId: string;
  width: number;
}

/**
 * Selection state (for bulk operations)
 */
export interface SelectionState {
  selectedRowIds: Set<string>;
  isSelecting: boolean;
}

// =====================================================================
// Validation & Error Types
// =====================================================================

/**
 * Column validation result
 */
export interface ColumnValidation {
  valid: boolean;
  errors?: string[];
}

/**
 * Cell validation result
 */
export interface CellValidation {
  valid: boolean;
  error?: string;
}

/**
 * Database operation error
 */
export interface DatabaseError {
  code: string;
  message: string;
  details?: unknown;
}

// =====================================================================
// Helper Types
// =====================================================================

/**
 * Get default color for a column based on its index
 * Uses round-robin assignment through the color palette
 */
export function getDefaultColumnColor(index: number): PropertyColor {
  const colors: PropertyColor[] = ['blue', 'green', 'yellow', 'red', 'purple', 'pink', 'orange', 'gray'];
  return colors[index % colors.length];
}

/**
 * Type guard to check if a column has select choices
 */
export function hasSelectChoices(column: DatabaseColumn): column is DatabaseColumn & {
  options: Required<Pick<ColumnOptions, 'choices'>>
} {
  return (
    (column.type === 'select' || column.type === 'multi-select') &&
    column.options?.choices !== undefined &&
    column.options.choices.length > 0
  );
}

/**
 * Type guard to check if a column has number format
 */
export function hasNumberFormat(column: DatabaseColumn): column is DatabaseColumn & {
  options: Required<Pick<ColumnOptions, 'format'>>
} {
  return column.type === 'number' && column.options?.format !== undefined;
}

/**
 * Type guard to check if a column has date format
 */
export function hasDateFormat(column: DatabaseColumn): column is DatabaseColumn & {
  options: Required<Pick<ColumnOptions, 'dateFormat'>>
} {
  return column.type === 'date' && column.options?.dateFormat !== undefined;
}

/**
 * Type guard to check if a value is a DateRangeValue
 */
export function isDateRangeValue(value: CellValue): value is DateRangeValue {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    ('startDate' in value || 'endDate' in value)
  );
}

/**
 * Type guard to check if a column has includeTime option
 */
export function hasIncludeTime(column: DatabaseColumn): boolean {
  return column.type === 'date-range' && column.options?.includeTime === true;
}

/**
 * Find the Name column in a database config
 * This column is linked to the document title and cannot be deleted.
 * @param columns - Array of database columns
 * @returns The Name column if found, undefined otherwise
 */
export function findNameColumn(columns: DatabaseColumn[]): DatabaseColumn | undefined {
  // Priority 1: explicit isNameColumn flag
  const flagged = columns.find(col => col.isNameColumn === true);
  if (flagged) return flagged;

  // Priority 2: fallback by name (for backward compatibility with existing databases)
  return columns.find(col =>
    col.type === 'text' &&
    ['nom', 'name', 'title', 'titre'].includes(col.name.toLowerCase())
  );
}

// =====================================================================
// PostgreSQL Type Mapping
// =====================================================================

/**
 * Maps ColumnType to PostgreSQL data type
 */
export const COLUMN_TYPE_TO_PG_TYPE: Record<ColumnType, string> = {
  text: 'TEXT',
  number: 'NUMERIC',
  date: 'DATE',
  'date-range': 'JSONB',
  datetime: 'TIMESTAMPTZ',
  checkbox: 'BOOLEAN',
  select: 'TEXT',
  'multi-select': 'TEXT[]',
  url: 'TEXT',
  email: 'TEXT',
  'linked-items': 'JSONB',
  json: 'JSONB',
};

/**
 * Default column widths in pixels
 */
export const DEFAULT_COLUMN_WIDTHS: Record<ColumnType, number> = {
  text: 200,
  number: 120,
  date: 150,
  'date-range': 250,
  datetime: 200,
  checkbox: 80,
  select: 180,
  'multi-select': 220,
  url: 250,
  email: 200,
  'linked-items': 300,
  json: 250,
};

// =====================================================================
// Default Values
// =====================================================================

/**
 * Default database configuration for new databases
 * Starts with a "Nom" column linked to the document title
 * With lazy creation, the PostgreSQL table is only created when needed
 */
export const DEFAULT_DATABASE_CONFIG: DatabaseConfig = {
  name: 'Nouvelle base de données',
  columns: [
    {
      id: crypto.randomUUID(),
      name: 'Nom',
      type: 'text',
      visible: true,
      required: true,
      order: 0,
      isNameColumn: true,
      color: 'blue',
      width: DEFAULT_COLUMN_WIDTHS.text,
    },
  ],
  views: [
    {
      id: 'view-table',
      name: 'Vue tableau',
      type: 'table',
      config: {},
    },
  ],
  defaultView: 'table',
};

// =====================================================================
// Task Database Template
// =====================================================================

/**
 * Extended database configuration with optional type marker
 */
export interface DatabaseConfigExtended extends DatabaseConfig {
  type?: 'generic' | 'task' | 'event';
}

/**
 * Pre-defined columns for Task Databases (Notion-style)
 * Creates a database with all standard task management fields
 */
export function createTaskDatabaseTemplateColumns(): DatabaseColumn[] {
  return [
    {
      id: crypto.randomUUID(),
      name: 'Title',
      type: 'text',
      visible: true,
      required: true,
      readonly: true,
      order: 0,
      width: DEFAULT_COLUMN_WIDTHS.text,
      color: 'blue',
    },
    {
      id: crypto.randomUUID(),
      name: 'Description',
      type: 'text',
      visible: true,
      readonly: true,
      order: 1,
      width: 300,
      color: 'green',
    },
    {
      id: crypto.randomUUID(),
      name: 'Status',
      type: 'select',
      visible: true,
      readonly: true,
      order: 2,
      width: DEFAULT_COLUMN_WIDTHS.select,
      color: 'yellow',
      options: {
        choices: [
          { id: 'backlog', label: 'Backlog', color: 'bg-gray-200' },
          { id: 'pending', label: 'À faire', color: 'bg-yellow-200' },
          { id: 'in_progress', label: 'En cours', color: 'bg-blue-200' },
          { id: 'completed', label: 'Terminée', color: 'bg-green-200' },
          { id: 'cancelled', label: 'Annulée', color: 'bg-gray-300' },
          { id: 'blocked', label: 'Bloquée', color: 'bg-red-200' },
          { id: 'awaiting_info', label: 'En attente d\'infos', color: 'bg-purple-200' },
        ],
      },
    },
    {
      id: crypto.randomUUID(),
      name: 'Priority',
      type: 'select',
      visible: true,
      readonly: true,
      order: 3,
      width: DEFAULT_COLUMN_WIDTHS.select,
      color: 'red',
      options: {
        choices: [
          { id: 'low', label: 'Faible', color: 'bg-gray-100' },
          { id: 'medium', label: 'Moyenne', color: 'bg-yellow-200' },
          { id: 'high', label: 'Haute', color: 'bg-orange-200' },
          { id: 'critical', label: 'Critique', color: 'bg-red-300' },
        ],
      },
    },
    {
      id: crypto.randomUUID(),
      name: 'Type',
      type: 'select',
      visible: true,
      readonly: true,
      order: 4,
      width: DEFAULT_COLUMN_WIDTHS.select,
      color: 'purple',
      options: {
        choices: [
          { id: 'epic', label: 'Epic', color: 'bg-purple-200' },
          { id: 'feature', label: 'Feature', color: 'bg-blue-200' },
          { id: 'task', label: 'Task', color: 'bg-green-200' },
        ],
      },
    },
    {
      id: crypto.randomUUID(),
      name: 'Assigned To',
      type: 'text',
      visible: true,
      readonly: true,
      order: 5,
      width: DEFAULT_COLUMN_WIDTHS.text,
      color: 'pink',
    },
    {
      id: crypto.randomUUID(),
      name: 'Due Date',
      type: 'date',
      visible: true,
      readonly: true,
      order: 6,
      width: DEFAULT_COLUMN_WIDTHS.date,
      color: 'orange',
      options: {
        dateFormat: 'DD/MM/YYYY',
      },
    },
    {
      id: crypto.randomUUID(),
      name: 'Tags',
      type: 'multi-select',
      visible: true,
      readonly: true,
      order: 7,
      width: DEFAULT_COLUMN_WIDTHS['multi-select'],
      color: 'gray',
      options: {
        choices: [
          { id: 'frontend', label: 'Frontend', color: 'bg-cyan-200' },
          { id: 'backend', label: 'Backend', color: 'bg-indigo-200' },
          { id: 'ops', label: 'OPS', color: 'bg-orange-200' },
          { id: 'bug', label: 'Bug', color: 'bg-red-200' },
          { id: 'enhancement', label: 'Enhancement', color: 'bg-green-200' },
        ],
      },
    },
    {
      id: crypto.randomUUID(),
      name: 'Estimated Hours',
      type: 'number',
      visible: true,
      readonly: true,
      order: 8,
      width: DEFAULT_COLUMN_WIDTHS.number,
      color: 'blue',
      options: {
        format: 'decimal',
      },
    },
    {
      id: crypto.randomUUID(),
      name: 'Actual Hours',
      type: 'number',
      visible: true,
      readonly: true,
      order: 9,
      width: DEFAULT_COLUMN_WIDTHS.number,
      color: 'green',
      options: {
        format: 'decimal',
      },
    },
    {
      id: crypto.randomUUID(),
      name: 'Parent Task ID',
      type: 'text',
      visible: false,
      order: 10,
      width: DEFAULT_COLUMN_WIDTHS.text,
      color: 'yellow',
    },
    {
      id: crypto.randomUUID(),
      name: 'Epic ID',
      type: 'text',
      visible: false,
      order: 11,
      width: DEFAULT_COLUMN_WIDTHS.text,
      color: 'red',
    },
    {
      id: crypto.randomUUID(),
      name: 'Feature ID',
      type: 'text',
      visible: false,
      order: 12,
      width: DEFAULT_COLUMN_WIDTHS.text,
      color: 'purple',
    },
    {
      id: crypto.randomUUID(),
      name: 'Project ID',
      type: 'text',
      visible: false,
      order: 13,
      width: DEFAULT_COLUMN_WIDTHS.text,
      color: 'pink',
    },
    {
      id: crypto.randomUUID(),
      name: 'Task Number',
      type: 'text',
      visible: true,
      readonly: true,
      required: false,
      order: 14,
      width: 120,
      color: 'gray',
    },
  ];
}

/**
 * Creates a pre-configured task database configuration
 * @param name - Optional custom name for the task database
 * @returns Complete database configuration with task-specific columns and views
 */
export function createTaskDatabaseConfig(name: string = 'Task Database'): DatabaseConfigExtended {
  // Generate fresh columns with unique IDs for each new database
  const columns = createTaskDatabaseTemplateColumns();
  const statusColumnId = columns.find(col => col.name === 'Status')?.id;

  return {
    name,
    type: 'task',
    columns,
    views: [
      {
        id: 'view-table',
        name: 'Vue tableau',
        type: 'table',
        config: {},
      },
      {
        id: 'view-kanban',
        name: 'Vue Kanban',
        type: 'kanban',
        config: {
          groupBy: statusColumnId,
        },
      },
      {
        id: 'view-calendar',
        name: 'Vue calendrier',
        type: 'calendar',
        config: {},
      },
    ],
    defaultView: 'table',
    pinnedColumns: statusColumnId ? [statusColumnId] : [], // Pin Status column by default
  };
}

// =====================================================================
// Event Database Template
// =====================================================================

/**
 * Pre-defined columns for Event Databases (Calendar feature)
 * Creates a database with all standard event/calendar fields
 */
export function createEventDatabaseTemplateColumns(): DatabaseColumn[] {
  return [
    {
      id: crypto.randomUUID(),
      name: 'Title',
      type: 'text',
      visible: true,
      required: true,
      readonly: true,
      isNameColumn: true,
      order: 0,
      width: DEFAULT_COLUMN_WIDTHS.text,
      color: 'blue',
    },
    {
      id: crypto.randomUUID(),
      name: 'Description',
      type: 'text',
      visible: true,
      readonly: true,
      order: 1,
      width: 300,
      color: 'green',
    },
    {
      id: crypto.randomUUID(),
      name: 'Start Date',
      type: 'datetime',
      visible: true,
      readonly: true,
      order: 2,
      width: DEFAULT_COLUMN_WIDTHS.datetime,
      color: 'orange',
      options: {
        dateFormat: 'DD/MM/YYYY HH:mm',
      },
    },
    {
      id: crypto.randomUUID(),
      name: 'End Date',
      type: 'datetime',
      visible: true,
      readonly: true,
      order: 3,
      width: DEFAULT_COLUMN_WIDTHS.datetime,
      color: 'orange',
      options: {
        dateFormat: 'DD/MM/YYYY HH:mm',
      },
    },
    {
      id: crypto.randomUUID(),
      name: 'All Day',
      type: 'checkbox',
      visible: true,
      readonly: true,
      order: 4,
      width: DEFAULT_COLUMN_WIDTHS.checkbox,
      color: 'yellow',
    },
    {
      id: crypto.randomUUID(),
      name: 'Category',
      type: 'select',
      visible: true,
      readonly: true,
      order: 5,
      width: DEFAULT_COLUMN_WIDTHS.select,
      color: 'purple',
      options: {
        choices: [
          { id: 'meeting', label: 'Réunion', color: 'bg-blue-200' },
          { id: 'deadline', label: 'Échéance', color: 'bg-red-200' },
          { id: 'milestone', label: 'Jalon', color: 'bg-purple-200' },
          { id: 'reminder', label: 'Rappel', color: 'bg-yellow-200' },
          { id: 'personal', label: 'Personnel', color: 'bg-green-200' },
          { id: 'other', label: 'Autre', color: 'bg-gray-200' },
        ],
      },
    },
    {
      id: crypto.randomUUID(),
      name: 'Location',
      type: 'text',
      visible: true,
      order: 6,
      width: DEFAULT_COLUMN_WIDTHS.text,
      color: 'pink',
    },
    {
      id: crypto.randomUUID(),
      name: 'Recurrence',
      type: 'text',
      visible: false,
      order: 7,
      width: DEFAULT_COLUMN_WIDTHS.text,
      color: 'gray',
    },
    {
      id: crypto.randomUUID(),
      name: 'Linked Items',
      type: 'linked-items',
      visible: true,
      order: 8,
      width: DEFAULT_COLUMN_WIDTHS['linked-items'],
      color: 'blue',
    },
    {
      id: crypto.randomUUID(),
      name: 'Project ID',
      type: 'text',
      visible: false,
      order: 9,
      width: DEFAULT_COLUMN_WIDTHS.text,
      color: 'pink',
    },
    {
      id: crypto.randomUUID(),
      name: 'Event Number',
      type: 'text',
      visible: true,
      readonly: true,
      required: false,
      order: 10,
      width: 120,
      color: 'gray',
    },
    {
      id: crypto.randomUUID(),
      name: 'Reminders',
      type: 'text',
      visible: false,
      order: 11,
      width: DEFAULT_COLUMN_WIDTHS.text,
      color: 'yellow',
    },
    {
      id: crypto.randomUUID(),
      name: 'Google Meet',
      type: 'url',
      visible: true,
      readonly: true,
      order: 12,
      width: 250,
      color: 'green',
    },
  ];
}

/**
 * Creates a pre-configured event database configuration
 * @param name - Optional custom name for the event database
 * @returns Complete database configuration with event-specific columns and views
 */
export function createEventDatabaseConfig(name: string = 'Event Database'): DatabaseConfigExtended {
  const columns = createEventDatabaseTemplateColumns();
  const startDateColumnId = columns.find(col => col.name === 'Start Date')?.id;
  const endDateColumnId = columns.find(col => col.name === 'End Date')?.id;

  return {
    name,
    type: 'event',
    columns,
    views: [
      {
        id: 'view-calendar',
        name: 'Vue calendrier',
        type: 'calendar',
        config: {
          calendarDateColumnId: startDateColumnId,
        },
      },
      {
        id: 'view-table',
        name: 'Vue tableau',
        type: 'table',
        config: {},
      },
    ],
    defaultView: 'calendar',
  };
}
