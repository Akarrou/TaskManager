import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  AbstractControl,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface ExternalLinkDialogData {
  mode: 'insert' | 'edit';
  currentUrl?: string;
  currentLabel?: string;
}

export interface ExternalLinkDialogResult {
  url: string;
  label: string;
}

@Component({
  selector: 'app-external-link-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './external-link-dialog.component.html',
  styleUrl: './external-link-dialog.component.scss',
})
export class ExternalLinkDialogComponent implements OnInit {
  private dialogRef = inject(MatDialogRef<ExternalLinkDialogComponent>);
  private fb = inject(FormBuilder);
  readonly data = inject<ExternalLinkDialogData>(MAT_DIALOG_DATA);

  isEditMode = signal<boolean>(false);
  linkForm!: FormGroup;

  ngOnInit(): void {
    this.isEditMode.set(this.data.mode === 'edit');

    this.linkForm = this.fb.group({
      url: [
        this.data.currentUrl || '',
        [Validators.required, this.urlValidator()],
      ],
      label: [
        this.data.currentLabel || '',
        [Validators.required, Validators.minLength(1), Validators.maxLength(200)],
      ],
    });
  }

  /**
   * Custom validator for URL format (HTTP/HTTPS required)
   */
  private urlValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;
      if (!value) return null;

      // Must start with http:// or https://
      const isValidUrl = /^https?:\/\/.+/i.test(value);

      return isValidUrl ? null : { invalidUrl: true };
    };
  }

  /**
   * Get current character count for label field
   */
  get labelCharCount(): number {
    return this.linkForm.get('label')?.value?.length || 0;
  }

  /**
   * Check if form is valid
   */
  get isFormValid(): boolean {
    return this.linkForm.valid;
  }

  /**
   * Cancel dialog
   */
  onCancel(): void {
    this.dialogRef.close();
  }

  /**
   * Confirm and return result
   */
  onConfirm(): void {
    if (this.linkForm.valid) {
      const result: ExternalLinkDialogResult = {
        url: this.linkForm.value.url,
        label: this.linkForm.value.label,
      };
      this.dialogRef.close(result);
    }
  }
}
