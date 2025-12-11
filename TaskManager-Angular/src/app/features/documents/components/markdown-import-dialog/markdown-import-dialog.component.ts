/**
 * Markdown Import Dialog Component
 * Allows users to import .md files as TipTap documents
 */

import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms';

import { MarkdownParserService } from '../../services/markdown-parser.service';
import { DocumentService, Document } from '../../services/document.service';
import { convertMarkdownToTipTap } from '../../utils/markdown-to-tiptap-converter';
import { MarkdownFrontMatter } from '../../models/markdown-import.model';
import { JSONContent } from '@tiptap/core';

type ImportStep = 'upload' | 'preview' | 'complete';

@Component({
  selector: 'app-markdown-import-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './markdown-import-dialog.component.html',
  styleUrl: './markdown-import-dialog.component.scss',
})
export class MarkdownImportDialogComponent {
  private dialogRef = inject(MatDialogRef<MarkdownImportDialogComponent>);
  private markdownParser = inject(MarkdownParserService);
  private documentService = inject(DocumentService);

  // State signals
  selectedFile = signal<File | null>(null);
  frontMatter = signal<MarkdownFrontMatter | null>(null);
  rawContent = signal<string>('');
  cleanContent = signal<string>('');
  isProcessing = signal(false);
  errorMessage = signal<string | null>(null);
  currentStep = signal<ImportStep>('upload');
  importedDocument = signal<Document | null>(null);

  // Form controls
  titleControl = new FormControl('', Validators.required);

  // Constants
  readonly MAX_FILE_SIZE_MB = 10;

  /**
   * Handle file selection from input
   */
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const file = input.files[0];
    this.validateAndProcessFile(file);
  }

  /**
   * Handle file drop
   */
  onFileDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();

    const files = event.dataTransfer?.files;
    if (!files?.length) return;

    const file = files[0];
    this.validateAndProcessFile(file);
  }

  /**
   * Prevent default drag behavior
   */
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  /**
   * Validate file and process it
   */
  private validateAndProcessFile(file: File): void {
    this.errorMessage.set(null);

    // Validate file
    const validation = this.markdownParser.validateFile(file, this.MAX_FILE_SIZE_MB);
    if (!validation.valid) {
      this.errorMessage.set(validation.error || 'Fichier invalide');
      return;
    }

    this.selectedFile.set(file);
    this.parseMarkdownFile(file);
  }

  /**
   * Parse Markdown file
   */
  private parseMarkdownFile(file: File): void {
    this.isProcessing.set(true);
    this.errorMessage.set(null);

    this.markdownParser.parseFile(file).subscribe({
      next: (result) => {
        // Validate content is not empty
        if (!this.markdownParser.validateMarkdown(result.cleanContent)) {
          this.errorMessage.set('Le fichier est vide');
          this.isProcessing.set(false);
          return;
        }

        this.frontMatter.set(result.frontMatter);
        this.rawContent.set(result.content);
        this.cleanContent.set(result.cleanContent);

        // Set title from front matter or filename
        const defaultTitle = result.frontMatter.title || file.name.replace('.md', '');
        this.titleControl.setValue(defaultTitle);

        this.currentStep.set('preview');
        this.isProcessing.set(false);
      },
      error: (err) => {
        this.errorMessage.set(`Erreur lors du parsing: ${err.message}`);
        this.isProcessing.set(false);
      }
    });
  }

  /**
   * Import document
   */
  importDocument(): void {
    const file = this.selectedFile();
    const content = this.cleanContent();

    if (!file || !this.titleControl.valid || !content) {
      return;
    }

    this.isProcessing.set(true);
    this.errorMessage.set(null);

    try {
      // Convert Markdown to TipTap JSONContent
      const jsonContent = convertMarkdownToTipTap(content);

      console.log('[Markdown Import] Converted JSONContent:', JSON.stringify(jsonContent, null, 2));

      if (!jsonContent || !jsonContent.type) {
        throw new Error('La conversion Markdown a échoué');
      }

      // Validate no empty text nodes remain
      const hasEmptyTextNodes = this.validateNoEmptyTextNodes(jsonContent);
      if (hasEmptyTextNodes) {
        console.error('[Markdown Import] WARNING: Empty text nodes found in JSONContent');
      }

      // Create document
      this.documentService.createDocument({
        title: this.titleControl.value || 'Sans titre',
        content: jsonContent,
      }).subscribe({
        next: (doc) => {
          this.importedDocument.set(doc);
          this.currentStep.set('complete');
          this.isProcessing.set(false);
        },
        error: (err) => {
          this.errorMessage.set(`Erreur lors de la création du document: ${err.message}`);
          this.isProcessing.set(false);
        }
      });
    } catch (err: unknown) {
      const error = err as Error;
      this.errorMessage.set(`Erreur lors de la conversion: ${error.message}`);
      this.isProcessing.set(false);
    }
  }

  /**
   * Reset to upload step
   */
  resetToUpload(): void {
    this.selectedFile.set(null);
    this.frontMatter.set(null);
    this.rawContent.set('');
    this.cleanContent.set('');
    this.errorMessage.set(null);
    this.currentStep.set('upload');
    this.titleControl.reset();
  }

  /**
   * Close dialog
   */
  close(): void {
    this.dialogRef.close(this.importedDocument());
  }

  /**
   * Cancel and close dialog
   */
  cancel(): void {
    this.dialogRef.close(null);
  }

  /**
   * Validate that JSONContent has no empty text nodes (debugging helper)
   */
  private validateNoEmptyTextNodes(node: JSONContent): boolean {
    if (!node) return false;

    // Check if this is an empty text node
    if (node.type === 'text' && (!node.text || node.text.trim().length === 0)) {
      console.error('[Markdown Import] Found empty text node:', node);
      return true;
    }

    // Recursively check children
    if (node.content && Array.isArray(node.content)) {
      for (const child of node.content) {
        if (this.validateNoEmptyTextNodes(child)) {
          return true;
        }
      }
    }

    return false;
  }
}
