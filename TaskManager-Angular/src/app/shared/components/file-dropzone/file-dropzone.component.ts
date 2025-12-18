import { Component, computed, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { StorageService, StorageUploadResult } from '../../../core/services/storage.service';

/**
 * Interface pour l'événement émis lors d'un upload réussi
 */
export interface FileUploadedEvent {
  url: string;
  path: string;
  file: File;
}

/**
 * Composant drag & drop réutilisable pour upload de fichiers vers Supabase Storage
 *
 * Ce composant gère :
 * - Drag & drop de fichiers
 * - Validation de type MIME et taille
 * - Upload vers Supabase Storage
 * - Génération d'URL publique
 * - États visuels (idle, hover, dragging, uploading, success, error)
 * - Barre de progression indéterminée
 *
 * @example
 * ```html
 * <app-file-dropzone
 *   [bucket]="'documents-assets'"
 *   [path]="'documents/' + documentId + '/images/'"
 *   [acceptedTypes]="'image/*'"
 *   (fileUploaded)="onImageUploaded($event)"
 * />
 * ```
 */
@Component({
  selector: 'app-file-dropzone',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatProgressBarModule],
  templateUrl: './file-dropzone.component.html',
  styleUrl: './file-dropzone.component.scss'
})
export class FileDropzoneComponent {
  private storageService = inject(StorageService);

  // Inputs (signals)
  /** Nom du bucket Supabase Storage (requis) */
  bucket = input.required<string>();

  /** Chemin de base où uploader le fichier (requis, ex: 'documents/123/images/') */
  path = input.required<string>();

  /** Types MIME acceptés (défaut: 'image/*') */
  acceptedTypes = input<string>('image/*');

  /** Taille maximale du fichier en bytes (défaut: 50MB) */
  maxSize = input<number>(52428800);

  /** Autoriser upload multiple (défaut: false) */
  multiple = input<boolean>(false);

  /** Message d'instruction personnalisé */
  instructionMessage = input<string>('Glissez un fichier ici ou cliquez pour sélectionner');

  // Outputs (signals)
  /** Émis quand un fichier a été uploadé avec succès */
  fileUploaded = output<FileUploadedEvent>();

  /** Émis en cas d'erreur d'upload */
  uploadError = output<Error>();

  // État interne (signals)
  /** Indicateur d'upload en cours */
  isUploading = signal<boolean>(false);

  /** Indicateur de zone de drop active (drag over) */
  isDragging = signal<boolean>(false);

  /** Message d'erreur */
  errorMessage = signal<string>('');

  /** Fichier sélectionné (pour preview) */
  selectedFile = signal<File | null>(null);

  /** URL de preview pour les images */
  previewUrl = signal<string>('');

  /** État de succès (affiche brièvement après upload) */
  isSuccess = signal<boolean>(false);

  /**
   * Computed: Classes CSS pour la zone de drop
   */
  dropzoneClasses = computed(() => {
    const classes = ['dropzone'];

    if (this.isDragging()) {
      classes.push('dropzone--dragging');
    }

    if (this.isUploading()) {
      classes.push('dropzone--uploading');
    }

    if (this.errorMessage()) {
      classes.push('dropzone--error');
    }

    if (this.isSuccess()) {
      classes.push('dropzone--success');
    }

    return classes.join(' ');
  });

  /**
   * Handler pour l'événement dragover
   * Prévient le comportement par défaut et active l'état dragging
   */
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  /**
   * Handler pour l'événement dragleave
   * Désactive l'état dragging quand on quitte la zone
   */
  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  /**
   * Handler pour l'événement drop
   * Récupère les fichiers droppés et lance l'upload
   */
  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleFiles(files);
    }
  }

  /**
   * Handler pour la sélection de fichier via input
   */
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;

    if (files && files.length > 0) {
      this.handleFiles(files);
    }

    // Reset input pour permettre de sélectionner le même fichier
    input.value = '';
  }

  /**
   * Traite les fichiers sélectionnés (validation + upload)
   */
  private async handleFiles(files: FileList): Promise<void> {
    // Reset état
    this.errorMessage.set('');
    this.isSuccess.set(false);

    // Prendre le premier fichier (ou tous si multiple activé)
    const fileToUpload = files[0];

    // Validation
    const validationError = this.validateFile(fileToUpload);
    if (validationError) {
      this.errorMessage.set(validationError);
      this.uploadError.emit(new Error(validationError));
      return;
    }

    // Stocker le fichier pour preview
    this.selectedFile.set(fileToUpload);

    // Générer preview pour les images
    if (fileToUpload.type.startsWith('image/')) {
      this.generatePreview(fileToUpload);
    }

    // Upload
    await this.uploadFile(fileToUpload);
  }

  /**
   * Valide un fichier (type MIME et taille)
   *
   * @param file - Fichier à valider
   * @returns Message d'erreur ou null si valide
   */
  private validateFile(file: File): string | null {
    // Validation type MIME
    const acceptedTypes = this.acceptedTypes();
    if (acceptedTypes && acceptedTypes !== '*') {
      const types = acceptedTypes.split(',').map(t => t.trim());
      const isValidType = types.some(type => {
        // Gestion des wildcards (ex: 'image/*')
        if (type.endsWith('/*')) {
          const baseType = type.replace('/*', '');
          return file.type.startsWith(baseType + '/');
        }
        return file.type === type;
      });

      if (!isValidType) {
        return `Type de fichier non accepté. Types acceptés : ${acceptedTypes}`;
      }
    }

    // Validation taille
    const maxSize = this.maxSize();
    if (file.size > maxSize) {
      const maxSizeMB = (maxSize / 1024 / 1024).toFixed(2);
      const fileSizeMB = (file.size / 1024 / 1024).toFixed(2);
      return `Fichier trop volumineux (${fileSizeMB}MB). Taille maximale : ${maxSizeMB}MB`;
    }

    return null;
  }

  /**
   * Génère une URL de preview pour les images
   */
  private generatePreview(file: File): void {
    const reader = new FileReader();
    reader.onload = (e) => {
      this.previewUrl.set(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  /**
   * Upload le fichier vers Supabase Storage
   */
  private async uploadFile(file: File): Promise<void> {
    this.isUploading.set(true);
    this.errorMessage.set('');

    try {
      // Générer nom de fichier unique
      const uniqueFileName = this.storageService.generateUniqueFileName(file.name);

      // Générer chemin complet
      const fullPath = this.storageService.generateFilePath(this.path(), uniqueFileName);

      // Upload
      const result: StorageUploadResult = await this.storageService.uploadFile(
        this.bucket(),
        fullPath,
        file,
        {
          cacheControl: '3600',
          upsert: false
        }
      );

      // Succès
      this.isSuccess.set(true);

      // Émettre événement
      this.fileUploaded.emit({
        url: result.url,
        path: result.path,
        file
      });

      // Reset état de succès après 2 secondes
      setTimeout(() => {
        this.isSuccess.set(false);
        this.selectedFile.set(null);
        this.previewUrl.set('');
      }, 2000);

    } catch (error) {
      const errorMsg = error instanceof Error
        ? error.message
        : 'Erreur lors de l\'upload du fichier';

      this.errorMessage.set(errorMsg);
      this.uploadError.emit(error instanceof Error ? error : new Error(errorMsg));

      // Reset preview en cas d'erreur
      this.selectedFile.set(null);
      this.previewUrl.set('');
    } finally {
      this.isUploading.set(false);
    }
  }

  /**
   * Réinitialise le composant
   */
  reset(): void {
    this.isUploading.set(false);
    this.isDragging.set(false);
    this.errorMessage.set('');
    this.selectedFile.set(null);
    this.previewUrl.set('');
    this.isSuccess.set(false);
  }
}
