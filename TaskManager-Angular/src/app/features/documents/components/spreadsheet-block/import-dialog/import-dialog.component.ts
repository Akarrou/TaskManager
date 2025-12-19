import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormsModule } from '@angular/forms';

import { SpreadsheetIOService } from '../../../services/spreadsheet-io.service';
import { SpreadsheetImportResult, ImportOptions } from '../../../models/spreadsheet.model';

/**
 * Import Dialog Component
 *
 * Dialog for importing Excel/CSV files into a spreadsheet.
 */
@Component({
  selector: 'app-spreadsheet-import-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    FormsModule,
  ],
  templateUrl: './import-dialog.component.html',
  styleUrl: './import-dialog.component.scss',
})
export class SpreadsheetImportDialogComponent {
  private dialogRef = inject(MatDialogRef<SpreadsheetImportDialogComponent>);
  private ioService = inject(SpreadsheetIOService);

  // State
  readonly selectedFile = signal<File | null>(null);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly isDragging = signal(false);

  // Options
  preserveFormulas = true;
  preserveFormatting = true;

  /**
   * Handle file selection from input
   */
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectFile(input.files[0]);
    }
  }

  /**
   * Handle drag over
   */
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  /**
   * Handle drag leave
   */
  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  /**
   * Handle file drop
   */
  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.selectFile(files[0]);
    }
  }

  /**
   * Select and validate file
   */
  private selectFile(file: File): void {
    this.error.set(null);

    if (!this.ioService.isValidSpreadsheetFile(file)) {
      this.error.set('Format de fichier non supporté. Utilisez .xlsx, .xls, ou .csv');
      return;
    }

    this.selectedFile.set(file);
  }

  /**
   * Clear selected file
   */
  clearFile(): void {
    this.selectedFile.set(null);
    this.error.set(null);
  }

  /**
   * Import the selected file
   */
  async importFile(): Promise<void> {
    const file = this.selectedFile();
    if (!file) return;

    this.isLoading.set(true);
    this.error.set(null);

    try {
      const options: ImportOptions = {
        source: file.name.endsWith('.csv') ? 'csv' : 'xlsx',
        preserveFormulas: this.preserveFormulas,
        preserveFormatting: this.preserveFormatting,
      };

      let result: SpreadsheetImportResult;

      if (file.name.endsWith('.csv')) {
        result = await this.ioService.importFromCSV(file);
      } else {
        result = await this.ioService.importFromExcel(file, options);
      }

      this.dialogRef.close(result);
    } catch (err) {
      console.error('[Import] Error:', err);
      this.error.set(err instanceof Error ? err.message : 'Erreur lors de l\'import');
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Cancel import
   */
  cancel(): void {
    this.dialogRef.close(null);
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
}
