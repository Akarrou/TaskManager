import { Injectable } from '@angular/core';
import HyperFormula, {
  HyperFormula as HF,
  ConfigParams,
  CellValue,
  DetailedCellError,
  SimpleCellAddress,
  SimpleCellRange,
  Sheet,
} from 'hyperformula';
import {
  SpreadsheetCell,
  SpreadsheetCellValue,
  CellAddress,
  CellRange,
  CellErrorType,
  getCellKey,
} from '../models/spreadsheet.model';

/**
 * Formula function metadata for autocompletion
 */
export interface FormulaFunction {
  name: string;
  category: string;
  description: string;
  syntax: string;
  examples: string[];
}

/**
 * Formula parse result
 */
export interface FormulaParseResult {
  isValid: boolean;
  error?: string;
  references: CellAddress[];
  ranges: CellRange[];
}

/**
 * FormulaEngineService
 *
 * Angular wrapper around HyperFormula for spreadsheet formula calculations.
 * Provides formula evaluation, dependency tracking, and function autocompletion.
 *
 * Features:
 * - 400+ Excel-compatible functions
 * - Dependency graph for efficient recalculation
 * - French locale support
 * - Cell reference parsing (A1, $A$1, A1:B10)
 */
@Injectable({
  providedIn: 'root',
})
export class FormulaEngineService {
  private hfInstance: HF | null = null;
  private sheetMapping = new Map<string, number>(); // sheetId -> HF sheet index

  /**
   * Default HyperFormula configuration
   */
  private readonly defaultConfig: Partial<ConfigParams> = {
    licenseKey: 'gpl-v3', // GPL v3 license (free for open source)
    language: 'enGB', // Use English as fallback (more stable)
    useColumnIndex: false, // Use A1 notation
    precisionRounding: 10,
    precisionEpsilon: 1e-13,
    smartRounding: true,
    leapYear1900: false, // Excel compatibility
    nullYear: 30, // 2-digit year threshold
    dateFormats: ['DD/MM/YYYY', 'DD-MM-YYYY', 'YYYY-MM-DD'],
    timeFormats: ['HH:mm', 'HH:mm:ss'],
    currencySymbol: ['€', 'EUR'],
    thousandSeparator: ' ',
    decimalSeparator: ',',
    functionArgSeparator: ';', // French convention
  };

  /**
   * Common Excel functions organized by category
   */
  readonly functionCategories: Record<string, FormulaFunction[]> = {
    'Math': [
      { name: 'SUM', category: 'Math', description: 'Additionne les valeurs', syntax: 'SUM(nombre1; [nombre2]; ...)', examples: ['=SUM(A1:A10)', '=SUM(1; 2; 3)'] },
      { name: 'AVERAGE', category: 'Math', description: 'Calcule la moyenne', syntax: 'AVERAGE(nombre1; [nombre2]; ...)', examples: ['=AVERAGE(A1:A10)'] },
      { name: 'MIN', category: 'Math', description: 'Retourne la valeur minimale', syntax: 'MIN(nombre1; [nombre2]; ...)', examples: ['=MIN(A1:A10)'] },
      { name: 'MAX', category: 'Math', description: 'Retourne la valeur maximale', syntax: 'MAX(nombre1; [nombre2]; ...)', examples: ['=MAX(A1:A10)'] },
      { name: 'COUNT', category: 'Math', description: 'Compte les cellules numériques', syntax: 'COUNT(valeur1; [valeur2]; ...)', examples: ['=COUNT(A1:A10)'] },
      { name: 'COUNTA', category: 'Math', description: 'Compte les cellules non vides', syntax: 'COUNTA(valeur1; [valeur2]; ...)', examples: ['=COUNTA(A1:A10)'] },
      { name: 'ROUND', category: 'Math', description: 'Arrondit un nombre', syntax: 'ROUND(nombre; nb_décimales)', examples: ['=ROUND(3.14159; 2)'] },
      { name: 'ROUNDUP', category: 'Math', description: 'Arrondit vers le haut', syntax: 'ROUNDUP(nombre; nb_décimales)', examples: ['=ROUNDUP(3.14; 1)'] },
      { name: 'ROUNDDOWN', category: 'Math', description: 'Arrondit vers le bas', syntax: 'ROUNDDOWN(nombre; nb_décimales)', examples: ['=ROUNDDOWN(3.99; 0)'] },
      { name: 'ABS', category: 'Math', description: 'Valeur absolue', syntax: 'ABS(nombre)', examples: ['=ABS(-5)'] },
      { name: 'SQRT', category: 'Math', description: 'Racine carrée', syntax: 'SQRT(nombre)', examples: ['=SQRT(16)'] },
      { name: 'POWER', category: 'Math', description: 'Puissance', syntax: 'POWER(nombre; puissance)', examples: ['=POWER(2; 3)'] },
      { name: 'MOD', category: 'Math', description: 'Reste de division', syntax: 'MOD(nombre; diviseur)', examples: ['=MOD(10; 3)'] },
    ],
    'Logic': [
      { name: 'IF', category: 'Logic', description: 'Condition logique', syntax: 'IF(condition; valeur_si_vrai; [valeur_si_faux])', examples: ['=IF(A1>10; "Grand"; "Petit")'] },
      { name: 'AND', category: 'Logic', description: 'ET logique', syntax: 'AND(logique1; [logique2]; ...)', examples: ['=AND(A1>0; B1>0)'] },
      { name: 'OR', category: 'Logic', description: 'OU logique', syntax: 'OR(logique1; [logique2]; ...)', examples: ['=OR(A1>10; B1>10)'] },
      { name: 'NOT', category: 'Logic', description: 'NON logique', syntax: 'NOT(logique)', examples: ['=NOT(A1>10)'] },
      { name: 'IFERROR', category: 'Logic', description: 'Gestion d\'erreur', syntax: 'IFERROR(valeur; valeur_si_erreur)', examples: ['=IFERROR(A1/B1; 0)'] },
      { name: 'IFS', category: 'Logic', description: 'Conditions multiples', syntax: 'IFS(condition1; valeur1; [condition2; valeur2]; ...)', examples: ['=IFS(A1>90; "A"; A1>80; "B"; TRUE; "C")'] },
      { name: 'SWITCH', category: 'Logic', description: 'Correspondance valeurs', syntax: 'SWITCH(expression; valeur1; résultat1; ...)', examples: ['=SWITCH(A1; 1; "Un"; 2; "Deux"; "Autre")'] },
    ],
    'Lookup': [
      { name: 'VLOOKUP', category: 'Lookup', description: 'Recherche verticale', syntax: 'VLOOKUP(valeur; tableau; no_col; [correspondance])', examples: ['=VLOOKUP(A1; B1:D10; 2; FALSE)'] },
      { name: 'HLOOKUP', category: 'Lookup', description: 'Recherche horizontale', syntax: 'HLOOKUP(valeur; tableau; no_ligne; [correspondance])', examples: ['=HLOOKUP(A1; B1:J3; 2; FALSE)'] },
      { name: 'INDEX', category: 'Lookup', description: 'Valeur à une position', syntax: 'INDEX(tableau; no_ligne; [no_col])', examples: ['=INDEX(A1:C10; 5; 2)'] },
      { name: 'MATCH', category: 'Lookup', description: 'Position d\'une valeur', syntax: 'MATCH(valeur; plage; [type])', examples: ['=MATCH("Pomme"; A1:A10; 0)'] },
    ],
    'Text': [
      { name: 'CONCATENATE', category: 'Text', description: 'Concatène du texte', syntax: 'CONCATENATE(texte1; [texte2]; ...)', examples: ['=CONCATENATE(A1; " "; B1)'] },
      { name: 'CONCAT', category: 'Text', description: 'Concatène (moderne)', syntax: 'CONCAT(texte1; [texte2]; ...)', examples: ['=CONCAT(A1; B1)'] },
      { name: 'LEFT', category: 'Text', description: 'Caractères de gauche', syntax: 'LEFT(texte; [nb_car])', examples: ['=LEFT("Bonjour"; 3)'] },
      { name: 'RIGHT', category: 'Text', description: 'Caractères de droite', syntax: 'RIGHT(texte; [nb_car])', examples: ['=RIGHT("Bonjour"; 4)'] },
      { name: 'MID', category: 'Text', description: 'Caractères du milieu', syntax: 'MID(texte; début; nb_car)', examples: ['=MID("Bonjour"; 4; 4)'] },
      { name: 'LEN', category: 'Text', description: 'Longueur du texte', syntax: 'LEN(texte)', examples: ['=LEN("Bonjour")'] },
      { name: 'TRIM', category: 'Text', description: 'Supprime les espaces', syntax: 'TRIM(texte)', examples: ['=TRIM("  Hello  ")'] },
      { name: 'UPPER', category: 'Text', description: 'Majuscules', syntax: 'UPPER(texte)', examples: ['=UPPER("bonjour")'] },
      { name: 'LOWER', category: 'Text', description: 'Minuscules', syntax: 'LOWER(texte)', examples: ['=LOWER("BONJOUR")'] },
      { name: 'PROPER', category: 'Text', description: 'Première lettre majuscule', syntax: 'PROPER(texte)', examples: ['=PROPER("jean dupont")'] },
      { name: 'TEXT', category: 'Text', description: 'Formate un nombre', syntax: 'TEXT(valeur; format)', examples: ['=TEXT(1234.5; "#,##0.00")'] },
      { name: 'VALUE', category: 'Text', description: 'Convertit en nombre', syntax: 'VALUE(texte)', examples: ['=VALUE("123")'] },
    ],
    'Date': [
      { name: 'TODAY', category: 'Date', description: 'Date du jour', syntax: 'TODAY()', examples: ['=TODAY()'] },
      { name: 'NOW', category: 'Date', description: 'Date et heure actuelles', syntax: 'NOW()', examples: ['=NOW()'] },
      { name: 'DATE', category: 'Date', description: 'Crée une date', syntax: 'DATE(année; mois; jour)', examples: ['=DATE(2024; 12; 25)'] },
      { name: 'YEAR', category: 'Date', description: 'Extrait l\'année', syntax: 'YEAR(date)', examples: ['=YEAR(A1)'] },
      { name: 'MONTH', category: 'Date', description: 'Extrait le mois', syntax: 'MONTH(date)', examples: ['=MONTH(A1)'] },
      { name: 'DAY', category: 'Date', description: 'Extrait le jour', syntax: 'DAY(date)', examples: ['=DAY(A1)'] },
      { name: 'WEEKDAY', category: 'Date', description: 'Jour de la semaine', syntax: 'WEEKDAY(date; [type])', examples: ['=WEEKDAY(A1)'] },
      { name: 'DATEDIF', category: 'Date', description: 'Différence entre dates', syntax: 'DATEDIF(début; fin; unité)', examples: ['=DATEDIF(A1; B1; "D")'] },
      { name: 'EDATE', category: 'Date', description: 'Ajoute des mois', syntax: 'EDATE(date; mois)', examples: ['=EDATE(A1; 3)'] },
      { name: 'EOMONTH', category: 'Date', description: 'Fin de mois', syntax: 'EOMONTH(date; mois)', examples: ['=EOMONTH(A1; 0)'] },
    ],
    'Statistical': [
      { name: 'SUMIF', category: 'Statistical', description: 'Somme conditionnelle', syntax: 'SUMIF(plage; critère; [plage_somme])', examples: ['=SUMIF(A1:A10; ">10")'] },
      { name: 'SUMIFS', category: 'Statistical', description: 'Somme multi-critères', syntax: 'SUMIFS(plage_somme; plage1; critère1; ...)', examples: ['=SUMIFS(C1:C10; A1:A10; ">10"; B1:B10; "<5")'] },
      { name: 'COUNTIF', category: 'Statistical', description: 'Compte conditionnel', syntax: 'COUNTIF(plage; critère)', examples: ['=COUNTIF(A1:A10; ">10")'] },
      { name: 'COUNTIFS', category: 'Statistical', description: 'Compte multi-critères', syntax: 'COUNTIFS(plage1; critère1; [plage2; critère2]; ...)', examples: ['=COUNTIFS(A1:A10; ">10"; B1:B10; "<5")'] },
      { name: 'AVERAGEIF', category: 'Statistical', description: 'Moyenne conditionnelle', syntax: 'AVERAGEIF(plage; critère; [plage_moyenne])', examples: ['=AVERAGEIF(A1:A10; ">10")'] },
      { name: 'STDEV', category: 'Statistical', description: 'Écart-type', syntax: 'STDEV(nombre1; [nombre2]; ...)', examples: ['=STDEV(A1:A10)'] },
      { name: 'VAR', category: 'Statistical', description: 'Variance', syntax: 'VAR(nombre1; [nombre2]; ...)', examples: ['=VAR(A1:A10)'] },
      { name: 'MEDIAN', category: 'Statistical', description: 'Médiane', syntax: 'MEDIAN(nombre1; [nombre2]; ...)', examples: ['=MEDIAN(A1:A10)'] },
    ],
  };

  /**
   * Get all functions as a flat array
   */
  get allFunctions(): FormulaFunction[] {
    return Object.values(this.functionCategories).flat();
  }

  /**
   * Initialize HyperFormula instance
   */
  initialize(sheets?: Record<string, unknown[][]>): void {
    if (this.hfInstance) {
      this.hfInstance.destroy();
    }

    // Build sheets data
    const sheetsData: Record<string, Sheet> = {};
    if (sheets) {
      Object.entries(sheets).forEach(([sheetId, data]) => {
        sheetsData[sheetId] = data as Sheet;
      });
    }

    // Create instance with initial sheets
    this.hfInstance = HyperFormula.buildFromSheets(
      sheetsData,
      this.defaultConfig
    );

    // Store sheet mapping
    this.sheetMapping.clear();
    if (sheets) {
      Object.keys(sheets).forEach((sheetId, index) => {
        this.sheetMapping.set(sheetId, index);
      });
    }
  }

  /**
   * Destroy the HyperFormula instance
   */
  destroy(): void {
    if (this.hfInstance) {
      this.hfInstance.destroy();
      this.hfInstance = null;
    }
    this.sheetMapping.clear();
  }

  /**
   * Add a new sheet to the engine
   */
  addSheet(sheetId: string, data?: unknown[][]): number {
    if (!this.hfInstance) {
      this.initialize();
    }

    const sheetName = this.hfInstance!.addSheet(sheetId);
    const sheetIndex = this.hfInstance!.getSheetId(sheetName);

    if (sheetIndex !== undefined) {
      this.sheetMapping.set(sheetId, sheetIndex);

      // Populate with initial data if provided
      if (data && data.length > 0) {
        this.hfInstance!.setSheetContent(sheetIndex, data as Sheet);
      }
    }

    return sheetIndex ?? 0;
  }

  /**
   * Remove a sheet from the engine
   */
  removeSheet(sheetId: string): void {
    if (!this.hfInstance) return;

    const sheetIndex = this.sheetMapping.get(sheetId);
    if (sheetIndex !== undefined) {
      this.hfInstance.removeSheet(sheetIndex);
      this.sheetMapping.delete(sheetId);
    }
  }

  /**
   * Set cell value
   */
  setCellValue(sheetId: string, row: number, col: number, value: SpreadsheetCellValue | string): void {
    if (!this.hfInstance) {
      this.initialize();
      this.addSheet(sheetId);
    }

    let sheetIndex = this.sheetMapping.get(sheetId);
    if (sheetIndex === undefined) {
      sheetIndex = this.addSheet(sheetId);
    }

    const address: SimpleCellAddress = { sheet: sheetIndex, row, col };
    this.hfInstance!.setCellContents(address, [[value]]);
  }

  /**
   * Get computed cell value (result of formula or raw value)
   */
  getCellValue(sheetId: string, row: number, col: number): SpreadsheetCellValue | CellErrorType {
    if (!this.hfInstance) return null;

    const sheetIndex = this.sheetMapping.get(sheetId);
    if (sheetIndex === undefined) return null;

    const address: SimpleCellAddress = { sheet: sheetIndex, row, col };
    const value = this.hfInstance.getCellValue(address);

    return this.convertHFValue(value);
  }

  /**
   * Check if a cell contains a formula
   */
  isFormula(sheetId: string, row: number, col: number): boolean {
    if (!this.hfInstance) return false;

    const sheetIndex = this.sheetMapping.get(sheetId);
    if (sheetIndex === undefined) return false;

    const address: SimpleCellAddress = { sheet: sheetIndex, row, col };
    return this.hfInstance.doesCellHaveFormula(address);
  }

  /**
   * Get formula string for a cell
   */
  getCellFormula(sheetId: string, row: number, col: number): string | null {
    if (!this.hfInstance) return null;

    const sheetIndex = this.sheetMapping.get(sheetId);
    if (sheetIndex === undefined) return null;

    const address: SimpleCellAddress = { sheet: sheetIndex, row, col };
    const formula = this.hfInstance.getCellFormula(address);
    return formula ?? null;
  }

  /**
   * Batch update multiple cells
   */
  batchSetCellValues(
    sheetId: string,
    updates: { row: number; col: number; value: SpreadsheetCellValue | string }[]
  ): void {
    if (!this.hfInstance) {
      this.initialize();
      this.addSheet(sheetId);
    }

    let sheetIndex = this.sheetMapping.get(sheetId);
    if (sheetIndex === undefined) {
      sheetIndex = this.addSheet(sheetId);
    }

    // Use batch operations for performance
    this.hfInstance!.batch(() => {
      updates.forEach(update => {
        const address: SimpleCellAddress = { sheet: sheetIndex!, row: update.row, col: update.col };
        this.hfInstance!.setCellContents(address, [[update.value]]);
      });
    });
  }

  /**
   * Parse a formula and extract cell references
   */
  parseFormula(formula: string, _sheetId: string): FormulaParseResult {
    if (!formula.startsWith('=')) {
      return { isValid: false, error: 'Formula must start with =', references: [], ranges: [] };
    }

    const references: CellAddress[] = [];
    const ranges: CellRange[] = [];

    // Simple regex-based parsing for cell references
    // Matches: A1, $A$1, A1:B10, Sheet1!A1
    const cellRefPattern = /(\$?[A-Z]+\$?\d+)(?::(\$?[A-Z]+\$?\d+))?/gi;
    let match;

    while ((match = cellRefPattern.exec(formula)) !== null) {
      const startRef = this.parseCellReference(match[1]);
      if (startRef) {
        if (match[2]) {
          // Range reference (A1:B10)
          const endRef = this.parseCellReference(match[2]);
          if (endRef) {
            ranges.push({ start: startRef, end: endRef });
          }
        } else {
          // Single cell reference
          references.push(startRef);
        }
      }
    }

    // Validate formula syntax using HyperFormula
    if (this.hfInstance) {
      const isValid = this.hfInstance.validateFormula(formula);
      if (!isValid) {
        return { isValid: false, error: 'Invalid formula syntax', references, ranges };
      }
    }

    return { isValid: true, references, ranges };
  }

  /**
   * Get functions matching a search query (for autocompletion)
   */
  searchFunctions(query: string): FormulaFunction[] {
    if (!query) return [];

    const normalizedQuery = query.toUpperCase();
    return this.allFunctions.filter(fn =>
      fn.name.startsWith(normalizedQuery) ||
      fn.description.toUpperCase().includes(normalizedQuery)
    );
  }

  /**
   * Get cell dependencies (which cells this cell depends on)
   */
  getCellDependencies(sheetId: string, row: number, col: number): CellAddress[] {
    if (!this.hfInstance) return [];

    const sheetIndex = this.sheetMapping.get(sheetId);
    if (sheetIndex === undefined) return [];

    const address: SimpleCellAddress = { sheet: sheetIndex, row, col };

    try {
      const precedents = this.hfInstance.getCellPrecedents(address);
      return precedents.map(p => {
        // Handle both SimpleCellAddress and SimpleCellRange
        const addr = this.isSimpleCellRange(p) ? p.start : p;
        return {
          row: addr.row,
          col: addr.col,
          sheet: this.getSheetIdByIndex(addr.sheet),
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Get cells that depend on this cell
   */
  getCellDependents(sheetId: string, row: number, col: number): CellAddress[] {
    if (!this.hfInstance) return [];

    const sheetIndex = this.sheetMapping.get(sheetId);
    if (sheetIndex === undefined) return [];

    const address: SimpleCellAddress = { sheet: sheetIndex, row, col };

    try {
      const dependents = this.hfInstance.getCellDependents(address);
      return dependents.map(d => {
        // Handle both SimpleCellAddress and SimpleCellRange
        const addr = this.isSimpleCellRange(d) ? d.start : d;
        return {
          row: addr.row,
          col: addr.col,
          sheet: this.getSheetIdByIndex(addr.sheet),
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Type guard to check if value is SimpleCellRange
   */
  private isSimpleCellRange(value: SimpleCellAddress | SimpleCellRange): value is SimpleCellRange {
    return 'start' in value && 'end' in value;
  }

  /**
   * Load cells from SpreadsheetCell map into the engine
   */
  loadCells(sheetId: string, cells: Map<string, SpreadsheetCell>): void {
    if (!this.hfInstance) {
      this.initialize();
    }

    // Ensure sheet exists
    let sheetIndex = this.sheetMapping.get(sheetId);
    if (sheetIndex === undefined) {
      sheetIndex = this.addSheet(sheetId);
    }

    // Convert cells map to updates array
    const updates: { row: number; col: number; value: SpreadsheetCellValue | string }[] = [];

    cells.forEach((cell) => {
      // Only load cells for this sheet
      if (cell.sheet_id === sheetId) {
        const value = cell.formula || cell.raw_value;
        if (value !== null && value !== undefined) {
          updates.push({ row: cell.row, col: cell.col, value: value as string | SpreadsheetCellValue });
        }
      }
    });

    // Batch update
    if (updates.length > 0) {
      this.batchSetCellValues(sheetId, updates);
    }
  }

  /**
   * Recalculate all formulas
   */
  recalculate(): Map<string, SpreadsheetCellValue> {
    const results = new Map<string, SpreadsheetCellValue>();

    if (!this.hfInstance) return results;

    // Get all sheets and their computed values
    this.sheetMapping.forEach((sheetIndex, sheetId) => {
      const sheetDimensions = this.hfInstance!.getSheetDimensions(sheetIndex);
      if (!sheetDimensions) return;

      for (let row = 0; row < sheetDimensions.height; row++) {
        for (let col = 0; col < sheetDimensions.width; col++) {
          const address: SimpleCellAddress = { sheet: sheetIndex, row, col };
          if (this.hfInstance!.doesCellHaveFormula(address)) {
            const value = this.hfInstance!.getCellValue(address);
            const key = getCellKey({ row, col, sheet: sheetId });
            results.set(key, this.convertHFValue(value));
          }
        }
      }
    });

    return results;
  }

  /**
   * Recalculate only specific cells (optimized for dirty cell recalculation)
   * Returns computed values for the specified cells and their dependents
   */
  recalculateCells(cells: { sheetId: string; row: number; col: number }[]): Map<string, SpreadsheetCellValue> {
    const results = new Map<string, SpreadsheetCellValue>();

    if (!this.hfInstance || cells.length === 0) return results;

    // Track all cells that need recalculation (including dependents)
    const cellsToRecalculate = new Set<string>();

    // Collect all dirty cells and their dependents
    cells.forEach(({ sheetId, row, col }) => {
      const key = getCellKey({ row, col, sheet: sheetId });
      cellsToRecalculate.add(key);

      // Add all dependents recursively
      this.collectDependents(sheetId, row, col, cellsToRecalculate);
    });

    // Recalculate each cell
    cellsToRecalculate.forEach(key => {
      const [sheetId, rowStr, colStr] = key.split(':');
      const row = parseInt(rowStr, 10);
      const col = parseInt(colStr, 10);

      const sheetIndex = this.sheetMapping.get(sheetId);
      if (sheetIndex === undefined) return;

      const address: SimpleCellAddress = { sheet: sheetIndex, row, col };

      // Only get value for cells with formulas
      if (this.hfInstance!.doesCellHaveFormula(address)) {
        const value = this.hfInstance!.getCellValue(address);
        results.set(key, this.convertHFValue(value));
      }
    });

    return results;
  }

  /**
   * Recursively collect all cells that depend on a given cell
   */
  private collectDependents(
    sheetId: string,
    row: number,
    col: number,
    collected: Set<string>,
    visited = new Set<string>()
  ): void {
    const key = getCellKey({ row, col, sheet: sheetId });

    // Prevent infinite loops in circular references
    if (visited.has(key)) return;
    visited.add(key);

    const dependents = this.getCellDependents(sheetId, row, col);

    dependents.forEach(dep => {
      const depKey = getCellKey({ row: dep.row, col: dep.col, sheet: dep.sheet || sheetId });

      if (!collected.has(depKey)) {
        collected.add(depKey);
        // Recursively collect dependents of this dependent
        this.collectDependents(dep.sheet || sheetId, dep.row, dep.col, collected, visited);
      }
    });
  }

  /**
   * Get the topological order for recalculating a set of cells
   * This ensures cells are calculated in the correct order (dependencies first)
   */
  getTopologicalOrder(cells: { sheetId: string; row: number; col: number }[]): { sheetId: string; row: number; col: number }[] {
    if (!this.hfInstance || cells.length === 0) return [];

    // Build dependency graph
    const graph = new Map<string, Set<string>>();
    const inDegree = new Map<string, number>();

    // Initialize
    cells.forEach(({ sheetId, row, col }) => {
      const key = getCellKey({ row, col, sheet: sheetId });
      if (!graph.has(key)) {
        graph.set(key, new Set());
        inDegree.set(key, 0);
      }
    });

    // Build edges
    cells.forEach(({ sheetId, row, col }) => {
      const key = getCellKey({ row, col, sheet: sheetId });
      const dependencies = this.getCellDependencies(sheetId, row, col);

      dependencies.forEach(dep => {
        const depKey = getCellKey({ row: dep.row, col: dep.col, sheet: dep.sheet || sheetId });

        if (graph.has(depKey)) {
          graph.get(depKey)!.add(key);
          inDegree.set(key, (inDegree.get(key) || 0) + 1);
        }
      });
    });

    // Kahn's algorithm for topological sort
    const result: { sheetId: string; row: number; col: number }[] = [];
    const queue: string[] = [];

    // Start with cells that have no dependencies
    inDegree.forEach((degree, key) => {
      if (degree === 0) {
        queue.push(key);
      }
    });

    while (queue.length > 0) {
      const key = queue.shift()!;
      const [sheetId, rowStr, colStr] = key.split(':');
      result.push({
        sheetId,
        row: parseInt(rowStr, 10),
        col: parseInt(colStr, 10),
      });

      const dependents = graph.get(key);
      if (dependents) {
        dependents.forEach(depKey => {
          const newDegree = (inDegree.get(depKey) || 0) - 1;
          inDegree.set(depKey, newDegree);
          if (newDegree === 0) {
            queue.push(depKey);
          }
        });
      }
    }

    return result;
  }

  // =========================================================================
  // Private Helper Methods
  // =========================================================================

  /**
   * Convert HyperFormula cell value to our type
   */
  private convertHFValue(value: CellValue): SpreadsheetCellValue | CellErrorType {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'object' && 'type' in value) {
      // DetailedCellError
      return this.mapHFError(value as DetailedCellError);
    }

    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
      return value;
    }

    // Fallback: convert to string
    return String(value);
  }

  /**
   * Map HyperFormula error to our error type
   */
  private mapHFError(error: DetailedCellError): CellErrorType {
    const errorType = error.type;
    switch (errorType) {
      case 'VALUE': return '#VALUE!';
      case 'REF': return '#REF!';
      case 'DIV_BY_ZERO': return '#DIV/0!';
      case 'NAME': return '#NAME?';
      case 'NA': return '#N/A';
      case 'NUM': return '#NUM!';
      default: return '#ERROR!';
    }
  }

  /**
   * Parse a cell reference string (e.g., "A1", "$B$2")
   */
  private parseCellReference(ref: string): CellAddress | null {
    const match = ref.match(/^\$?([A-Z]+)\$?(\d+)$/i);
    if (!match) return null;

    const colLetters = match[1].toUpperCase();
    const row = parseInt(match[2], 10) - 1; // 0-indexed

    // Convert column letters to index
    let col = 0;
    for (let i = 0; i < colLetters.length; i++) {
      col = col * 26 + (colLetters.charCodeAt(i) - 64);
    }
    col -= 1; // 0-indexed

    return { row, col };
  }

  /**
   * Get sheet ID by HyperFormula index
   */
  private getSheetIdByIndex(index: number): string | undefined {
    for (const [sheetId, sheetIndex] of this.sheetMapping.entries()) {
      if (sheetIndex === index) {
        return sheetId;
      }
    }
    return undefined;
  }
}
