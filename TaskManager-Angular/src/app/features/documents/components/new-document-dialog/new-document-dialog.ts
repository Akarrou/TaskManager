import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface NewDocumentDialogResult {
  title: string;
}

@Component({
  selector: 'app-new-document-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './new-document-dialog.html',
  styleUrl: './new-document-dialog.scss',
})
export class NewDocumentDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<NewDocumentDialogComponent>);

  documentForm!: FormGroup;

  ngOnInit() {
    // Initialiser le formulaire
    this.documentForm = this.fb.group({
      title: [
        'Nouvelle page',
        [Validators.required, Validators.minLength(1), Validators.maxLength(200)],
      ],
    });
  }

  onCancel() {
    this.dialogRef.close();
  }

  onConfirm() {
    if (this.documentForm.valid) {
      const result: NewDocumentDialogResult = {
        title: this.capitalizeFirstLetter(this.documentForm.value.title.trim()),
      };
      this.dialogRef.close(result);
    }
  }

  private capitalizeFirstLetter(text: string): string {
    if (!text) return text;
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  get isFormValid(): boolean {
    return this.documentForm.valid;
  }
}
