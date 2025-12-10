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
 */
export const DEFAULT_DATABASE_CONFIG: DatabaseConfig = {
  name: 'Nouvelle base de données',
  columns: [
    {
      id: 'col-name',
      name: 'Nom',
      type: 'text',
      visible: true,
      required: true,
      order: 0,
      width: DEFAULT_COLUMN_WIDTHS.text,
    },
    {
      id: 'col-status',
      name: 'Statut',
      type: 'select',
      visible: true,
      order: 1,
      width: DEFAULT_COLUMN_WIDTHS.select,
      options: {
        choices: [
          { id: 'todo', label: 'À faire', color: 'bg-gray-200' },
          { id: 'in-progress', label: 'En cours', color: 'bg-blue-200' },
          { id: 'done', label: 'Terminé', color: 'bg-green-200' },
        ],
      },
    },
  ],
  views: [
    {
      id: 'view-table',
      name: 'Vue tableau',
      type: 'table',
      config: {
        sortBy: 'col-name',
        sortOrder: 'asc',
      },
    },
  ],
  defaultView: 'table',
};
