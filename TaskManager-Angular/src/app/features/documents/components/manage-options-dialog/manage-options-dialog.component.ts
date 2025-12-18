import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';

import { SelectChoice, DatabaseColumn } from '../../models/database.model';

/**
 * Dialog data for managing select/multi-select options
 */
export interface ManageOptionsDialogData {
  column: DatabaseColumn;
}

/**
 * Dialog result
 */
export interface ManageOptionsDialogResult {
  choices: SelectChoice[];
}

@Component({
  selector: 'app-manage-options-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
  ],
  templateUrl: './manage-options-dialog.component.html',
  styleUrl: './manage-options-dialog.component.scss',
})
export class ManageOptionsDialogComponent implements OnInit {
  readonly dialogRef = inject(MatDialogRef<ManageOptionsDialogComponent>);
  readonly data = inject<ManageOptionsDialogData>(MAT_DIALOG_DATA);

  choices = signal<SelectChoice[]>([]);
  columnName = signal<string>('');
  columnType = signal<string>('');

  // Available Tailwind colors for choices
  availableColors = [
    { value: 'bg-gray-200', label: 'Gris' },
    { value: 'bg-red-200', label: 'Rouge' },
    { value: 'bg-orange-200', label: 'Orange' },
    { value: 'bg-yellow-200', label: 'Jaune' },
    { value: 'bg-green-200', label: 'Vert' },
    { value: 'bg-blue-200', label: 'Bleu' },
    { value: 'bg-indigo-200', label: 'Indigo' },
    { value: 'bg-purple-200', label: 'Violet' },
    { value: 'bg-pink-200', label: 'Rose' },
    { value: 'bg-cyan-200', label: 'Cyan' },
  ];

  ngOnInit() {
    this.columnName.set(this.data.column.name);
    this.columnType.set(this.data.column.type === 'select' ? 'Select' : 'Multi-select');

    // Load existing choices
    if (this.data.column.options?.choices) {
      this.choices.set([...this.data.column.options.choices]);
    }
  }

  /**
   * Add a new choice
   */
  addChoice() {
    const newChoice: SelectChoice = {
      id: this.generateChoiceId(),
      label: `Option ${this.choices().length + 1}`,
      color: this.getNextColor(),
    };
    this.choices.update((choices) => [...choices, newChoice]);
  }

  /**
   * Update choice label
   */
  updateChoiceLabel(choiceId: string, newLabel: string) {
    this.choices.update((choices) =>
      choices.map((c) => (c.id === choiceId ? { ...c, label: newLabel } : c))
    );
  }

  /**
   * Update choice color
   */
  updateChoiceColor(choiceId: string, newColor: string) {
    this.choices.update((choices) =>
      choices.map((c) => (c.id === choiceId ? { ...c, color: newColor } : c))
    );
  }

  /**
   * Remove a choice
   */
  removeChoice(choiceId: string) {
    this.choices.update((choices) => choices.filter((c) => c.id !== choiceId));
  }

  /**
   * Save and close dialog
   */
  onSave() {
    const result: ManageOptionsDialogResult = {
      choices: this.choices(),
    };
    this.dialogRef.close(result);
  }

  /**
   * Cancel and close dialog
   */
  onCancel() {
    this.dialogRef.close();
  }

  /**
   * Generate a unique choice ID
   */
  private generateChoiceId(): string {
    return `choice-${crypto.randomUUID()}`;
  }

  /**
   * Get next color in rotation
   */
  private getNextColor(): string {
    const usedColors = this.choices().map((c) => c.color);
    const unusedColor = this.availableColors.find(
      (color) => !usedColors.includes(color.value)
    );
    if (unusedColor) {
      return unusedColor.value;
    }
    // If all colors used, pick a random one
    const randomIndex = Math.floor(Math.random() * this.availableColors.length);
    return this.availableColors[randomIndex].value;
  }
}
