import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { DocumentTabGroup } from '../../models/document-tabs.model';

export interface GroupEditDialogData {
  group?: DocumentTabGroup;
  mode: 'create' | 'edit';
}

export interface GroupEditDialogResult {
  name: string;
  color: string;
}

@Component({
  selector: 'app-group-edit-dialog',
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
  templateUrl: './group-edit-dialog.component.html',
  styleUrls: ['./group-edit-dialog.component.scss'],
})
export class GroupEditDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<GroupEditDialogComponent>);
  public data = inject<GroupEditDialogData>(MAT_DIALOG_DATA);

  form: FormGroup;

  // Available colors for groups (Chrome-like palette)
  colors = [
    '#6366f1', // Indigo
    '#3b82f6', // Blue
    '#06b6d4', // Cyan
    '#22c55e', // Green
    '#eab308', // Yellow
    '#f97316', // Orange
    '#ef4444', // Red
    '#ec4899', // Pink
    '#a855f7', // Purple
    '#6b7280', // Gray
  ];

  selectedColor: string;

  constructor() {
    const group = this.data.group;
    this.selectedColor = group?.color ?? '#6366f1';

    this.form = this.fb.group({
      name: [group?.name ?? '', [Validators.required, Validators.minLength(1), Validators.maxLength(50)]],
    });
  }

  get isEditMode(): boolean {
    return this.data.mode === 'edit';
  }

  get dialogTitle(): string {
    return this.isEditMode ? 'Modifier le groupe' : 'Nouveau groupe';
  }

  selectColor(color: string): void {
    this.selectedColor = color;
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSubmit(): void {
    if (this.form.valid) {
      const result: GroupEditDialogResult = {
        name: this.capitalizeFirstLetter(this.form.value.name.trim()),
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
