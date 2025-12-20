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
import { MatBadgeModule } from '@angular/material/badge';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import Papa from 'papaparse';

import { DatabaseService } from '../../services/database.service';
import { CsvTypeDetector } from '../../utils/csv-type-detector';
import {
  CsvImportDialogData,
  CsvImportResult,
  CsvImportPreview,
  DetectedColumn,
} from '../../models/csv-import.model';
import { ColumnType, SelectChoice, DatabaseColumn } from '../../models/database.model';

/**
 * Dialog pour importer des données CSV dans une base de données
 * Workflow en 5 étapes avec Material Stepper
 */
@Component({
  selector: 'app-csv-import-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatStepperModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTableModule,
    MatSelectModule,
    MatTooltipModule,
    MatBadgeModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './csv-import-dialog.component.html',
  styleUrl: './csv-import-dialog.component.scss',
})
export class CsvImportDialogComponent {
  // ViewChild pour accéder au stepper
  @ViewChild('stepper') stepper!: MatStepper;

  // Injections
  private dialogRef = inject(MatDialogRef<CsvImportDialogComponent>);
  private data = inject<CsvImportDialogData>(MAT_DIALOG_DATA);
  private databaseService = inject(DatabaseService);

  // Data du dialog
  databaseId = this.data.databaseId;
  tableName = this.data.tableName;

  // State signals
  selectedFile = signal<File | null>(null);
  parsedData = signal<string[][] | null>(null);
  preview = signal<CsvImportPreview | null>(null);
  detectedColumns = signal<DetectedColumn[]>([]);
  isParsingFile = signal(false);
  isImporting = signal(false);
  importProgress = signal(0);
  importStatus = signal('');
  importResult = signal<CsvImportResult | null>(null);
  currentStep = signal(0);

  // Computed
  fileName = computed(() => {
    const file = this.selectedFile();
    return file?.name || '';
  });
  fileSize = computed(() => {
    const file = this.selectedFile();
    const size = file?.size || 0;

    // Afficher en KB si < 1 MB, sinon en MB
    if (size < 1024 * 1024) {
      const sizeInKB = (size / 1024).toFixed(2);
      return `${sizeInKB} KB`;
    } else {
      const sizeInMB = (size / 1024 / 1024).toFixed(2);
      return `${sizeInMB} MB`;
    }
  });
  columnDisplayNames = computed(() =>
    this.detectedColumns().map((_, i) => 'col' + i)
  );

  columnTypes: ColumnType[] = [
    'text',
    'number',
    'date',
    'checkbox',
    'select',
    'multi-select',
    'url',
    'email',
  ];

  // Constants
  MAX_FILE_SIZE_MB = 10;
  MAX_ROWS = 10000;

  // Debug helper
  typeof = (val: any) => typeof val;

  /**
   * Navigation methods for stepper
   */
  goToNextStep(): void {
    this.stepper.next();
  }

  goToPreviousStep(): void {
    this.stepper.previous();
  }

  /**
   * Step 1: Upload fichier CSV
   */
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const file = input.files[0];
    this.validateAndSetFile(file);
  }

  /**
   * Drag & Drop: Prevent default behavior
   */
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  /**
   * Drag & Drop: Handle drag leave
   */
  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  /**
   * Drag & Drop: Handle file drop
   */
  onFileDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();

    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    this.validateAndSetFile(file);
  }

  /**
   * Validate and set the selected file
   */
  private validateAndSetFile(file: File): void {
    // Validation
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
   * Step 2: Parser le CSV et détecter les types
   */
  parseAndDetectTypes(): void {
    const file = this.selectedFile();
    if (!file) return;

    this.isParsingFile.set(true);

    Papa.parse<string[]>(file, {
      complete: result => {
        // Validation
        if (result.errors.length > 0) {
          alert('Erreur lors du parsing du CSV: ' + result.errors[0].message);
          this.isParsingFile.set(false);
          return;
        }

        const data = result.data.filter(row =>
          row.some(cell => cell.trim() !== '')
        ); // Enlever lignes vides

        if (data.length === 0) {
          alert('Le fichier CSV est vide.');
          this.isParsingFile.set(false);
          return;
        }

        if (data.length > this.MAX_ROWS + 1) {
          alert(
            `Le fichier contient trop de lignes (max ${this.MAX_ROWS}). Veuillez diviser le fichier.`
          );
          this.isParsingFile.set(false);
          return;
        }

        // Première ligne = headers
        const headers = data[0];
        const rows = data.slice(1);

        // Détecter types pour chaque colonne
        const detectedColumns: DetectedColumn[] = headers.map(
          (header, colIndex) => {
            const columnValues = rows.map(row => row[colIndex] || '');
            const detection = CsvTypeDetector.detectColumnType(columnValues);

            return {
              name: header || `Colonne ${colIndex + 1}`,
              type: detection.type,
              confidence: detection.confidence,
              options: detection.options,
            };
          }
        );

        // Normaliser noms de colonnes (éviter doublons)
        const existingNames: string[] = [];
        detectedColumns.forEach(col => {
          col.name = CsvTypeDetector.normalizeColumnName(
            col.name,
            existingNames
          );
          existingNames.push(col.name);
        });

        // Construire preview
        const preview: CsvImportPreview = {
          headers: detectedColumns.map(c => c.name),
          detectedTypes: detectedColumns.map(c => ({
            type: c.type,
            confidence: c.confidence,
            options: c.options,
          })),
          sampleData: rows.slice(0, 10), // 10 premières lignes
          totalRows: rows.length,
          warnings: this.buildWarnings(detectedColumns),
        };

        this.parsedData.set(data);
        this.detectedColumns.set(detectedColumns);
        this.preview.set(preview);
        this.isParsingFile.set(false);
      },
      error: error => {
        alert('Erreur lors de la lecture du fichier: ' + error.message);
        this.isParsingFile.set(false);
      },
    });
  }

  /**
   * Construit la liste des warnings
   */
  private buildWarnings(columns: DetectedColumn[]): string[] {
    const warnings: string[] = [];

    // Vérifier colonnes avec faible confiance
    columns.forEach(col => {
      if (col.confidence < 0.7) {
        warnings.push(
          `⚠ Colonne "${col.name}" : type "${col.type}" détecté avec faible confiance (${Math.round(col.confidence * 100)}%)`
        );
      }
    });

    return warnings;
  }

  /**
   * Override manuel du type d'une colonne
   */
  onColumnTypeChange(columnIndex: number, newType: ColumnType): void {
    const columns = this.detectedColumns();
    if (columns[columnIndex]) {
      columns[columnIndex].type = newType;
      this.detectedColumns.set([...columns]);
    }
  }

  /**
   * Step 4: Lancer l'import
   */
  async startImport(): Promise<void> {
    const data = this.parsedData();
    const columns = this.detectedColumns();

    if (!data || !columns.length) return;

    this.isImporting.set(true);
    this.importProgress.set(0);

    try {
      // Étape 0: S'assurer que la table PostgreSQL existe (lazy creation)
      this.importStatus.set('Création de la table...');

      await new Promise<void>((resolve, reject) => {
        this.databaseService.ensureTableExists(this.databaseId).subscribe({
          next: () => {
            resolve();
          },
          error: err => {
            console.error('[CSV Import] Erreur création table:', err);
            reject(err);
          },
        });
      });

      this.importProgress.set(5);

      // Étape 1: Récupérer metadata et supprimer colonnes existantes
      this.importStatus.set('Suppression des colonnes par défaut...');

      const metadata = await new Promise<any>((resolve, reject) => {
        this.databaseService.getDatabaseMetadata(this.databaseId).subscribe({
          next: meta => resolve(meta),
          error: err => reject(err),
        });
      });

      const existingColumns = metadata.config?.columns || [];

      // Supprimer séquentiellement chaque colonne existante
      for (const col of existingColumns) {
        await new Promise<void>((resolve, reject) => {
          this.databaseService
            .deleteColumn({ databaseId: this.databaseId, columnId: col.id })
            .subscribe({
              next: () => {
                resolve();
              },
              error: err => {
                console.error(
                  '[CSV Import] Erreur suppression colonne:',
                  col.name,
                  err
                );
                // Continue même en cas d'erreur de suppression
                resolve();
              },
            });
        });
      }

      this.importProgress.set(15);

      // Étape 2: Créer les colonnes
      this.importStatus.set('Création des colonnes...');

      // Detect Name column (first text column named "Nom", "Name", "Title", "Titre", or first text column)
      const nameColumnNames = ['nom', 'name', 'title', 'titre'];
      let nameColumnIndex = columns.findIndex(c =>
        c.type === 'text' && nameColumnNames.includes(c.name.toLowerCase())
      );
      // If no explicit name column, use first text column
      if (nameColumnIndex === -1) {
        nameColumnIndex = columns.findIndex(c => c.type === 'text');
      }

      const createdColumns = await new Promise<DatabaseColumn[]>((resolve, reject) => {
        this.databaseService
          .createColumnsFromCsv(
            this.databaseId,
            columns.map((c, index) => ({
              name: c.name,
              type: c.type,
              options: c.options,
              isNameColumn: index === nameColumnIndex, // Mark as Name column
            }))
          )
          .subscribe({
            next: cols => resolve(cols),
            error: err => reject(err),
          });
      });

      this.importProgress.set(30);

      // Étape 3: Préparer les lignes
      const headers = data[0];
      const rows = data.slice(1);

      const formattedRows = rows.map(row => {
        const cells: Record<string, any> = {};
        row.forEach((value, index) => {
          const col = columns[index];
          if (col) {
            const columnId = (createdColumns as any)[index].id;
            cells[columnId] = this.formatCellValue(value, col.type, col.options);
          }
        });
        return cells;
      });

      // Étape 4: Importer les lignes avec documents associés
      this.importStatus.set('Importation des lignes...');

      const result = await new Promise<CsvImportResult>((resolve, reject) => {
        this.databaseService
          .importRowsWithDocuments(
            this.databaseId,
            formattedRows,
            undefined, // No projectId for generic database imports
            (current, total) => {
              const progress = 30 + Math.floor((current / total) * 65);
              this.importProgress.set(progress);
              this.importStatus.set(
                `Importation... ${current}/${total} lignes`
              );
            }
          )
          .subscribe({
            next: res => {
              res.columnsCreated = columns.length;
              resolve(res);
            },
            error: err => reject(err),
          });
      });

      this.importProgress.set(100);
      this.importStatus.set('Import terminé !');
      this.importResult.set(result);
    } catch (error: any) {
      alert('Erreur lors de l\'import: ' + error.message);
      this.isImporting.set(false);
    }
  }

  /**
   * Formate une valeur de cellule selon son type
   */
  private formatCellValue(
    value: string,
    type: ColumnType,
    options?: { choices?: SelectChoice[] }
  ): any {
    if (!value || value.trim() === '') return null;

    switch (type) {
      case 'number':
        const num = parseFloat(value.replace(/,/g, '.'));
        return isNaN(num) ? null : num;
      case 'checkbox':
        const lower = value.toLowerCase().trim();
        return ['true', '1', 'yes', 'oui', 'vrai', 'x'].includes(lower);
      case 'date':
        // Retourner en format ISO
        const date = new Date(value);
        return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
      case 'select':
        // Mapper le label CSV vers le choice.id
        if (!options?.choices) return null;
        const trimmedValue = value.trim();
        const choice = options.choices.find(
          c => c.label.toLowerCase() === trimmedValue.toLowerCase()
        );
        return choice ? choice.id : null;
      case 'multi-select':
        // Détecter délimiteur et split, puis mapper vers choice.id
        if (!options?.choices) return null;
        const delimiters = [',', ';', '|'];
        let labels: string[] = [];

        for (const delim of delimiters) {
          if (value.includes(delim)) {
            labels = value
              .split(delim)
              .map(v => v.trim())
              .filter(v => v);
            break;
          }
        }

        if (labels.length === 0) {
          labels = [value.trim()];
        }

        // Mapper chaque label vers son choice.id
        const choiceIds = labels
          .map(label => {
            const choice = options.choices!.find(
              c => c.label.toLowerCase() === label.toLowerCase()
            );
            return choice ? choice.id : null;
          })
          .filter(id => id !== null);

        return choiceIds.length > 0 ? choiceIds : null;
      default:
        return value;
    }
  }

  /**
   * Fermer le dialog avec résultat
   */
  close(): void {
    this.dialogRef.close(this.importResult());
  }

  /**
   * Télécharger le log d'erreurs en CSV
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
   * Obtenir icône de confiance
   */
  getConfidenceIcon(confidence: number): string {
    if (confidence >= 0.9) return 'check_circle';
    if (confidence >= 0.7) return 'warning';
    return 'error';
  }

  /**
   * Obtenir couleur de confiance
   */
  getConfidenceColor(confidence: number): string {
    if (confidence >= 0.9) return 'text-green-600';
    if (confidence >= 0.7) return 'text-orange-600';
    return 'text-red-600';
  }
}
