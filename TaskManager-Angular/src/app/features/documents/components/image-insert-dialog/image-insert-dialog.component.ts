import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  ValidatorFn,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { FileDropzoneComponent, FileUploadedEvent } from '../../../../shared/components/file-dropzone/file-dropzone.component';

export interface ImageInsertDialogData {
  mode: 'insert' | 'edit';
  currentSrc?: string;
  currentAlt?: string;
  currentAlignment?: 'left' | 'center' | 'right';
  currentCaption?: string;
}

export interface ImageInsertDialogResult {
  src: string;
  alt: string;
  alignment: 'left' | 'center' | 'right';
  caption?: string;
}

@Component({
  selector: 'app-image-insert-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatRadioModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTabsModule,
    FileDropzoneComponent,
  ],
  templateUrl: './image-insert-dialog.component.html',
  styleUrl: './image-insert-dialog.component.scss',
})
export class ImageInsertDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<ImageInsertDialogComponent>);
  private data = inject<ImageInsertDialogData>(MAT_DIALOG_DATA);

  imageForm!: FormGroup;
  isEditMode = signal(false);
  imagePreviewUrl = signal<string | null>(null);
  imageLoadError = signal(false);
  isLoadingPreview = signal(false);

  // Nouveaux signals pour l'upload
  selectedTabIndex = signal<number>(0);
  uploadedFileUrl = signal<string | null>(null);

  // Options d'alignement
  alignmentOptions = [
    { value: 'left', label: 'Gauche', icon: 'format_align_left' },
    { value: 'center', label: 'Centre', icon: 'format_align_center' },
    { value: 'right', label: 'Droite', icon: 'format_align_right' },
  ] as const;

  ngOnInit() {
    this.isEditMode.set(this.data.mode === 'edit');

    // Initialiser le formulaire
    this.imageForm = this.fb.group({
      src: [
        this.data.currentSrc || '',
        [
          Validators.required,
          this.urlOrStorageValidator(),
        ],
      ],
      alt: [
        this.data.currentAlt || '',
        [Validators.required, Validators.minLength(3)],
      ],
      alignment: [this.data.currentAlignment || 'center'],
      caption: [this.data.currentCaption || '', Validators.maxLength(500)],
    });

    // Auto-sélection du tab en mode edit
    if (this.data.mode === 'edit' && this.data.currentSrc) {
      const isStorageUrl = this.data.currentSrc.includes('/storage/');
      this.selectedTabIndex.set(isStorageUrl ? 1 : 0);
      this.loadImagePreview(this.data.currentSrc);
    }

    // Surveiller les changements d'URL pour mettre à jour la preview
    this.imageForm.get('src')?.valueChanges.subscribe((url: string) => {
      if (url && this.imageForm.get('src')?.valid) {
        this.loadImagePreview(url);
      } else {
        this.imagePreviewUrl.set(null);
        this.imageLoadError.set(false);
      }
    });
  }

  /**
   * Custom validator pour URL HTTP/HTTPS ou chemin Supabase Storage
   */
  private urlOrStorageValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;
      if (!value) return null;

      // Accepter URLs HTTP/HTTPS
      const isValidUrl = /^https?:\/\/.+/i.test(value);

      // Accepter chemins Supabase Storage (local ou prod)
      const isStoragePath = value.includes('/storage/v1/object/');

      return isValidUrl || isStoragePath ? null : { invalidUrl: true };
    };
  }

  /**
   * Handler appelé quand un fichier est uploadé avec succès
   */
  onFileUploaded(event: FileUploadedEvent): void {
    console.log('File uploaded:', event);

    // Stocker l'URL uploadée
    this.uploadedFileUrl.set(event.url);

    // Mettre à jour le form control src
    this.imageForm.patchValue({ src: event.url });

    // Charger le preview
    this.loadImagePreview(event.url);
  }

  /**
   * Handler appelé en cas d'erreur d'upload
   */
  onUploadError(error: Error): void {
    console.error('Upload error:', error);
    this.uploadedFileUrl.set(null);
    this.imageLoadError.set(true);
  }

  loadImagePreview(url: string) {
    this.isLoadingPreview.set(true);
    this.imageLoadError.set(false);

    const img = new Image();

    img.onload = () => {
      this.imagePreviewUrl.set(url);
      this.imageLoadError.set(false);
      this.isLoadingPreview.set(false);
    };

    img.onerror = () => {
      this.imagePreviewUrl.set(null);
      this.imageLoadError.set(true);
      this.isLoadingPreview.set(false);
    };

    img.src = url;
  }

  onCancel() {
    this.dialogRef.close();
  }

  onConfirm() {
    if (this.imageForm.valid && this.imagePreviewUrl() && !this.imageLoadError()) {
      const result: ImageInsertDialogResult = {
        src: this.imageForm.value.src,
        alt: this.imageForm.value.alt,
        alignment: this.imageForm.value.alignment,
        caption: this.imageForm.value.caption || '',
      };
      this.dialogRef.close(result);
    }
  }

  get isFormValid(): boolean {
    return this.imageForm.valid && !!this.imagePreviewUrl() && !this.imageLoadError();
  }
}
