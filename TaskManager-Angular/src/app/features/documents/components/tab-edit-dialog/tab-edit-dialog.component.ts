import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { DocumentTab } from '../../models/document-tabs.model';

export interface TabEditDialogData {
  tab?: DocumentTab;
  mode: 'create' | 'edit';
}

export interface TabEditDialogResult {
  name: string;
  icon: string;
  color: string;
}

@Component({
  selector: 'app-tab-edit-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './tab-edit-dialog.component.html',
  styleUrls: ['./tab-edit-dialog.component.scss'],
})
export class TabEditDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<TabEditDialogComponent>);
  public data = inject<TabEditDialogData>(MAT_DIALOG_DATA);

  form: FormGroup;

  // Available icons for tabs
  icons = [
    'folder',
    'description',
    'article',
    'book',
    'bookmark',
    'star',
    'favorite',
    'work',
    'home',
    'school',
    'science',
    'code',
    'bug_report',
    'lightbulb',
    'archive',
    'inbox',
    'drafts',
    'label',
    'flag',
    'priority_high',
  ];

  // Available colors for tabs
  colors = [
    '#6366f1', // Indigo
    '#8b5cf6', // Violet
    '#a855f7', // Purple
    '#d946ef', // Fuchsia
    '#ec4899', // Pink
    '#f43f5e', // Rose
    '#ef4444', // Red
    '#f97316', // Orange
    '#f59e0b', // Amber
    '#eab308', // Yellow
    '#84cc16', // Lime
    '#22c55e', // Green
    '#10b981', // Emerald
    '#14b8a6', // Teal
    '#06b6d4', // Cyan
    '#0ea5e9', // Sky
    '#3b82f6', // Blue
    '#6b7280', // Gray
  ];

  selectedIcon: string;
  selectedColor: string;

  constructor() {
    const tab = this.data.tab;
    this.selectedIcon = tab?.icon ?? 'folder';
    this.selectedColor = tab?.color ?? '#6366f1';

    this.form = this.fb.group({
      name: [tab?.name ?? '', [Validators.required, Validators.minLength(1), Validators.maxLength(50)]],
    });
  }

  get isEditMode(): boolean {
    return this.data.mode === 'edit';
  }

  get dialogTitle(): string {
    return this.isEditMode ? 'Modifier l\'onglet' : 'Nouvel onglet';
  }

  selectIcon(icon: string): void {
    this.selectedIcon = icon;
  }

  selectColor(color: string): void {
    this.selectedColor = color;
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSubmit(): void {
    if (this.form.valid) {
      const result: TabEditDialogResult = {
        name: this.capitalizeFirstLetter(this.form.value.name.trim()),
        icon: this.selectedIcon,
        color: this.selectedColor,
      };
      this.dialogRef.close(result);
    }
  }

  private capitalizeFirstLetter(text: string): string {
    if (!text) return text;
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
}
