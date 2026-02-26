import { Component, inject, signal, computed, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  MAT_DIALOG_DATA,
  MatDialogRef,
  MatDialogModule,
} from '@angular/material/dialog';
import { MatStepperModule, MatStepper } from '@angular/material/stepper';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import Papa from 'papaparse';

import { DatabaseService } from '../../../documents/services/database.service';
import { TaskDatabaseService } from '../../../../core/services/task-database.service';
import {
  DocumentDatabase,
  DatabaseColumn,
  CellValue,
  createTaskDatabaseConfig,
  createTaskDatabaseTemplateColumns,
} from '../../../documents/models/database.model';
import {
  TaskCsvImportDialogData,
  TaskCsvImportResult,
  TaskCsvImportError,
  CsvColumnMapping,
  CsvPreviewData,
  NewColumnType,
  COLUMN_TYPE_LABELS,
  SelectOptionPreview,
  SELECT_OPTION_COLORS,
  findBestColumnMatch,
  normalizeStatus,
  normalizePriority,
  normalizeType,
  parseDate,
  parseTags,
  parseNumber,
} from '../../models/task-csv-import.model';

/**
 * Dialog pour importer des tâches depuis un fichier CSV
 * Workflow en 5 étapes avec Material Stepper
 */
@Component({
  selector: 'app-task-csv-import-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatStepperModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTableModule,
    MatSelectModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './task-csv-import-dialog.component.html',
  styleUrl: './task-csv-import-dialog.component.scss',
})
export class TaskCsvImportDialogComponent {
  @ViewChild('stepper') stepper!: MatStepper;

  private dialogRef = inject(MatDialogRef<TaskCsvImportDialogComponent>);
  private data = inject<TaskCsvImportDialogData>(MAT_DIALOG_DATA);
  private databaseService = inject(DatabaseService);
  private taskDatabaseService = inject(TaskDatabaseService);

  // Step 1: Database selection OR creation
  taskDatabases = signal<DocumentDatabase[]>([]);
  selectedDatabaseId = signal<string | null>(null);
  selectedDatabase = computed(() => {
    const id = this.selectedDatabaseId();
    return this.taskDatabases().find(db => db.database_id === id) || null;
  });
  isLoadingDatabases = signal(true);

  // New database creation mode
  createNewDatabase = signal(false);
  newDatabaseName = signal('Tâches importées');
  isCreatingDatabase = signal(false);

  // Step 2: File upload
  selectedFile = signal<File | null>(null);
  parsedData = signal<string[][] | null>(null);

  // Step 3: Mapping
  preview = signal<CsvPreviewData | null>(null);
  columnMappings = signal<CsvColumnMapping[]>([]);
  targetColumns = signal<DatabaseColumn[]>([]);
  isParsingFile = signal(false);

  // Step 4: Import
  isImporting = signal(false);
  importProgress = signal(0);
  importStatus = signal('');

  // Step 5: Result
  importResult = signal<TaskCsvImportResult | null>(null);

  currentStep = signal(0);

  // Computed
  fileName = computed(() => this.selectedFile()?.name || '');
  fileSize = computed(() => {
    const size = this.selectedFile()?.size || 0;
    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(2)} KB`;
    }
    return `${(size / 1024 / 1024).toFixed(2)} MB`;
  });

  columnDisplayNames = computed(() =>
    this.columnMappings().map((_, i) => 'col' + i)
  );

  // Constants
  MAX_FILE_SIZE_MB = 10;
  MAX_ROWS = 10000;

  // Column type options for new column creation
  columnTypeOptions: { value: NewColumnType; label: string }[] = Object.entries(COLUMN_TYPE_LABELS).map(
    ([value, label]) => ({ value: value as NewColumnType, label })
  );

  // Available colors for select options
  selectOptionColors = SELECT_OPTION_COLORS;

  // Preselected database mode (when opened from document-database-table)
  isPreselectedMode = signal(false);

  constructor() {
    this.loadTaskDatabases();
  }

  /**
   * Load all task-type databases
   */
  private loadTaskDatabases(): void {
    this.taskDatabaseService.getAllTaskDatabases().subscribe({
      next: (databases) => {
        this.taskDatabases.set(databases);
        this.isLoadingDatabases.set(false);

        // If a preselected database ID was provided, select it automatically
        const preselectedId = this.data?.preselectedDatabaseId;
        if (preselectedId) {
          const preselectedDb = databases.find(db => db.database_id === preselectedId);
          if (preselectedDb) {
            this.isPreselectedMode.set(true);
            this.onDatabaseSelect(preselectedId);
            // Auto-advance to step 2 (file upload)
            setTimeout(() => this.goToNextStep(), 100);
          }
        }
      },
      error: (err) => {
        console.error('[TaskCsvImport] Error loading databases:', err);
        this.isLoadingDatabases.set(false);
      },
    });
  }

  /**
   * Navigation
   */
  goToNextStep(): void {
    this.stepper.next();
  }

  goToPreviousStep(): void {
    this.stepper.previous();
  }

  /**
   * Step 1: Select database
   */
  onDatabaseSelect(databaseId: string): void {
    this.createNewDatabase.set(false);
    this.selectedDatabaseId.set(databaseId);

    // Load columns for selected database
    const db = this.taskDatabases().find(d => d.database_id === databaseId);
    if (db) {
      this.targetColumns.set(db.config.columns || []);
    }
  }

  /**
   * Toggle create new database mode
   */
  toggleCreateNewDatabase(): void {
    const isCreating = !this.createNewDatabase();
    this.createNewDatabase.set(isCreating);

    if (isCreating) {
      // Clear selection and use template columns for mapping
      this.selectedDatabaseId.set(null);
      this.targetColumns.set(createTaskDatabaseTemplateColumns());
    } else {
      this.targetColumns.set([]);
    }
  }

  /**
   * Check if step 1 is complete (either selected DB or creating new)
   */
  isStep1Complete(): boolean {
    return this.selectedDatabaseId() !== null ||
           (this.createNewDatabase() && this.newDatabaseName().trim().length > 0);
  }

  /**
   * Step 2: File upload
   */
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.validateAndSetFile(input.files[0]);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  onFileDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();

    const files = event.dataTransfer?.files;
    if (files?.length) {
      this.validateAndSetFile(files[0]);
    }
  }

  private validateAndSetFile(file: File): void {
    if (!file.name.endsWith('.csv')) {
      alert('Seuls les fichiers CSV sont acceptés.');
      return;
    }

    if (file.size > this.MAX_FILE_SIZE_MB * 1024 * 1024) {
      alert(`Le fichier ne doit pas dépasser ${this.MAX_FILE_SIZE_MB} MB.`);
      return;
    }

    this.selectedFile.set(file);
  }

  /**
   * Step 3: Parse and create mappings
   */
  parseAndCreateMappings(): void {
    const file = this.selectedFile();
    if (!file) return;

    this.isParsingFile.set(true);

    Papa.parse<string[]>(file, {
      complete: (result) => {
        if (result.errors.length > 0) {
          alert('Erreur lors du parsing du CSV: ' + result.errors[0].message);
          this.isParsingFile.set(false);
          return;
        }

        const data = result.data.filter(row =>
          row.some(cell => cell.trim() !== '')
        );

        if (data.length === 0) {
          alert('Le fichier CSV est vide.');
          this.isParsingFile.set(false);
          return;
        }

        if (data.length > this.MAX_ROWS + 1) {
          alert(`Le fichier contient trop de lignes (max ${this.MAX_ROWS}).`);
          this.isParsingFile.set(false);
          return;
        }

        const headers = data[0];
        const rows = data.slice(1);

        // Create preview
        this.preview.set({
          headers,
          sampleRows: rows.slice(0, 5),
          totalRows: rows.length,
        });

        this.parsedData.set(data);

        // Create column mappings with auto-detection
        const targetCols = this.targetColumns();
        const mappings: CsvColumnMapping[] = headers.map((header, index) => {
          const match = findBestColumnMatch(
            header,
            targetCols.map(c => ({ id: c.id, name: c.name }))
          );

          return {
            csvColumnIndex: index,
            csvColumnName: header,
            targetColumnId: match.columnId,
            targetColumnName: match.columnName,
            confidence: match.confidence,
          };
        });

        this.columnMappings.set(mappings);
        this.isParsingFile.set(false);
      },
      error: (error) => {
        alert('Erreur lors de la lecture du fichier: ' + error.message);
        this.isParsingFile.set(false);
      },
    });
  }

  /**
   * Update column mapping
   */
  onMappingChange(csvColumnIndex: number, targetColumnId: string | null): void {
    const mappings = [...this.columnMappings()];
    const mapping = mappings.find(m => m.csvColumnIndex === csvColumnIndex);
    if (mapping) {
      if (targetColumnId === 'none') {
        mapping.targetColumnId = null;
        mapping.targetColumnName = null;
        mapping.confidence = 0;
        mapping.createNewColumn = false;
        mapping.newColumnType = undefined;
      } else if (targetColumnId === 'create_new') {
        // Create new column with the CSV column name
        mapping.targetColumnId = null;
        mapping.targetColumnName = mapping.csvColumnName;
        mapping.confidence = 1.0;
        mapping.createNewColumn = true;
        mapping.newColumnType = 'text'; // Default to text
      } else {
        const targetCol = this.targetColumns().find(c => c.id === targetColumnId);
        mapping.targetColumnId = targetColumnId;
        mapping.targetColumnName = targetCol?.name || null;
        mapping.confidence = 1.0; // Manual selection = 100% confidence
        mapping.createNewColumn = false;
        mapping.newColumnType = undefined;
      }
      this.columnMappings.set(mappings);
    }
  }

  /**
   * Update new column type
   */
  onNewColumnTypeChange(csvColumnIndex: number, columnType: NewColumnType): void {
    const mappings = [...this.columnMappings()];
    const mapping = mappings.find(m => m.csvColumnIndex === csvColumnIndex);
    if (mapping) {
      mapping.newColumnType = columnType;

      // If select type, generate options preview from CSV data
      if (columnType === 'select') {
        mapping.selectOptions = this.generateSelectOptionsPreview(csvColumnIndex);
      } else {
        mapping.selectOptions = undefined;
      }

      this.columnMappings.set(mappings);
    }
  }

  /**
   * Generate select options preview from CSV column data
   */
  private generateSelectOptionsPreview(csvColumnIndex: number): SelectOptionPreview[] {
    const data = this.parsedData();
    if (!data || data.length < 2) return [];

    // Extract unique values from CSV column (skip header)
    const values: string[] = data.slice(1).map((row: string[]) => row[csvColumnIndex]);
    const uniqueValues: string[] = [...new Set(
      values
        .filter((v: string) => v && v.trim())
        .map((v: string) => v.trim())
    )];

    // Assign colors in alternating order
    return uniqueValues.map((label: string, index: number) => ({
      label,
      color: SELECT_OPTION_COLORS[index % SELECT_OPTION_COLORS.length].value,
    }));
  }

  /**
   * Update select option color
   */
  onSelectOptionColorChange(csvColumnIndex: number, optionIndex: number, color: string): void {
    const mappings = [...this.columnMappings()];
    const mappingIndex = mappings.findIndex(m => m.csvColumnIndex === csvColumnIndex);
    if (mappingIndex !== -1 && mappings[mappingIndex].selectOptions) {
      // Create a deep copy of the mapping and its selectOptions
      const updatedMapping = { ...mappings[mappingIndex] };
      updatedMapping.selectOptions = [...(updatedMapping.selectOptions || [])];
      updatedMapping.selectOptions[optionIndex] = {
        ...updatedMapping.selectOptions[optionIndex],
        color,
      };
      mappings[mappingIndex] = updatedMapping;
      this.columnMappings.set(mappings);
      console.log(`[CSV Import] Updated option color at index ${optionIndex} to ${color}`, updatedMapping.selectOptions);
    }
  }

  /**
   * Step 4: Start import
   */
  async startImport(): Promise<void> {
    const data = this.parsedData();

    if (!data) return;

    this.isImporting.set(true);
    this.importProgress.set(0);

    let databaseId: string;
    let databaseName: string;

    // Create new database if requested
    if (this.createNewDatabase()) {
      this.importStatus.set('Création de la base de données...');

      try {
        const newDb = await this.createTaskDatabase();
        databaseId = newDb.database_id;
        databaseName = newDb.name;
        this.selectedDatabaseId.set(databaseId);

        // IMPORTANT: Reload actual columns from created database and remap
        await this.reloadColumnsAndRemap(databaseId);
      } catch (error: unknown) {
        const err = error as Error;
        alert('Erreur lors de la création de la base de données: ' + err.message);
        this.isImporting.set(false);
        return;
      }
    } else {
      const existingDb = this.selectedDatabase();
      if (!existingDb) {
        alert('Veuillez sélectionner une base de données.');
        this.isImporting.set(false);
        return;
      }
      databaseId = existingDb.database_id;
      databaseName = existingDb.name;
    }

    // Refresh mappings reference after potential reload
    let currentMappings = this.columnMappings();

    this.importStatus.set('Préparation de l\'import...');

    const _headers = data[0];
    const rows = data.slice(1);
    const errors: TaskCsvImportError[] = [];

    try {
      // Step 1: Create new columns if needed
      const newColumnsToCreate = currentMappings.filter(m => m.createNewColumn);
      if (newColumnsToCreate.length > 0) {
        this.importStatus.set(`Création de ${newColumnsToCreate.length} nouvelle(s) colonne(s)...`);
        this.importProgress.set(5);

        for (const mapping of newColumnsToCreate) {
          try {
            const newColumnId = await this.createNewColumn(
              databaseId,
              mapping.csvColumnName,
              mapping.newColumnType || 'text',
              mapping.selectOptions
            );

            // Update the mapping with the new column ID
            const mappingIndex = currentMappings.findIndex(m => m.csvColumnIndex === mapping.csvColumnIndex);
            if (mappingIndex !== -1) {
              currentMappings = [...currentMappings];
              currentMappings[mappingIndex] = {
                ...currentMappings[mappingIndex],
                targetColumnId: newColumnId,
                createNewColumn: false,
              };
              this.columnMappings.set(currentMappings);
            }

            console.log(`[CSV Import] Created new column "${mapping.csvColumnName}" with ID: ${newColumnId}`);
          } catch (err: unknown) {
            const error = err as Error;
            console.error(`[CSV Import] Failed to create column "${mapping.csvColumnName}":`, error);
            errors.push({
              row: 0,
              column: mapping.csvColumnName,
              message: `Erreur création colonne: ${error.message}`,
            });
          }
        }

        // Reload target columns after creation
        await this.reloadTargetColumns(databaseId);
        // Don't override currentMappings from signal - we already have the updated mappings
        // with the new column IDs set above
        console.log('[CSV Import] After column creation, mappings:', currentMappings.map(m => ({
          csv: m.csvColumnName,
          targetId: m.targetColumnId,
          createNew: m.createNewColumn
        })));
        console.log('[CSV Import] Target columns after reload:', this.targetColumns().map(c => ({ id: c.id, name: c.name })));
      }

      // Step 2: Prepare rows for import
      this.importStatus.set('Validation et formatage des données...');
      this.importProgress.set(10);

      const formattedRows: Record<string, CellValue>[] = [];

      for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];
        const cells: Record<string, CellValue> = {};
        let hasError = false;

        for (const mapping of currentMappings) {
          if (!mapping.targetColumnId) continue;

          const value = row[mapping.csvColumnIndex];
          const targetColumn = this.targetColumns().find(
            c => c.id === mapping.targetColumnId
          );

          if (!targetColumn) continue;

          try {
            const formattedValue = this.formatCellValue(
              value,
              targetColumn
            ) as CellValue;
            cells[mapping.targetColumnId] = formattedValue;
          } catch (err: unknown) {
            const error = err as Error;
            errors.push({
              row: rowIndex + 2, // +2 for header and 0-indexing
              column: mapping.csvColumnName,
              message: error.message,
            });
            hasError = true;
          }
        }

        if (!hasError) {
          formattedRows.push(cells);
        }
      }

      // DEBUG: Log formatted rows
      console.log('[CSV Import] Formatted rows count:', formattedRows.length);
      console.log('[CSV Import] Current mappings:', currentMappings);
      console.log('[CSV Import] Target columns:', this.targetColumns());
      if (formattedRows.length > 0) {
        console.log('[CSV Import] Sample row:', JSON.stringify(formattedRows[0], null, 2));
        console.log('[CSV Import] Sample row keys:', Object.keys(formattedRows[0]));
      }

      if (formattedRows.length === 0) {
        alert('Aucune ligne à importer. Vérifiez le mapping des colonnes.');
        this.isImporting.set(false);
        return;
      }

      this.importProgress.set(30);
      this.importStatus.set('Import des lignes en cours...');

      // Import rows using DatabaseService with document creation for each task
      console.log('[CSV Import] Starting import to database:', databaseId);
      console.log('[CSV Import] Rows to import:', formattedRows.length);

      // Get project ID from database metadata if available
      const projectId = undefined; // Tasks imported via CSV won't have a project initially

      const result = await new Promise<{ rowsImported: number; errors: TaskCsvImportError[] }>(
        (resolve, reject) => {
          this.databaseService
            .importTaskRowsWithDocuments(
              databaseId,
              formattedRows,
              projectId,
              (current, total) => {
                const progress = 30 + Math.floor((current / total) * 65);
                this.importProgress.set(progress);
                this.importStatus.set(`Import... ${current}/${total} tâches`);
                console.log('[CSV Import] Progress:', current, '/', total);
              }
            )
            .subscribe({
              next: (res) => {
                console.log('[CSV Import] Import result:', res);
                resolve({
                  rowsImported: res.rowsImported,
                  errors: [
                    ...errors,
                    ...res.errors.map(e => ({
                      row: e.row,
                      column: e.column,
                      message: e.message,
                    })),
                  ],
                });
              },
              error: (err) => {
                console.error('[CSV Import] Import error:', err);
                reject(err);
              },
            });
        }
      );

      this.importProgress.set(100);
      this.importStatus.set('Import terminé !');
      this.importResult.set({
        rowsImported: result.rowsImported,
        errors: result.errors,
        databaseId,
        databaseName,
      });
    } catch (error: unknown) {
      const err = error as Error;
      alert('Erreur lors de l\'import: ' + err.message);
      this.isImporting.set(false);
    }
  }

  /**
   * Format cell value based on column type
   */
  private formatCellValue(
    value: string,
    column: DatabaseColumn
  ): unknown {
    if (!value || value.trim() === '') return null;

    const columnName = column.name;
    const columnType = column.type;

    // Special handling for task-specific columns
    switch (columnName) {
      case 'Status':
        return normalizeStatus(value);
      case 'Priority':
        return normalizePriority(value);
      case 'Type':
        return normalizeType(value);
      case 'Due Date':
        return parseDate(value);
      case 'Tags':
        return parseTags(value);
      case 'Estimated Hours':
      case 'Actual Hours':
        return parseNumber(value);
    }

    // Handle by column type
    switch (columnType) {
      case 'number':
        return parseNumber(value);
      case 'date':
        return parseDate(value);
      case 'checkbox': {
        const lower = value.toLowerCase().trim();
        return ['true', '1', 'yes', 'oui', 'vrai', 'x'].includes(lower);
      }
      case 'select':
        // For select columns, convert label to choice ID
        if (column.options?.choices) {
          const trimmedValue = value.trim();
          const choice = column.options.choices.find(
            c => c.label.toLowerCase() === trimmedValue.toLowerCase()
          );
          if (choice) {
            return choice.id;
          }
          // If no match found, return null (or could create new choice)
          console.warn(`[formatCellValue] No matching choice found for "${value}" in column "${columnName}"`);
        }
        return null;
      case 'multi-select':
        // For multi-select, convert labels to choice IDs array
        if (column.options?.choices) {
          const labels = value.split(',').map(v => v.trim()).filter(v => v);
          const ids = labels
            .map(label => {
              const choice = column.options?.choices?.find(
                c => c.label.toLowerCase() === label.toLowerCase()
              );
              return choice?.id;
            })
            .filter((id): id is string => id !== undefined);
          return ids;
        }
        return [];
      default:
        return value;
    }
  }

  /**
   * Create a new Task Database
   */
  private async createTaskDatabase(): Promise<{ database_id: string; name: string }> {
    const dbName = this.newDatabaseName().trim() || 'Tâches importées';
    const config = createTaskDatabaseConfig(dbName);

    return new Promise((resolve, reject) => {
      this.databaseService.createStandaloneDatabase(config).subscribe({
        next: (result) => {
          resolve({
            database_id: result.databaseId,
            name: result.name,
          });
        },
        error: (err) => reject(err),
      });
    });
  }

  /**
   * Reload columns from created database and remap CSV columns
   * This is necessary because createTaskDatabaseConfig generates new column IDs
   */
  private async reloadColumnsAndRemap(databaseId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.databaseService.getDatabaseMetadata(databaseId).subscribe({
        next: (metadata) => {
          // Update target columns with actual IDs from created database
          const actualColumns = metadata.config.columns || [];
          this.targetColumns.set(actualColumns);

          // Remap CSV columns to actual column IDs based on column names
          const currentMappings = this.columnMappings();
          const updatedMappings = currentMappings.map(mapping => {
            if (!mapping.targetColumnName) return mapping;

            // Find the actual column with the same name
            const actualColumn = actualColumns.find(
              col => col.name === mapping.targetColumnName
            );

            if (actualColumn) {
              return {
                ...mapping,
                targetColumnId: actualColumn.id,
              };
            }
            return mapping;
          });

          this.columnMappings.set(updatedMappings);
          resolve();
        },
        error: (err) => reject(err),
      });
    });
  }

  /**
   * Create a new column in the database
   * For 'select' type, uses the previewed options with user-selected colors
   */
  private async createNewColumn(
    databaseId: string,
    columnName: string,
    columnType: NewColumnType,
    selectOptions?: SelectOptionPreview[]
  ): Promise<string> {
    const columnId = crypto.randomUUID();

    console.log(`[CSV Import] Creating column "${columnName}" of type "${columnType}"`, {
      selectOptions,
      hasOptions: selectOptions && selectOptions.length > 0,
    });

    // Build column configuration
    const column: DatabaseColumn = {
      id: columnId,
      name: columnName,
      type: columnType,
      order: this.targetColumns().length,
      visible: true,
    };

    // For select type, use the previewed options with colors
    if (columnType === 'select' && selectOptions && selectOptions.length > 0) {
      column.options = {
        choices: selectOptions.map(option => ({
          id: crypto.randomUUID(),
          label: option.label,
          color: option.color,
        })),
      };
      console.log(`[CSV Import] Column options with colors:`, column.options.choices);
    }

    return new Promise((resolve, reject) => {
      this.databaseService.addColumn({
        databaseId,
        column,
      }).subscribe({
        next: () => resolve(columnId),
        error: (err) => reject(err),
      });
    });
  }

  /**
   * Reload target columns from database
   */
  private async reloadTargetColumns(databaseId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.databaseService.getDatabaseMetadata(databaseId).subscribe({
        next: (metadata) => {
          this.targetColumns.set(metadata.config.columns || []);
          resolve();
        },
        error: (err) => reject(err),
      });
    });
  }

  /**
   * Close dialog
   */
  close(): void {
    this.dialogRef.close(this.importResult());
  }

  /**
   * Download error log
   */
  downloadErrorLog(): void {
    const result = this.importResult();
    if (!result?.errors.length) return;

    const csvContent =
      'Ligne,Colonne,Message\n' +
      result.errors
        .map(err => `${err.row},"${err.column || ''}","${err.message}"`)
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'import-errors.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Get confidence icon
   */
  getConfidenceIcon(confidence: number): string {
    if (confidence >= 0.9) return 'check_circle';
    if (confidence >= 0.6) return 'warning';
    if (confidence > 0) return 'help';
    return 'remove_circle';
  }

  /**
   * Get confidence color class
   */
  getConfidenceColor(confidence: number): string {
    if (confidence >= 0.9) return 'text-green-600';
    if (confidence >= 0.6) return 'text-orange-600';
    if (confidence > 0) return 'text-yellow-600';
    return 'text-gray-400';
  }
}
