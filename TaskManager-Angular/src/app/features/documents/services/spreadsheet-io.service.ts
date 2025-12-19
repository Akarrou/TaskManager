import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';
import {
  SpreadsheetConfig,
  SpreadsheetCell,
  SpreadsheetSheet,
  CellFormat,
  SpreadsheetImportResult,
  ExportOptions,
  ImportOptions,
  createDefaultSpreadsheetConfig,
  DEFAULT_SHEET_CONFIG,
  SpreadsheetCellValue,
} from '../models/spreadsheet.model';

/**
 * SpreadsheetIOService
 *
 * Service for importing and exporting spreadsheets to/from various formats.
 * Supports Excel (.xlsx, .xls) and CSV files.
 */
@Injectable({
  providedIn: 'root',
})
export class SpreadsheetIOService {

  // =====================================================================
  // Excel Export
  // =====================================================================

  /**
   * Export spreadsheet to Excel file
   */
  exportToExcel(
    config: SpreadsheetConfig,
    cellsMap: Map<string, SpreadsheetCell>,
    options: ExportOptions = { target: 'xlsx' }
  ): Blob {
    const workbook = XLSX.utils.book_new();

    // Export each sheet
    config.sheets.forEach(sheet => {
      const sheetData = this.buildSheetData(sheet, cellsMap, options.includeFormulas);
      const worksheet = XLSX.utils.aoa_to_sheet(sheetData.data);

      // Apply column widths
      if (Object.keys(sheet.columnWidths).length > 0) {
        worksheet['!cols'] = this.buildColumnWidths(sheet);
      }

      // Apply row heights
      if (Object.keys(sheet.rowHeights).length > 0) {
        worksheet['!rows'] = this.buildRowHeights(sheet);
      }

      // Apply cell styles if formatting is enabled
      if (options.includeFormatting) {
        this.applyCellStyles(worksheet, sheet, cellsMap);
      }

      XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
    });

    // Generate file
    const excelBuffer = XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'array',
    });

    return new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  /**
   * Download Excel file to user's device
   */
  downloadExcel(
    config: SpreadsheetConfig,
    cellsMap: Map<string, SpreadsheetCell>,
    fileName: string = 'spreadsheet.xlsx',
    options: ExportOptions = { target: 'xlsx' }
  ): void {
    const blob = this.exportToExcel(config, cellsMap, options);
    this.downloadBlob(blob, fileName);
  }

  /**
   * Export spreadsheet to CSV
   */
  exportToCSV(
    sheetId: string,
    cellsMap: Map<string, SpreadsheetCell>,
    config: SpreadsheetConfig
  ): string {
    const sheet = config.sheets.find(s => s.id === sheetId);
    if (!sheet) return '';

    const sheetData = this.buildSheetData(sheet, cellsMap, false);
    const worksheet = XLSX.utils.aoa_to_sheet(sheetData.data);
    return XLSX.utils.sheet_to_csv(worksheet);
  }

  /**
   * Download CSV file
   */
  downloadCSV(
    sheetId: string,
    cellsMap: Map<string, SpreadsheetCell>,
    config: SpreadsheetConfig,
    fileName: string = 'sheet.csv'
  ): void {
    const csv = this.exportToCSV(sheetId, cellsMap, config);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    this.downloadBlob(blob, fileName);
  }

  // =====================================================================
  // Excel Import
  // =====================================================================

  /**
   * Import from Excel file
   */
  async importFromExcel(
    file: File,
    options: ImportOptions = { source: 'xlsx' }
  ): Promise<SpreadsheetImportResult> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array', cellFormula: options.preserveFormulas });

          const result = this.parseWorkbook(workbook, options);
          resolve(result);
        } catch (error) {
          reject(new Error(`Failed to parse Excel file: ${error}`));
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Import from CSV file
   */
  async importFromCSV(file: File): Promise<SpreadsheetImportResult> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const csvData = e.target?.result as string;
          const workbook = XLSX.read(csvData, { type: 'string' });

          const result = this.parseWorkbook(workbook, { source: 'csv' });
          resolve(result);
        } catch (error) {
          reject(new Error(`Failed to parse CSV file: ${error}`));
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  // =====================================================================
  // Private Helpers - Export
  // =====================================================================

  /**
   * Build 2D array data for a sheet
   */
  private buildSheetData(
    sheet: SpreadsheetSheet,
    cellsMap: Map<string, SpreadsheetCell>,
    includeFormulas = true
  ): { data: (string | number | boolean | null)[][]; maxRow: number; maxCol: number } {
    let maxRow = 0;
    let maxCol = 0;

    // Find bounds
    cellsMap.forEach((cell, key) => {
      if (!key.startsWith(sheet.id + ':')) return;
      maxRow = Math.max(maxRow, cell.row);
      maxCol = Math.max(maxCol, cell.col);
    });

    // Build 2D array
    const data: (string | number | boolean | null)[][] = [];

    for (let row = 0; row <= maxRow; row++) {
      const rowData: (string | number | boolean | null)[] = [];

      for (let col = 0; col <= maxCol; col++) {
        const key = `${sheet.id}:${row}:${col}`;
        const cell = cellsMap.get(key);

        if (cell) {
          if (includeFormulas && cell.formula) {
            rowData.push(cell.formula);
          } else if (cell.computed_value !== undefined && cell.computed_value !== null) {
            rowData.push(cell.computed_value as string | number | boolean);
          } else {
            rowData.push(cell.raw_value as string | number | boolean | null);
          }
        } else {
          rowData.push(null);
        }
      }

      data.push(rowData);
    }

    return { data, maxRow, maxCol };
  }

  /**
   * Build column widths for Excel
   */
  private buildColumnWidths(sheet: SpreadsheetSheet): XLSX.ColInfo[] {
    const cols: XLSX.ColInfo[] = [];
    const defaultWidth = (sheet.defaultColWidth || 100) / 7; // Excel uses character width units

    Object.entries(sheet.columnWidths).forEach(([col, width]) => {
      const colIndex = parseInt(col, 10);
      while (cols.length <= colIndex) {
        cols.push({ wch: defaultWidth });
      }
      cols[colIndex] = { wch: width / 7 };
    });

    return cols;
  }

  /**
   * Build row heights for Excel
   */
  private buildRowHeights(sheet: SpreadsheetSheet): XLSX.RowInfo[] {
    const rows: XLSX.RowInfo[] = [];
    const defaultHeight = sheet.defaultRowHeight || 24;

    Object.entries(sheet.rowHeights).forEach(([row, height]) => {
      const rowIndex = parseInt(row, 10);
      while (rows.length <= rowIndex) {
        rows.push({ hpt: defaultHeight });
      }
      rows[rowIndex] = { hpt: height };
    });

    return rows;
  }

  /**
   * Apply cell styles (colors, fonts, etc.)
   * Note: SheetJS community edition has limited style support
   */
  private applyCellStyles(
    worksheet: XLSX.WorkSheet,
    sheet: SpreadsheetSheet,
    cellsMap: Map<string, SpreadsheetCell>
  ): void {
    // SheetJS community version doesn't support full styling
    // For full style support, you'd need SheetJS Pro or use another library
    // This is a placeholder for when style support is available
    cellsMap.forEach((cell, key) => {
      if (!key.startsWith(sheet.id + ':')) return;
      if (!cell.format) return;

      const cellRef = XLSX.utils.encode_cell({ r: cell.row, c: cell.col });
      const wsCell = worksheet[cellRef];

      if (wsCell && cell.format) {
        // Basic number format
        if (cell.format.numberFormat) {
          wsCell.z = this.getExcelNumberFormat(cell.format.numberFormat);
        }
      }
    });
  }

  /**
   * Convert our number format to Excel format
   */
  private getExcelNumberFormat(format: string): string {
    const formats: Record<string, string> = {
      'general': 'General',
      'number': '#,##0.00',
      'currency': '€#,##0.00',
      'percentage': '0.00%',
      'scientific': '0.00E+00',
      'date-short': 'DD/MM/YYYY',
      'date-long': 'DD MMMM YYYY',
      'time': 'HH:MM:SS',
      'datetime': 'DD/MM/YYYY HH:MM',
      'text': '@',
    };
    return formats[format] || 'General';
  }

  // =====================================================================
  // Private Helpers - Import
  // =====================================================================

  /**
   * Parse Excel workbook to our format
   */
  private parseWorkbook(
    workbook: XLSX.WorkBook,
    options: ImportOptions
  ): SpreadsheetImportResult {
    const config = createDefaultSpreadsheetConfig();
    const sheets: Record<string, SpreadsheetCell[]> = {};
    const warnings: string[] = [];

    // Clear default sheet
    config.sheets = [];

    // Process each sheet
    workbook.SheetNames.forEach((sheetName, index) => {
      const worksheet = workbook.Sheets[sheetName];
      const sheetId = crypto.randomUUID();

      // Create sheet config
      const sheetConfig: SpreadsheetSheet = {
        id: sheetId,
        name: sheetName,
        order: index,
        ...DEFAULT_SHEET_CONFIG,
      };

      // Parse column widths
      if (worksheet['!cols']) {
        worksheet['!cols'].forEach((col, colIndex) => {
          if (col?.wch) {
            sheetConfig.columnWidths[colIndex] = col.wch * 7;
          }
        });
      }

      // Parse row heights
      if (worksheet['!rows']) {
        worksheet['!rows'].forEach((row, rowIndex) => {
          if (row?.hpt) {
            sheetConfig.rowHeights[rowIndex] = row.hpt;
          }
        });
      }

      config.sheets.push(sheetConfig);

      // Parse cells
      const cells = this.parseWorksheet(worksheet, sheetId, options);
      sheets[sheetId] = cells;

      if (cells.length === 0) {
        warnings.push(`Sheet "${sheetName}" is empty`);
      }
    });

    // Set active sheet to first
    if (config.sheets.length > 0) {
      config.activeSheetId = config.sheets[0].id;
    }

    return { config, sheets, warnings };
  }

  /**
   * Parse worksheet cells
   */
  private parseWorksheet(
    worksheet: XLSX.WorkSheet,
    sheetId: string,
    options: ImportOptions
  ): SpreadsheetCell[] {
    const cells: SpreadsheetCell[] = [];
    const range = worksheet['!ref'];

    if (!range) return cells;

    const parsedRange = XLSX.utils.decode_range(range);

    for (let row = parsedRange.s.r; row <= parsedRange.e.r; row++) {
      for (let col = parsedRange.s.c; col <= parsedRange.e.c; col++) {
        const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
        const wsCell = worksheet[cellRef];

        if (wsCell) {
          const cell = this.parseCell(wsCell, sheetId, row, col, options);
          if (cell) {
            cells.push(cell);
          }
        }
      }
    }

    return cells;
  }

  /**
   * Parse individual cell
   */
  private parseCell(
    wsCell: XLSX.CellObject,
    sheetId: string,
    row: number,
    col: number,
    options: ImportOptions
  ): SpreadsheetCell | null {
    // Skip empty cells
    if (wsCell.v === undefined && !wsCell.f) return null;

    let rawValue: SpreadsheetCellValue = null;
    let formula: string | undefined;
    let format: CellFormat | undefined;

    // Handle formula
    if (options.preserveFormulas && wsCell.f) {
      formula = '=' + wsCell.f;
    }

    // Handle value
    switch (wsCell.t) {
      case 'n': // Number
        rawValue = wsCell.v as number;
        break;
      case 's': // String
        rawValue = wsCell.v as string;
        break;
      case 'b': // Boolean
        rawValue = wsCell.v as boolean;
        break;
      case 'd': // Date
        rawValue = wsCell.v as Date;
        break;
      case 'e': // Error
        rawValue = wsCell.w || '#ERROR!';
        break;
      default:
        rawValue = wsCell.v?.toString() || null;
    }

    // Handle format
    if (options.preserveFormatting && wsCell.z) {
      // wsCell.z can be string or number in SheetJS
      const formatStr = typeof wsCell.z === 'string' ? wsCell.z : String(wsCell.z);
      format = this.parseExcelFormat(formatStr);
    }

    return {
      id: crypto.randomUUID(),
      spreadsheet_id: '',
      sheet_id: sheetId,
      row,
      col,
      raw_value: formula ? null : rawValue,
      formula,
      computed_value: rawValue,
      format,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Parse Excel format to our format
   */
  private parseExcelFormat(excelFormat: string): CellFormat | undefined {
    // Basic format detection
    if (excelFormat.includes('%')) {
      return { numberFormat: 'percentage' };
    }
    if (excelFormat.includes('€') || excelFormat.includes('$')) {
      return { numberFormat: 'currency' };
    }
    if (excelFormat.includes('E+') || excelFormat.includes('E-')) {
      return { numberFormat: 'scientific' };
    }
    if (excelFormat.includes('DD') || excelFormat.includes('MM') || excelFormat.includes('YYYY')) {
      return { numberFormat: 'date-short' };
    }
    if (excelFormat.includes('HH') || excelFormat.includes('SS')) {
      return { numberFormat: 'time' };
    }
    if (excelFormat.includes('#,##0')) {
      return { numberFormat: 'number' };
    }

    return undefined;
  }

  // =====================================================================
  // Utility Methods
  // =====================================================================

  /**
   * Download blob as file
   */
  private downloadBlob(blob: Blob, fileName: string): void {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }

  /**
   * Get supported import formats
   */
  getSupportedImportFormats(): string[] {
    return ['.xlsx', '.xls', '.csv', '.ods'];
  }

  /**
   * Get supported export formats
   */
  getSupportedExportFormats(): string[] {
    return ['xlsx', 'csv'];
  }

  /**
   * Check if file is a valid spreadsheet file
   */
  isValidSpreadsheetFile(file: File): boolean {
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/vnd.oasis.opendocument.spreadsheet',
    ];

    const validExtensions = ['.xlsx', '.xls', '.csv', '.ods'];
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();

    return validTypes.includes(file.type) || validExtensions.includes(extension);
  }
}
