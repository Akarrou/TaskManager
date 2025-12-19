/**
 * Spreadsheet System Models
 *
 * Type definitions for the advanced spreadsheet system integrated in TipTap editor.
 * Supports Excel-like functionality with formulas, formatting, and multi-sheet workbooks.
 */

// =====================================================================
// Cell Address & References
// =====================================================================

/**
 * Cell address in the spreadsheet (0-indexed internally)
 */
export interface CellAddress {
  row: number;
  col: number;
  sheet?: string; // Sheet ID for cross-sheet references
}

/**
 * Cell range (e.g., A1:B10)
 */
export interface CellRange {
  start: CellAddress;
  end: CellAddress;
}

/**
 * Convert column index to Excel-style letter (0 -> A, 25 -> Z, 26 -> AA)
 */
export function columnIndexToLetter(index: number): string {
  let letter = '';
  let temp = index;
  while (temp >= 0) {
    letter = String.fromCharCode(65 + (temp % 26)) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

/**
 * Convert Excel-style letter to column index (A -> 0, Z -> 25, AA -> 26)
 */
export function letterToColumnIndex(letter: string): number {
  let index = 0;
  for (let i = 0; i < letter.length; i++) {
    index = index * 26 + (letter.charCodeAt(i) - 64);
  }
  return index - 1;
}

/**
 * Convert CellAddress to Excel-style reference (e.g., "A1", "B2")
 */
export function cellAddressToRef(address: CellAddress): string {
  return `${columnIndexToLetter(address.col)}${address.row + 1}`;
}

/**
 * Parse Excel-style reference to CellAddress
 */
export function refToCellAddress(ref: string): CellAddress | null {
  const match = ref.match(/^\$?([A-Z]+)\$?(\d+)$/i);
  if (!match) return null;
  return {
    col: letterToColumnIndex(match[1].toUpperCase()),
    row: parseInt(match[2], 10) - 1,
  };
}

/**
 * Generate unique cell key for Map storage
 */
export function getCellKey(address: CellAddress): string {
  return `${address.sheet || 'default'}:${address.row}:${address.col}`;
}

// =====================================================================
// Cell Data Types
// =====================================================================

/**
 * Possible cell value types
 */
export type SpreadsheetCellValue = string | number | boolean | Date | null;

/**
 * Cell error types (Excel-compatible)
 */
export type CellErrorType =
  | '#VALUE!'
  | '#REF!'
  | '#DIV/0!'
  | '#NAME?'
  | '#N/A'
  | '#NUM!'
  | '#NULL!'
  | '#ERROR!';

/**
 * Cell computed result (can be value or error)
 */
export type CellComputedValue = SpreadsheetCellValue | CellErrorType;

// =====================================================================
// Cell Formatting
// =====================================================================

/**
 * Number format patterns (Excel-compatible)
 */
export type NumberFormatPattern =
  | 'general'
  | 'number'           // #,##0.00
  | 'currency'         // €#,##0.00
  | 'percentage'       // 0.00%
  | 'scientific'       // 0.00E+00
  | 'date-short'       // DD/MM/YYYY
  | 'date-long'        // DD MMMM YYYY
  | 'time'             // HH:MM:SS
  | 'datetime'         // DD/MM/YYYY HH:MM
  | 'text';            // @

/**
 * Text alignment options
 */
export type TextAlign = 'left' | 'center' | 'right';
export type VerticalAlign = 'top' | 'middle' | 'bottom';

/**
 * Border style
 */
export interface BorderStyle {
  width: number;       // 1, 2, 3
  style: 'solid' | 'dashed' | 'dotted' | 'double';
  color: string;       // Hex color
}

/**
 * Cell format configuration
 */
export interface CellFormat {
  // Number formatting
  numberFormat?: NumberFormatPattern;
  customFormat?: string;        // Custom format string
  decimalPlaces?: number;

  // Text styling
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline' | 'line-through';
  textColor?: string;           // Hex color

  // Cell styling
  backgroundColor?: string;     // Hex color
  textAlign?: TextAlign;
  verticalAlign?: VerticalAlign;

  // Borders
  borderTop?: BorderStyle;
  borderRight?: BorderStyle;
  borderBottom?: BorderStyle;
  borderLeft?: BorderStyle;

  // Layout
  wrapText?: boolean;
  indent?: number;              // Text indent level
}

/**
 * Cell merge information
 */
export interface CellMerge {
  rowSpan: number;
  colSpan: number;
}

// =====================================================================
// Cell Data Validation
// =====================================================================

/**
 * Validation rule types
 */
export type ValidationRuleType =
  | 'number'
  | 'integer'
  | 'decimal'
  | 'date'
  | 'time'
  | 'textLength'
  | 'list'
  | 'custom';

/**
 * Validation operators
 */
export type ValidationOperator =
  | 'between'
  | 'notBetween'
  | 'equal'
  | 'notEqual'
  | 'greaterThan'
  | 'lessThan'
  | 'greaterThanOrEqual'
  | 'lessThanOrEqual';

/**
 * Cell validation rule
 */
export interface CellValidation {
  type: ValidationRuleType;
  operator?: ValidationOperator;
  value1?: SpreadsheetCellValue;
  value2?: SpreadsheetCellValue;      // For 'between' operator
  listValues?: string[];              // For 'list' type
  customFormula?: string;             // For 'custom' type
  allowBlank?: boolean;
  showErrorMessage?: boolean;
  errorTitle?: string;
  errorMessage?: string;
}

// =====================================================================
// Spreadsheet Cell (Main Data Unit)
// =====================================================================

/**
 * Complete cell data stored in database
 */
export interface SpreadsheetCell {
  id: string;
  spreadsheet_id: string;
  sheet_id: string;
  row: number;                         // 0-indexed
  col: number;                         // 0-indexed
  raw_value: SpreadsheetCellValue;     // User input value
  formula?: string;                    // Formula string (e.g., "=SUM(A1:A10)")
  computed_value?: CellComputedValue;  // Cached formula result
  format?: CellFormat;
  validation?: CellValidation;
  merge?: CellMerge;
  note?: string;                       // Cell comment/note
  created_at: string;
  updated_at: string;
}

/**
 * Cell update payload (partial update)
 */
export interface SpreadsheetCellUpdate {
  raw_value?: SpreadsheetCellValue;
  formula?: string | null;
  format?: Partial<CellFormat>;
  validation?: CellValidation | null;
  merge?: CellMerge | null;
  note?: string | null;
}

// =====================================================================
// Sheet Configuration
// =====================================================================

/**
 * Sheet within a workbook
 */
export interface SpreadsheetSheet {
  id: string;
  name: string;
  order: number;
  color?: string;                      // Tab color
  columnWidths: Record<number, number>;
  rowHeights: Record<number, number>;
  defaultColWidth: number;
  defaultRowHeight: number;
  frozenRows?: number;                 // Number of frozen rows
  frozenCols?: number;                 // Number of frozen columns
  hiddenRows?: number[];
  hiddenCols?: number[];
  isProtected?: boolean;
}

/**
 * Default sheet configuration
 */
export const DEFAULT_SHEET_CONFIG: Omit<SpreadsheetSheet, 'id' | 'name' | 'order'> = {
  columnWidths: {},
  rowHeights: {},
  defaultColWidth: 100,
  defaultRowHeight: 24,
  frozenRows: 0,
  frozenCols: 0,
  hiddenRows: [],
  hiddenCols: [],
  isProtected: false,
};

// =====================================================================
// Spreadsheet Configuration (Workbook)
// =====================================================================

/**
 * Named range definition
 */
export interface NamedRange {
  name: string;
  range: string;          // e.g., "Sheet1!A1:B10"
  scope?: string;         // Sheet ID or 'workbook'
}

/**
 * Complete spreadsheet (workbook) configuration
 */
export interface SpreadsheetConfig {
  name: string;
  sheets: SpreadsheetSheet[];
  activeSheetId: string;
  namedRanges?: NamedRange[];
  showGridlines?: boolean;
  showRowHeaders?: boolean;
  showColumnHeaders?: boolean;
  defaultCellFormat?: Partial<CellFormat>;
}

/**
 * Default spreadsheet configuration
 */
export function createDefaultSpreadsheetConfig(name: string = 'Feuille de calcul'): SpreadsheetConfig {
  const defaultSheetId = crypto.randomUUID();
  return {
    name,
    sheets: [
      {
        id: defaultSheetId,
        name: 'Feuille 1',
        order: 0,
        ...DEFAULT_SHEET_CONFIG,
      },
    ],
    activeSheetId: defaultSheetId,
    namedRanges: [],
    showGridlines: true,
    showRowHeaders: true,
    showColumnHeaders: true,
    defaultCellFormat: {
      fontFamily: 'Arial',
      fontSize: 11,
      textAlign: 'left',
      verticalAlign: 'middle',
    },
  };
}

// =====================================================================
// TipTap Node Attributes
// =====================================================================

/**
 * Attributes stored in the TipTap spreadsheet node
 */
export interface SpreadsheetNodeAttributes {
  spreadsheetId: string;
  config: SpreadsheetConfig;
  storageMode: 'supabase';
  deleted?: boolean;
}

// =====================================================================
// Database Metadata
// =====================================================================

/**
 * Spreadsheet metadata record (stored in document_spreadsheets table)
 */
export interface DocumentSpreadsheet {
  id: string;
  document_id: string;
  spreadsheet_id: string;
  table_name: string;           // PostgreSQL table name for cells
  config: SpreadsheetConfig;
  created_at: string;
  updated_at: string;
  user_id?: string;
}

// =====================================================================
// Selection & UI State
// =====================================================================

/**
 * Selection types
 */
export type SelectionType = 'cell' | 'range' | 'row' | 'column' | 'all';

/**
 * Current selection state
 */
export interface SelectionState {
  type: SelectionType;
  anchor: CellAddress;           // Starting point of selection
  focus: CellAddress;            // Current end point (can change during drag)
  ranges?: CellRange[];          // Multiple selection ranges (Ctrl+click)
}

/**
 * Get normalized range (start always before end)
 */
export function normalizeRange(range: CellRange): CellRange {
  return {
    start: {
      row: Math.min(range.start.row, range.end.row),
      col: Math.min(range.start.col, range.end.col),
    },
    end: {
      row: Math.max(range.start.row, range.end.row),
      col: Math.max(range.start.col, range.end.col),
    },
  };
}

/**
 * Check if cell is within selection
 */
export function isCellInSelection(cell: CellAddress, selection: SelectionState | null): boolean {
  if (!selection) return false;

  const range = normalizeRange({ start: selection.anchor, end: selection.focus });

  return (
    cell.row >= range.start.row &&
    cell.row <= range.end.row &&
    cell.col >= range.start.col &&
    cell.col <= range.end.col
  );
}

/**
 * Editing state
 */
export interface EditingState {
  cell: CellAddress;
  value: string;
  mode: 'input' | 'formula';    // Direct input or formula bar
}

/**
 * Clipboard data format
 */
export interface ClipboardData {
  cells: SpreadsheetCell[];
  range: CellRange;
  sourceSpreadsheetId: string;
  sourceSheetId: string;
  cutMode: boolean;
}

// =====================================================================
// API Request/Response Types
// =====================================================================

/**
 * Request to create a new spreadsheet
 */
export interface CreateSpreadsheetRequest {
  documentId: string;
  config?: Partial<SpreadsheetConfig>;
}

/**
 * Response when creating a spreadsheet
 */
export interface CreateSpreadsheetResponse {
  spreadsheetId: string;
  tableName: string;
}

/**
 * Request to update cells (batch)
 */
export interface BatchUpdateCellsRequest {
  spreadsheetId: string;
  cells: Array<{
    sheetId: string;
    row: number;
    col: number;
    update: SpreadsheetCellUpdate;
  }>;
}

/**
 * Request to load cells (with optional range)
 */
export interface LoadCellsRequest {
  spreadsheetId: string;
  sheetId: string;
  range?: CellRange;
}

// =====================================================================
// Formula Types
// =====================================================================

/**
 * Formula dependency information
 */
export interface FormulaDependency {
  cell: CellAddress;
  dependsOn: CellAddress[];      // Cells this formula reads from
  dependents: CellAddress[];     // Cells that depend on this cell
}

/**
 * Formula parse result
 */
export interface FormulaParseResult {
  isValid: boolean;
  error?: string;
  references?: CellAddress[];
  ranges?: CellRange[];
}

// =====================================================================
// Import/Export Types
// =====================================================================

/**
 * Import source type
 */
export type ImportSourceType = 'xlsx' | 'csv' | 'google-sheets';

/**
 * Export target type
 */
export type ExportTargetType = 'xlsx' | 'csv' | 'google-sheets' | 'pdf';

/**
 * Import options
 */
export interface ImportOptions {
  source: ImportSourceType;
  preserveFormulas?: boolean;
  preserveFormatting?: boolean;
  sheetSelection?: string[];      // Import specific sheets only
}

/**
 * Export options
 */
export interface ExportOptions {
  target: ExportTargetType;
  includeFormulas?: boolean;
  includeFormatting?: boolean;
  sheetSelection?: string[];      // Export specific sheets only
  fileName?: string;
}

/**
 * Import result
 */
export interface SpreadsheetImportResult {
  config: SpreadsheetConfig;
  sheets: Record<string, SpreadsheetCell[]>;
  warnings?: string[];
}

// =====================================================================
// Constants
// =====================================================================

/**
 * Maximum grid dimensions
 */
export const MAX_ROWS = 1048576;          // Excel limit
export const MAX_COLS = 16384;            // Excel limit (XFD)

/**
 * Default dimensions
 */
export const DEFAULT_COL_WIDTH = 100;
export const DEFAULT_ROW_HEIGHT = 24;
export const MIN_COL_WIDTH = 20;
export const MIN_ROW_HEIGHT = 16;
export const MAX_COL_WIDTH = 500;
export const MAX_ROW_HEIGHT = 409;

/**
 * Virtual scroll buffer
 */
export const SCROLL_BUFFER_ROWS = 10;
export const SCROLL_BUFFER_COLS = 5;

/**
 * Common number formats
 */
export const NUMBER_FORMATS: Record<NumberFormatPattern, string> = {
  general: '',
  number: '#,##0.00',
  currency: '€#,##0.00',
  percentage: '0.00%',
  scientific: '0.00E+00',
  'date-short': 'DD/MM/YYYY',
  'date-long': 'DD MMMM YYYY',
  time: 'HH:mm:ss',
  datetime: 'DD/MM/YYYY HH:mm',
  text: '@',
};

/**
 * Default border style
 */
export const DEFAULT_BORDER_STYLE: BorderStyle = {
  width: 1,
  style: 'solid',
  color: '#000000',
};
