import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { DocumentSection } from '../../models/document-tabs.model';

export interface SectionEditDialogData {
  section?: DocumentSection;
  mode: 'create' | 'edit';
}

export interface SectionEditDialogResult {
  title: string;
  icon: string;
  color: string;
}

@Component({
  selector: 'app-section-edit-dialog',
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
  templateUrl: './section-edit-dialog.component.html',
  styleUrls: ['./section-edit-dialog.component.scss'],
})
export class SectionEditDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<SectionEditDialogComponent>);
  public data = inject<SectionEditDialogData>(MAT_DIALOG_DATA);

  form: FormGroup;

  // Available icons for sections
  icons = [
    'folder_open',
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
    'check_circle',
    'pending',
    'schedule',
    'event',
    'task',
    'assignment',
    'note',
    'push_pin',
    'inventory_2',
  ];

  // Available colors for sections
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
    const section = this.data.section;
    this.selectedIcon = section?.icon ?? 'folder_open';
    this.selectedColor = section?.color ?? '#6366f1';

    this.form = this.fb.group({
      title: [section?.title ?? '', [Validators.required, Validators.minLength(1), Validators.maxLength(100)]],
    });
  }

  get isEditMode(): boolean {
    return this.data.mode === 'edit';
  }

  get dialogTitle(): string {
    return this.isEditMode ? 'Modifier la section' : 'Nouvelle section';
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
      const result: SectionEditDialogResult = {
        title: this.form.value.title.trim(),
        icon: this.selectedIcon,
        color: this.selectedColor,
      };
      this.dialogRef.close(result);
    }
  }
}
