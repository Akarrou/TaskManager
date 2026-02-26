import { ColumnType, SelectChoice } from './database.model';

/**
 * Configuration du parsing CSV
 */
export interface CsvImportConfig {
  hasHeaders: boolean;
  delimiter: string;
  encoding: string;
}

/**
 * Prévisualisation du contenu CSV après parsing
 */
export interface CsvImportPreview {
  headers: string[];
  detectedTypes: {
    type: ColumnType;
    confidence: number;
    options?: { choices?: SelectChoice[] };
  }[];
  sampleData: string[][];
  totalRows: number;
  warnings: string[];
}

/**
 * Données d'entrée du dialog d'import
 */
export interface CsvImportDialogData {
  databaseId: string;
  tableName: string;
}

/**
 * Résultat de l'import CSV
 */
export interface CsvImportResult {
  columnsCreated: number;
  rowsImported: number;
  errors: CsvImportError[];
}

/**
 * Erreur rencontrée pendant l'import
 */
export interface CsvImportError {
  row: number;
  column?: string;
  message: string;
}

/**
 * Colonne détectée depuis le CSV
 */
export interface DetectedColumn {
  name: string;
  type: ColumnType;
  confidence: number;
  options?: { choices?: SelectChoice[] };
}
