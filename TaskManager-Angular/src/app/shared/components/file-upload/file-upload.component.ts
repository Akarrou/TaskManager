import { Component, input, output, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SupabaseService } from '../../../core/services/supabase';

export interface FileAttachment {
  id?: string;
  task_id?: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
  uploaded_at?: string;
}

interface UploadProgress {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
}

@Component({
  selector: 'app-file-upload',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatProgressBarModule,
    MatTooltipModule
  ],
  templateUrl: './file-upload.component.html',
  styleUrls: ['./file-upload.component.scss']
})
export class FileUploadComponent {
  private supabaseService = inject(SupabaseService);

  taskId = input<string>();
  existingFiles = input<FileAttachment[]>([]);
  maxFiles = input<number>(10);
  maxFileSize = input<number>(10 * 1024 * 1024); // 10MB default
  acceptedTypes = input<string>('*');

  filesUploaded = output<FileAttachment[]>();
  fileDeleted = output<string>();
  fileRemoved = output<FileAttachment>();

  isDragging = signal(false);
  uploadQueue = signal<UploadProgress[]>([]);
  uploadedFiles = signal<FileAttachment[]>([]);

  // File type icons mapping
  private fileIcons: { [key: string]: string } = {
    'application/pdf': 'picture_as_pdf',
    'image/png': 'image',
    'image/jpeg': 'image',
    'image/gif': 'image',
    'image/webp': 'image',
    'image/svg+xml': 'image',
    'video/mp4': 'video_file',
    'video/webm': 'video_file',
    'audio/mpeg': 'audio_file',
    'audio/wav': 'audio_file',
    'application/zip': 'folder_zip',
    'application/x-rar-compressed': 'folder_zip',
    'application/msword': 'description',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'description',
    'application/vnd.ms-excel': 'table_chart',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'table_chart',
    'application/vnd.ms-powerpoint': 'slideshow',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'slideshow',
    'text/plain': 'article',
    'text/csv': 'table_chart',
    'application/json': 'data_object',
  };

  ngOnInit() {
    // Initialize with existing files
    this.uploadedFiles.set(this.existingFiles());
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);

    const files = event.dataTransfer?.files;
    if (files) {
      this.handleFiles(Array.from(files));
    }
  }

  onFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.handleFiles(Array.from(input.files));
      input.value = ''; // Reset input
    }
  }

  private handleFiles(files: File[]) {
    const currentCount = this.uploadedFiles().length + this.uploadQueue().length;
    const remainingSlots = this.maxFiles() - currentCount;

    if (remainingSlots <= 0) {
      console.warn('Nombre maximum de fichiers atteint');
      return;
    }

    const filesToProcess = files.slice(0, remainingSlots);

    for (const file of filesToProcess) {
      // Validate file size
      if (file.size > this.maxFileSize()) {
        console.warn(`Fichier ${file.name} trop volumineux (max: ${this.formatFileSize(this.maxFileSize())})`);
        continue;
      }

      // Add to upload queue
      const uploadItem: UploadProgress = {
        file,
        progress: 0,
        status: 'pending'
      };

      this.uploadQueue.update(queue => [...queue, uploadItem]);
      this.uploadFile(uploadItem);
    }
  }

  private async uploadFile(uploadItem: UploadProgress) {
    const taskId = this.taskId() || 'temp';
    const fileName = `${taskId}/${Date.now()}_${uploadItem.file.name}`;

    // Update status to uploading
    this.updateUploadProgress(uploadItem.file, { status: 'uploading', progress: 10 });

    try {
      // Upload to Supabase Storage
      const { data, error } = await this.supabaseService.client
        .storage
        .from('task-attachments')
        .upload(fileName, uploadItem.file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        throw error;
      }

      this.updateUploadProgress(uploadItem.file, { progress: 80 });

      // Get public URL
      const { data: urlData } = this.supabaseService.client
        .storage
        .from('task-attachments')
        .getPublicUrl(fileName);

      // Create attachment record
      const attachment: FileAttachment = {
        task_id: this.taskId(),
        file_name: uploadItem.file.name,
        file_url: urlData.publicUrl,
        file_type: uploadItem.file.type,
        file_size: uploadItem.file.size
      };

      // Save to database if task exists
      if (this.taskId()) {
        const { data: savedAttachment, error: dbError } = await this.supabaseService.taskAttachments
          .insert([attachment])
          .select()
          .single();

        if (dbError) {
          console.warn('Erreur lors de l\'enregistrement en base:', dbError);
        } else if (savedAttachment) {
          attachment.id = savedAttachment.id;
          attachment.uploaded_at = savedAttachment.uploaded_at;
        }
      }

      // Update status to completed
      this.updateUploadProgress(uploadItem.file, { status: 'completed', progress: 100 });

      // Add to uploaded files
      this.uploadedFiles.update(files => [...files, attachment]);
      this.filesUploaded.emit(this.uploadedFiles());

      // Remove from queue after delay
      setTimeout(() => {
        this.uploadQueue.update(queue =>
          queue.filter(item => item.file !== uploadItem.file)
        );
      }, 1500);

    } catch (error: any) {
      console.error('Erreur upload:', error);
      this.updateUploadProgress(uploadItem.file, {
        status: 'error',
        error: error.message || 'Erreur lors du téléchargement'
      });
    }
  }

  private updateUploadProgress(file: File, updates: Partial<UploadProgress>) {
    this.uploadQueue.update(queue =>
      queue.map(item =>
        item.file === file ? { ...item, ...updates } : item
      )
    );
  }

  async removeFile(attachment: FileAttachment) {
    // Remove from storage if we have the URL
    if (attachment.file_url) {
      try {
        const path = attachment.file_url.split('/task-attachments/')[1];
        if (path) {
          await this.supabaseService.client
            .storage
            .from('task-attachments')
            .remove([path]);
        }
      } catch (error) {
        console.warn('Erreur lors de la suppression du fichier:', error);
      }
    }

    // Remove from database if it has an ID
    if (attachment.id) {
      try {
        await this.supabaseService.taskAttachments
          .delete()
          .eq('id', attachment.id);
      } catch (error) {
        console.warn('Erreur lors de la suppression en base:', error);
      }
    }

    // Update local state
    this.uploadedFiles.update(files =>
      files.filter(f => f !== attachment)
    );
    this.filesUploaded.emit(this.uploadedFiles());
    this.fileRemoved.emit(attachment);

    if (attachment.id) {
      this.fileDeleted.emit(attachment.id);
    }
  }

  cancelUpload(uploadItem: UploadProgress) {
    this.uploadQueue.update(queue =>
      queue.filter(item => item.file !== uploadItem.file)
    );
  }

  getFileIcon(mimeType: string): string {
    return this.fileIcons[mimeType] || 'insert_drive_file';
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  isImage(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  }

  getTotalUploaded(): number {
    return this.uploadedFiles().length;
  }
}
