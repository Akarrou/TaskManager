import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { Inject } from '@angular/core';
import { ISubtask } from './subtask.model';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-edit-subtask-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  templateUrl: './edit-subtask-dialog.component.html',
  styleUrls: ['./edit-subtask-dialog.component.scss']
})
export class EditSubtaskDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<EditSubtaskDialogComponent>);
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
      this.dialogRef.close(subtaskData);
    } else {
      this.subtaskForm.markAllAsTouched();
    }
  }
} 