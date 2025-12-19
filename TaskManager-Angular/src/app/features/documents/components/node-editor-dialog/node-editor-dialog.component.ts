import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import {
  MindmapNode,
  MindmapNodeContent,
  MindmapNodeShape,
  MindmapNodeStyle,
} from '../../models/mindmap.model';
import { ShapeSelectorComponent } from '../shape-selector/shape-selector.component';
import { ColorPickerComponent } from '../color-picker/color-picker.component';

/**
 * Data passed to the node editor dialog
 */
export interface NodeEditorDialogData {
  node: MindmapNode;
  isRoot: boolean;
}

/**
 * Result returned from the node editor dialog
 */
export interface NodeEditorDialogResult {
  label: string;
  content?: MindmapNodeContent;
  style?: Partial<MindmapNodeStyle>;
  autoSize?: boolean;
  customWidth?: number;
  customHeight?: number;
}

/**
 * Dialog for editing mindmap node content and style
 *
 * Features:
 * - Title and description editing
 * - Rich text formatting (bullet points, bold, italic)
 * - Shape and color customization
 * - Auto-size toggle
 */
@Component({
  selector: 'app-node-editor-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatTabsModule,
    MatCheckboxModule,
    MatSlideToggleModule,
    ShapeSelectorComponent,
    ColorPickerComponent,
  ],
  templateUrl: './node-editor-dialog.component.html',
  styleUrl: './node-editor-dialog.component.scss',
})
export class NodeEditorDialogComponent implements OnInit {
  private dialogRef = inject(MatDialogRef<NodeEditorDialogComponent>);
  private data: NodeEditorDialogData = inject(MAT_DIALOG_DATA);

  // Form fields
  title = signal('');
  description = signal('');
  formattedContent = signal('');

  // Style options
  shape = signal<MindmapNodeShape>('round-rectangle');
  backgroundColor = signal('#3b82f6');
  textColor = signal('#ffffff');

  // Size options
  autoSize = signal(false);
  customWidth = signal(140);
  customHeight = signal(36);

  // State
  isRoot = signal(false);
  activeTabIndex = signal(0);

  ngOnInit(): void {
    const node = this.data.node;
    this.isRoot.set(this.data.isRoot);

    // Initialize content
    if (node.content) {
      this.title.set(node.content.title || node.label);
      this.description.set(node.content.description || '');
      this.formattedContent.set(node.content.formattedContent || '');
    } else {
      this.title.set(node.label);
    }

    // Initialize style
    if (node.style) {
      this.shape.set(node.style.shape || 'round-rectangle');
      this.backgroundColor.set(node.style.backgroundColor || '#3b82f6');
      this.textColor.set(node.style.textColor || '#ffffff');
    }

    // Initialize size
    this.autoSize.set(node.autoSize || false);
    this.customWidth.set(node.customWidth || 140);
    this.customHeight.set(node.customHeight || 36);
  }

  /**
   * Handle shape change from selector
   */
  onShapeChange(newShape: MindmapNodeShape): void {
    this.shape.set(newShape);
  }

  /**
   * Handle background color change
   */
  onBackgroundColorChange(color: string): void {
    this.backgroundColor.set(color);
  }

  /**
   * Handle text color change
   */
  onTextColorChange(color: string): void {
    this.textColor.set(color);
  }

  /**
   * Apply bold formatting to selected text
   */
  applyBold(): void {
    this.wrapSelection('**', '**');
  }

  /**
   * Apply italic formatting to selected text
   */
  applyItalic(): void {
    this.wrapSelection('*', '*');
  }

  /**
   * Add bullet point
   */
  addBullet(): void {
    this.insertAtCursor('\n• ');
  }

  /**
   * Wrap selected text with prefix and suffix
   */
  private wrapSelection(prefix: string, suffix: string): void {
    const textarea = document.querySelector(
      '.formatted-content-textarea'
    ) as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const content = this.formattedContent();
    const selectedText = content.substring(start, end);

    const newContent =
      content.substring(0, start) +
      prefix +
      selectedText +
      suffix +
      content.substring(end);

    this.formattedContent.set(newContent);

    // Restore selection
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + prefix.length,
        end + prefix.length
      );
    }, 0);
  }

  /**
   * Insert text at cursor position
   */
  private insertAtCursor(text: string): void {
    const textarea = document.querySelector(
      '.formatted-content-textarea'
    ) as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const content = this.formattedContent();

    const newContent =
      content.substring(0, start) + text + content.substring(start);

    this.formattedContent.set(newContent);

    // Move cursor after inserted text
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  }

  /**
   * Save and close dialog
   */
  save(): void {
    const result: NodeEditorDialogResult = {
      label: this.title(),
      content: {
        title: this.title(),
        description: this.description(),
        formattedContent: this.formattedContent() || undefined,
      },
      style: {
        shape: this.shape(),
        backgroundColor: this.backgroundColor(),
        textColor: this.textColor(),
      },
      autoSize: this.autoSize(),
      customWidth: this.autoSize() ? undefined : this.customWidth(),
      customHeight: this.autoSize() ? undefined : this.customHeight(),
    };

    this.dialogRef.close(result);
  }

  /**
   * Cancel and close dialog
   */
  cancel(): void {
    this.dialogRef.close();
  }
}
