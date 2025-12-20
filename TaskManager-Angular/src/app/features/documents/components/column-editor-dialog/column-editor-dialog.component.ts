import { Component, Inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  DatabaseColumn,
  ColumnType,
  SelectChoice,
  DEFAULT_COLUMN_WIDTHS,
} from '../../models/database.model';

export interface ColumnEditorDialogData {
  column?: DatabaseColumn; // Undefined for new column, defined for edit
  existingColumnIds: string[]; // To prevent duplicate IDs
  mode: 'add' | 'edit';
}

export interface ColumnEditorDialogResult {
  column: DatabaseColumn;
}

@Component({
  selector: 'app-column-editor-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatIconModule,
    MatTooltipModule,
  ],
  templateUrl: './column-editor-dialog.component.html',
  styleUrl: './column-editor-dialog.component.scss',
})
export class ColumnEditorDialogComponent implements OnInit {
  columnForm!: FormGroup;
  isEditMode = signal(false);

  // Available column types
  columnTypes: { value: ColumnType; label: string }[] = [
    { value: 'text', label: 'Texte' },
    { value: 'number', label: 'Nombre' },
    { value: 'date', label: 'Date' },
    { value: 'date-range', label: 'Plage de dates' },
    { value: 'checkbox', label: 'Case à cocher' },
    { value: 'select', label: 'Sélection' },
    { value: 'multi-select', label: 'Sélection multiple' },
    { value: 'url', label: 'URL' },
    { value: 'email', label: 'Email' },
  ];

  // Include time option for date-range columns
  includeTime = signal(false);

  // Choices for select/multi-select (editable)
  choices = signal<SelectChoice[]>([]);

  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<ColumnEditorDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ColumnEditorDialogData
  ) {}

  ngOnInit() {
    this.isEditMode.set(this.data.mode === 'edit');

    // Initialize form
    this.columnForm = this.fb.group({
      name: [this.data.column?.name || '', [Validators.required, Validators.minLength(1)]],
      type: [this.data.column?.type || 'text', Validators.required],
      required: [this.data.column?.required || false],
      visible: [this.data.column?.visible ?? true],
    });

    // Load existing choices if editing select/multi-select
    if (
      this.data.column &&
      (this.data.column.type === 'select' || this.data.column.type === 'multi-select') &&
      this.data.column.options?.choices
    ) {
      this.choices.set([...this.data.column.options.choices]);
    }

    // Load includeTime option for date-range columns
    if (this.data.column?.type === 'date-range' && this.data.column.options?.includeTime) {
      this.includeTime.set(true);
    }

    // Watch for type changes to show/hide choice editor
    this.columnForm.get('type')?.valueChanges.subscribe((type: ColumnType) => {
      if (type !== 'select' && type !== 'multi-select') {
        this.choices.set([]);
      } else if (this.choices().length === 0) {
        // Add default choices for new select columns
        this.addDefaultChoices();
      }
    });
  }

  /**
   * Add default choices for select columns
   */
  private addDefaultChoices() {
    this.choices.set([
      { id: this.generateChoiceId(), label: 'Option 1', color: 'bg-gray-200' },
      { id: this.generateChoiceId(), label: 'Option 2', color: 'bg-blue-200' },
      { id: this.generateChoiceId(), label: 'Option 3', color: 'bg-green-200' },
    ]);
  }

  /**
   * Check if current type is select or multi-select
   */
  get isSelectType(): boolean {
    const type = this.columnForm.get('type')?.value;
    return type === 'select' || type === 'multi-select';
  }

  /**
   * Check if current type is date-range
   */
  get isDateRangeType(): boolean {
    return this.columnForm.get('type')?.value === 'date-range';
  }

  /**
   * Add a new choice
   */
  addChoice() {
    const newChoice: SelectChoice = {
      id: this.generateChoiceId(),
      label: `Option ${this.choices().length + 1}`,
      color: this.getRandomColor(),
    };
    this.choices.update((choices) => [...choices, newChoice]);
  }

  /**
   * Remove a choice
   */
  removeChoice(choiceId: string) {
    this.choices.update((choices) => choices.filter((c) => c.id !== choiceId));
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
   * Generate unique choice ID
   */
  private generateChoiceId(): string {
    return 'choice-' + crypto.randomUUID();
  }

  /**
   * Get random color for new choices
   */
  private getRandomColor(): string {
    const colors = [
      'bg-gray-200',
      'bg-red-200',
      'bg-orange-200',
      'bg-yellow-200',
      'bg-green-200',
      'bg-teal-200',
      'bg-blue-200',
      'bg-indigo-200',
      'bg-purple-200',
      'bg-pink-200',
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  /**
   * Available colors for choice badges
   */
  availableColors = [
    { value: 'bg-gray-200', label: 'Gris' },
    { value: 'bg-red-200', label: 'Rouge' },
    { value: 'bg-orange-200', label: 'Orange' },
    { value: 'bg-yellow-200', label: 'Jaune' },
    { value: 'bg-green-200', label: 'Vert' },
    { value: 'bg-teal-200', label: 'Turquoise' },
    { value: 'bg-blue-200', label: 'Bleu' },
    { value: 'bg-indigo-200', label: 'Indigo' },
    { value: 'bg-purple-200', label: 'Violet' },
    { value: 'bg-pink-200', label: 'Rose' },
  ];

  /**
   * Cancel and close dialog
   */
  onCancel(): void {
    this.dialogRef.close();
  }

  /**
   * Save column and close dialog
   */
  onSave(): void {
    if (this.columnForm.invalid) {
      return;
    }

    const formValue = this.columnForm.value;
    const columnType = formValue.type as ColumnType;

    // Generate column ID if adding new column
    // Use underscores instead of hyphens to comply with PostgreSQL column naming
    const columnId =
      this.data.column?.id || crypto.randomUUID().split('-')[0];

    // Build column object
    const column: DatabaseColumn = {
      id: columnId,
      name: formValue.name,
      type: columnType,
      visible: formValue.visible,
      required: formValue.required,
      order: this.data.column?.order ?? 0,
      width: this.data.column?.width ?? DEFAULT_COLUMN_WIDTHS[columnType],
    };

    // Add options for select/multi-select
    if (columnType === 'select' || columnType === 'multi-select') {
      column.options = {
        choices: this.choices(),
      };
    }

    // Add options for date-range
    if (columnType === 'date-range') {
      column.options = {
        includeTime: this.includeTime(),
      };
    }

    const result: ColumnEditorDialogResult = { column };
    this.dialogRef.close(result);
  }

  /**
   * Get title for dialog
   */
  get dialogTitle(): string {
    return this.isEditMode() ? 'Modifier la colonne' : 'Ajouter une colonne';
  }

  /**
   * Check if form is valid
   */
  get isFormValid(): boolean {
    if (!this.columnForm.valid) return false;

    // Additional validation for select types
    if (this.isSelectType && this.choices().length === 0) {
      return false;
    }

    return true;
  }
}
