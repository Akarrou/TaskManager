import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FileDropzoneComponent, FileUploadedEvent } from '../../../../shared/components/file-dropzone/file-dropzone.component';

export interface DocumentUploadDialogData {
  documentId: string;
  mode: 'insert';
}

export interface DocumentUploadDialogResult {
  url: string;
  fileName: string;
  fileType: string;
}

@Component({
  selector: 'app-document-upload-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    FileDropzoneComponent,
  ],
  templateUrl: './document-upload-dialog.component.html',
  styleUrl: './document-upload-dialog.component.scss',
})
export class DocumentUploadDialogComponent {
  private dialogRef = inject(MatDialogRef<DocumentUploadDialogComponent>);
  readonly data = inject<DocumentUploadDialogData>(MAT_DIALOG_DATA);

  uploadedFile = signal<FileUploadedEvent | null>(null);
  uploadError = signal<string | null>(null);

  readonly acceptedTypes = 'application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain';
  readonly maxFileSize = 10485760; // 10MB

  get documentId(): string {
    return this.data.documentId;
  }

  /**
   * Handle successful file upload
   */
  onFileUploaded(event: FileUploadedEvent): void {
    console.log('File uploaded:', event);
    this.uploadedFile.set(event);
    this.uploadError.set(null);
  }

  /**
   * Handle upload error
   */
  onUploadError(error: Error): void {
    console.error('Upload error:', error);
    this.uploadError.set(error.message);
    this.uploadedFile.set(null);
  }

  /**
   * Get Material Icon name based on MIME type
   */
  getFileIcon(mimeType: string): string {
    if (mimeType === 'application/pdf') return 'picture_as_pdf';
    if (mimeType.includes('word')) return 'description';
    if (mimeType.includes('sheet')) return 'table_chart';
    if (mimeType === 'text/plain') return 'article';
    return 'insert_drive_file';
  }

  /**
   * Format file size in human-readable format
   */
  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  /**
   * Cancel dialog
   */
  onCancel(): void {
    this.dialogRef.close();
  }

  /**
   * Confirm and return result
   */
  onConfirm(): void {
    const file = this.uploadedFile();
    if (file) {
      const result: DocumentUploadDialogResult = {
        url: file.url,
        fileName: file.file.name,
        fileType: file.file.type
      };
      this.dialogRef.close(result);
    }
  }
}
