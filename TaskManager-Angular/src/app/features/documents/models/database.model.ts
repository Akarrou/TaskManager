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
  | 'checkbox'
  | 'select'
  | 'multi-select'
  | 'url'
  | 'email';

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
  order: number;
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
}

// =====================================================================
// Data Storage
// =====================================================================

/**
 * Cell value types
 */
export type CellValue = string | number | boolean | string[] | null;

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
  checkbox: 'BOOLEAN',
  select: 'TEXT',
  'multi-select': 'TEXT[]',
  url: 'TEXT',
  email: 'TEXT',
};

/**
 * Default column widths in pixels
 */
export const DEFAULT_COLUMN_WIDTHS: Record<ColumnType, number> = {
  text: 200,
  number: 120,
  date: 150,
  checkbox: 80,
  select: 180,
  'multi-select': 220,
  url: 250,
  email: 200,
};

// =====================================================================
// Default Values
// =====================================================================

/**
 * Default database configuration for new databases
 * Starts with NO columns - user must add columns or import CSV
 * With lazy creation, the PostgreSQL table is only created when needed
 */
export const DEFAULT_DATABASE_CONFIG: DatabaseConfig = {
  name: 'Nouvelle base de données',
  columns: [], // Empty by default - user adds columns manually or via CSV import
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
  type?: 'generic' | 'task';
}

/**
 * Pre-defined columns for Task Databases (Notion-style)
 * Creates a database with all standard task management fields
 */
export const TASK_DATABASE_TEMPLATE_COLUMNS: DatabaseColumn[] = [
  {
    id: crypto.randomUUID(),
    name: 'Title',
    type: 'text',
    visible: true,
    required: true,
    order: 0,
    width: DEFAULT_COLUMN_WIDTHS.text,
  },
  {
    id: crypto.randomUUID(),
    name: 'Description',
    type: 'text',
    visible: true,
    order: 1,
    width: 300,
  },
  {
    id: crypto.randomUUID(),
    name: 'Status',
    type: 'select',
    visible: true,
    order: 2,
    width: DEFAULT_COLUMN_WIDTHS.select,
    options: {
      choices: [
        { id: 'pending', label: 'Pending', color: 'bg-gray-200' },
        { id: 'in-progress', label: 'In Progress', color: 'bg-blue-200' },
        { id: 'completed', label: 'Completed', color: 'bg-green-200' },
        { id: 'blocked', label: 'Blocked', color: 'bg-red-200' },
      ],
    },
  },
  {
    id: crypto.randomUUID(),
    name: 'Priority',
    type: 'select',
    visible: true,
    order: 3,
    width: DEFAULT_COLUMN_WIDTHS.select,
    options: {
      choices: [
        { id: 'low', label: 'Low', color: 'bg-gray-100' },
        { id: 'medium', label: 'Medium', color: 'bg-yellow-200' },
        { id: 'high', label: 'High', color: 'bg-orange-200' },
        { id: 'critical', label: 'Critical', color: 'bg-red-300' },
      ],
    },
  },
  {
    id: crypto.randomUUID(),
    name: 'Type',
    type: 'select',
    visible: true,
    order: 4,
    width: DEFAULT_COLUMN_WIDTHS.select,
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
    order: 5,
    width: DEFAULT_COLUMN_WIDTHS.text,
  },
  {
    id: crypto.randomUUID(),
    name: 'Due Date',
    type: 'date',
    visible: true,
    order: 6,
    width: DEFAULT_COLUMN_WIDTHS.date,
    options: {
      dateFormat: 'DD/MM/YYYY',
    },
  },
  {
    id: crypto.randomUUID(),
    name: 'Tags',
    type: 'multi-select',
    visible: true,
    order: 7,
    width: DEFAULT_COLUMN_WIDTHS['multi-select'],
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
    order: 8,
    width: DEFAULT_COLUMN_WIDTHS.number,
    options: {
      format: 'decimal',
    },
  },
  {
    id: crypto.randomUUID(),
    name: 'Actual Hours',
    type: 'number',
    visible: true,
    order: 9,
    width: DEFAULT_COLUMN_WIDTHS.number,
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
  },
  {
    id: crypto.randomUUID(),
    name: 'Epic ID',
    type: 'text',
    visible: false,
    order: 11,
    width: DEFAULT_COLUMN_WIDTHS.text,
  },
  {
    id: crypto.randomUUID(),
    name: 'Feature ID',
    type: 'text',
    visible: false,
    order: 12,
    width: DEFAULT_COLUMN_WIDTHS.text,
  },
  {
    id: crypto.randomUUID(),
    name: 'Project ID',
    type: 'text',
    visible: false,
    order: 13,
    width: DEFAULT_COLUMN_WIDTHS.text,
  },
];

/**
 * Creates a pre-configured task database configuration
 * @param name - Optional custom name for the task database
 * @returns Complete database configuration with task-specific columns and views
 */
export function createTaskDatabaseConfig(name: string = 'Task Database'): DatabaseConfigExtended {
  return {
    name,
    type: 'task',
    columns: TASK_DATABASE_TEMPLATE_COLUMNS,
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
          groupBy: TASK_DATABASE_TEMPLATE_COLUMNS.find(col => col.name === 'Status')?.id,
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
  };
}
