import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { Inject } from '@angular/core';
import { ISubtask } from './subtask.model';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-edit-subtask-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule
  ],
  templateUrl: './edit-subtask-dialog.component.html'
})
export class EditSubtaskDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<EditSubtaskDialogComponent>);
  private snackBar = inject(MatSnackBar);
  subtaskForm: FormGroup;

  constructor(@Inject(MAT_DIALOG_DATA) public data: Partial<ISubtask>) {
    this.subtaskForm = this.fb.group({
      id: [data.id ?? null],
      title: [data.title ?? '', Validators.required],
      description: [data.description ?? ''],
      status: [data.status ?? 'pending', Validators.required],
      environment: [data.environment ?? null, Validators.required],
      slug: [data.slug ?? '', Validators.required],
      estimated_hours: [data.estimated_hours ?? null],
      guideline_refsInput: [data.guideline_refs ? data.guideline_refs.join(', ') : '']
    });
  }

  onCancel() {
    this.dialogRef.close();
  }

  onSave() {
    if (this.subtaskForm.valid) {
      const formValue = this.subtaskForm.value;
      const guidelineRefsArray = formValue.guideline_refsInput ? formValue.guideline_refsInput.split(',').map((t: string) => t.trim()).filter((t: string) => t) : [];
      const subtaskData = {
        ...formValue,
        guideline_refs: guidelineRefsArray
      };
      this.snackBar.open('Sous-tâche mise à jour avec succès!', 'Fermer', { duration: 2000, panelClass: 'green-snackbar' });
      this.dialogRef.close(subtaskData);
    } else {
      this.snackBar.open('Veuillez corriger les erreurs du formulaire.', 'Fermer', { duration: 3000, panelClass: 'red-snackbar' });
      this.subtaskForm.markAllAsTouched();
    }
  }
} 