/**
 * Task CSV Import Models
 *
 * Interfaces and mappings for importing tasks from CSV files
 * into Task Databases (Document Databases with type='task')
 */

/**
 * Data passed to the TaskCsvImportDialogComponent
 */
export interface TaskCsvImportDialogData {
  // Optional: preselect a specific database (used when opening from document-database-table)
  preselectedDatabaseId?: string;
}

/**
 * Result returned from the CSV import operation
 */
export interface TaskCsvImportResult {
  rowsImported: number;
  errors: TaskCsvImportError[];
  databaseId: string;
  databaseName: string;
}

/**
 * Error details for a failed row import
 */
export interface TaskCsvImportError {
  row: number;
  column?: string;
  message: string;
}

/**
 * Column mapping configuration for CSV import
 */
/**
 * Available column types for new column creation
 */
export type NewColumnType = 'text' | 'number' | 'date' | 'checkbox' | 'select' | 'url' | 'email';

/**
 * Column type labels for display in UI (French)
 */
export const COLUMN_TYPE_LABELS: Record<NewColumnType, string> = {
  'text': 'Texte',
  'number': 'Nombre',
  'date': 'Date',
  'checkbox': 'Case à cocher',
  'select': 'Liste de choix (tags)',
  'url': 'Lien URL',
  'email': 'Email',
};

export interface CsvColumnMapping {
  csvColumnIndex: number;
  csvColumnName: string;
  targetColumnId: string | null;
  targetColumnName: string | null;
  confidence: number; // 0-1 confidence score for auto-mapping
  createNewColumn?: boolean; // If true, create a new column with this name
  newColumnType?: NewColumnType; // Type for the new column
}

/**
 * Preview data for the mapping step
 */
export interface CsvPreviewData {
  headers: string[];
  sampleRows: string[][];
  totalRows: number;
}

/**
 * Mapping of Task Database column names to possible CSV header names
 * Used for intelligent auto-mapping of CSV columns
 */
export const TASK_COLUMN_MAPPINGS: Record<string, string[]> = {
  'Title': ['title', 'titre', 'nom', 'name', 'tâche', 'tache', 'task', 'sujet', 'subject'],
  'Description': ['description', 'desc', 'détails', 'details', 'contenu', 'content', 'notes'],
  'Status': ['status', 'statut', 'état', 'etat', 'state', 'avancement'],
  'Priority': ['priority', 'priorité', 'priorite', 'prio', 'importance'],
  'Type': ['type', 'catégorie', 'categorie', 'category'],
  'Assigned To': ['assigned_to', 'assigned to', 'assignee', 'assigné', 'assigne', 'responsable', 'owner', 'propriétaire'],
  'Due Date': ['due_date', 'due date', 'deadline', 'échéance', 'echeance', 'date_limite', 'date limite', 'date fin', 'end date', "date d'échéance", "date d'echeance"],
  'Tags': ['tags', 'tag', 'labels', 'label', 'étiquettes', 'etiquettes', 'keywords', 'mots-clés', 'phase', 'phases'],
  'Estimated Hours': ['estimated_hours', 'estimated hours', 'estimation', 'heures', 'hours', 'estimate', 'temps estimé', 'durée'],
  'Actual Hours': ['actual_hours', 'actual hours', 'heures réelles', 'temps réel', 'duration'],
  'Task Number': ['task_number', 'task number', 'numéro', 'numero', 'id', 'ref', 'reference'],
};

/**
 * Status value mappings (French → English, various formats → normalized)
 */
export const STATUS_MAPPINGS: Record<string, string> = {
  // English
  'backlog': 'backlog',
  'pending': 'pending',
  'todo': 'pending',
  'to do': 'pending',
  'to-do': 'pending',
  'in_progress': 'in_progress',
  'in progress': 'in_progress',
  'in-progress': 'in_progress',
  'working': 'in_progress',
  'completed': 'completed',
  'done': 'completed',
  'finished': 'completed',
  'cancelled': 'cancelled',
  'canceled': 'cancelled',
  'blocked': 'blocked',
  'on hold': 'blocked',
  'awaiting_info': 'awaiting_info',
  'awaiting info': 'awaiting_info',
  'waiting': 'awaiting_info',
  'review': 'review',
  'in review': 'review',

  // French
  'à faire': 'pending',
  'a faire': 'pending',
  'en attente': 'pending',
  'en cours': 'in_progress',
  'terminé': 'completed',
  'termine': 'completed',
  'terminée': 'completed',
  'terminee': 'completed',
  'fait': 'completed',
  'fini': 'completed',
  'annulé': 'cancelled',
  'annule': 'cancelled',
  'annulée': 'cancelled',
  'annulee': 'cancelled',
  'bloqué': 'blocked',
  'bloque': 'blocked',
  'bloquée': 'blocked',
  'bloquee': 'blocked',
  'en attente d\'infos': 'awaiting_info',
  'en attente d\'info': 'awaiting_info',
  'en révision': 'review',
  'en revision': 'review',
};

/**
 * Priority value mappings (French → English, various formats → normalized)
 */
export const PRIORITY_MAPPINGS: Record<string, string> = {
  // English
  'low': 'low',
  'medium': 'medium',
  'normal': 'medium',
  'high': 'high',
  'critical': 'critical',
  'urgent': 'critical',

  // French
  'faible': 'low',
  'basse': 'low',
  'bas': 'low',
  'moyenne': 'medium',
  'moyen': 'medium',
  'normale': 'medium',
  'haute': 'high',
  'haut': 'high',
  'élevée': 'high',
  'elevee': 'high',
  'élevé': 'high',
  'eleve': 'high',
  'critique': 'critical',
  'urgente': 'critical',
  'urgence': 'critical',
};

/**
 * Type value mappings
 */
export const TYPE_MAPPINGS: Record<string, string> = {
  'epic': 'epic',
  'feature': 'feature',
  'task': 'task',
  'tâche': 'task',
  'tache': 'task',
  'fonctionnalité': 'feature',
  'fonctionnalite': 'feature',
};

/**
 * Normalize a status value to the expected format
 */
export function normalizeStatus(value: string | null | undefined): string {
  if (!value) return 'pending';
  const normalized = value.toLowerCase().trim();
  return STATUS_MAPPINGS[normalized] || 'pending';
}

/**
 * Normalize a priority value to the expected format
 */
export function normalizePriority(value: string | null | undefined): string {
  if (!value) return 'medium';
  const normalized = value.toLowerCase().trim();
  return PRIORITY_MAPPINGS[normalized] || 'medium';
}

/**
 * Normalize a type value to the expected format
 */
export function normalizeType(value: string | null | undefined): string {
  if (!value) return 'task';
  const normalized = value.toLowerCase().trim();
  return TYPE_MAPPINGS[normalized] || 'task';
}

/**
 * Parse a date string in various formats and return ISO format
 */
export function parseDate(value: string | null | undefined): string | null {
  if (!value || !value.trim()) return null;

  const trimmed = value.trim();

  // Try various date formats
  const formats = [
    // ISO format
    /^(\d{4})-(\d{2})-(\d{2})$/,
    // European format DD/MM/YYYY
    /^(\d{2})\/(\d{2})\/(\d{4})$/,
    // European format DD-MM-YYYY
    /^(\d{2})-(\d{2})-(\d{4})$/,
    // US format MM/DD/YYYY
    /^(\d{2})\/(\d{2})\/(\d{4})$/,
  ];

  // ISO format YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // European format DD/MM/YYYY or DD-MM-YYYY
  const euMatch = trimmed.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
  if (euMatch) {
    const day = euMatch[1];
    const month = euMatch[2];
    const year = euMatch[3];
    // Check if day > 12 to confirm it's European format
    if (parseInt(day) > 12) {
      return `${year}-${month}-${day}`;
    }
    // Assume European format by default for ambiguous dates
    return `${year}-${month}-${day}`;
  }

  // Try native Date parsing as fallback
  const date = new Date(trimmed);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }

  return null;
}

/**
 * Parse tags from a string (comma, semicolon, or pipe separated)
 */
export function parseTags(value: string | null | undefined): string[] {
  if (!value || !value.trim()) return [];

  // Detect delimiter
  const delimiters = [',', ';', '|'];
  for (const delim of delimiters) {
    if (value.includes(delim)) {
      return value.split(delim).map(t => t.trim()).filter(t => t.length > 0);
    }
  }

  // Single tag
  return [value.trim()];
}

/**
 * Parse a numeric value
 */
export function parseNumber(value: string | null | undefined): number | null {
  if (!value || !value.trim()) return null;

  // Replace comma with dot for decimal parsing
  const normalized = value.trim().replace(/,/g, '.');
  const num = parseFloat(normalized);

  return isNaN(num) ? null : num;
}

/**
 * Find the best matching target column for a CSV header
 */
export function findBestColumnMatch(
  csvHeader: string,
  targetColumns: { id: string; name: string }[]
): { columnId: string | null; columnName: string | null; confidence: number } {
  const normalizedHeader = csvHeader.toLowerCase().trim();

  // First, try exact match with target column names
  for (const col of targetColumns) {
    if (col.name.toLowerCase() === normalizedHeader) {
      return { columnId: col.id, columnName: col.name, confidence: 1.0 };
    }
  }

  // Then, try mapping from TASK_COLUMN_MAPPINGS
  for (const [targetName, aliases] of Object.entries(TASK_COLUMN_MAPPINGS)) {
    if (aliases.includes(normalizedHeader)) {
      const targetCol = targetColumns.find(c => c.name === targetName);
      if (targetCol) {
        return { columnId: targetCol.id, columnName: targetCol.name, confidence: 0.9 };
      }
    }
  }

  // Try partial match
  for (const col of targetColumns) {
    const colNameLower = col.name.toLowerCase();
    if (colNameLower.includes(normalizedHeader) || normalizedHeader.includes(colNameLower)) {
      return { columnId: col.id, columnName: col.name, confidence: 0.6 };
    }
  }

  return { columnId: null, columnName: null, confidence: 0 };
}
