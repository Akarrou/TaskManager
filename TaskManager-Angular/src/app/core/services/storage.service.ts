import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase';

/**
 * Interface pour les objets de fichiers retournés par Supabase Storage
 */
export interface StorageFileObject {
  name: string;
  id: string | null;
  updated_at?: string;
  created_at?: string;
  last_accessed_at?: string;
  metadata?: Record<string, any>;
}

/**
 * Interface pour le résultat d'un upload de fichier
 */
export interface StorageUploadResult {
  url: string;
  path: string;
  fullPath: string;
}

/**
 * Service générique pour gérer le stockage de fichiers via Supabase Storage
 *
 * Responsabilités:
 * - Upload de fichiers vers des buckets Supabase
 * - Génération d'URLs publiques et signées
 * - Suppression de fichiers
 * - Listing de fichiers
 *
 * @example
 * ```typescript
 * const result = await storageService.uploadFile(
 *   'documents-assets',
 *   'documents/123/images/photo.jpg',
 *   fileObject
 * );
 * console.log('URL publique:', result.url);
 * ```
 */
@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private supabase = inject(SupabaseService);

  /**
   * Upload un fichier vers un bucket Supabase Storage
   *
   * @param bucket - Nom du bucket de destination
   * @param path - Chemin complet du fichier dans le bucket (ex: 'documents/123/image.jpg')
   * @param file - Objet File à uploader
   * @param options - Options d'upload (cacheControl, upsert)
   * @returns Promesse contenant l'URL publique et le chemin du fichier
   * @throws Error si l'upload échoue
   */
  async uploadFile(
    bucket: string,
    path: string,
    file: File,
    options: {
      cacheControl?: string;
      upsert?: boolean;
    } = {}
  ): Promise<StorageUploadResult> {
    const { cacheControl = '3600', upsert = false } = options;

    try {
      const { data, error } = await this.supabase.client.storage
        .from(bucket)
        .upload(path, file, {
          cacheControl,
          upsert
        });

      if (error) {
        throw new Error(`Upload failed: ${error.message}`);
      }

      if (!data) {
        throw new Error('Upload succeeded but no data returned');
      }

      // Générer l'URL publique
      const url = this.getPublicUrl(bucket, data.path);

      return {
        url,
        path: data.path,
        fullPath: data.fullPath
      };
    } catch (error) {
      console.error('Storage upload error:', error);
      throw error;
    }
  }

  /**
   * Récupère l'URL publique d'un fichier
   *
   * @param bucket - Nom du bucket
   * @param path - Chemin du fichier dans le bucket
   * @returns URL publique du fichier
   */
  getPublicUrl(bucket: string, path: string): string {
    const { data } = this.supabase.client.storage
      .from(bucket)
      .getPublicUrl(path);

    return data.publicUrl;
  }

  /**
   * Génère une URL signée temporaire pour un fichier privé
   *
   * @param bucket - Nom du bucket
   * @param path - Chemin du fichier
   * @param expiresIn - Durée de validité en secondes (défaut: 1 heure)
   * @returns Promesse contenant l'URL signée
   * @throws Error si la génération échoue
   */
  async getSignedUrl(
    bucket: string,
    path: string,
    expiresIn: number = 3600
  ): Promise<string> {
    try {
      const { data, error } = await this.supabase.client.storage
        .from(bucket)
        .createSignedUrl(path, expiresIn);

      if (error) {
        throw new Error(`Failed to generate signed URL: ${error.message}`);
      }

      if (!data || !data.signedUrl) {
        throw new Error('Signed URL generation succeeded but no URL returned');
      }

      return data.signedUrl;
    } catch (error) {
      console.error('Storage signed URL error:', error);
      throw error;
    }
  }

  /**
   * Supprime un fichier du bucket
   *
   * @param bucket - Nom du bucket
   * @param path - Chemin du fichier à supprimer
   * @throws Error si la suppression échoue
   */
  async deleteFile(bucket: string, path: string): Promise<void> {
    try {
      const { error } = await this.supabase.client.storage
        .from(bucket)
        .remove([path]);

      if (error) {
        throw new Error(`Delete failed: ${error.message}`);
      }
    } catch (error) {
      console.error('Storage delete error:', error);
      throw error;
    }
  }

  /**
   * Supprime plusieurs fichiers d'un coup
   *
   * @param bucket - Nom du bucket
   * @param paths - Tableau des chemins de fichiers à supprimer
   * @throws Error si la suppression échoue
   */
  async deleteFiles(bucket: string, paths: string[]): Promise<void> {
    try {
      const { error } = await this.supabase.client.storage
        .from(bucket)
        .remove(paths);

      if (error) {
        throw new Error(`Batch delete failed: ${error.message}`);
      }
    } catch (error) {
      console.error('Storage batch delete error:', error);
      throw error;
    }
  }

  /**
   * Liste les fichiers d'un dossier dans un bucket
   *
   * @param bucket - Nom du bucket
   * @param folder - Chemin du dossier (défaut: racine)
   * @param options - Options de listing (limit, offset, sortBy)
   * @returns Promesse contenant la liste des fichiers
   * @throws Error si le listing échoue
   */
  async listFiles(
    bucket: string,
    folder: string = '',
    options: {
      limit?: number;
      offset?: number;
      sortBy?: { column: string; order: 'asc' | 'desc' };
    } = {}
  ): Promise<StorageFileObject[]> {
    try {
      const { data, error } = await this.supabase.client.storage
        .from(bucket)
        .list(folder, options);

      if (error) {
        throw new Error(`List failed: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error('Storage list error:', error);
      throw error;
    }
  }

  /**
   * Vérifie si un fichier existe dans le bucket
   *
   * @param bucket - Nom du bucket
   * @param path - Chemin du fichier
   * @returns True si le fichier existe, false sinon
   */
  async fileExists(bucket: string, path: string): Promise<boolean> {
    try {
      // Extraire le dossier et le nom de fichier
      const lastSlashIndex = path.lastIndexOf('/');
      const folder = lastSlashIndex > 0 ? path.substring(0, lastSlashIndex) : '';
      const fileName = path.substring(lastSlashIndex + 1);

      const files = await this.listFiles(bucket, folder);
      return files.some(file => file.name === fileName);
    } catch (error) {
      console.error('Storage file exists check error:', error);
      return false;
    }
  }

  /**
   * Génère un nom de fichier unique avec timestamp
   *
   * @param originalName - Nom original du fichier
   * @returns Nom de fichier avec timestamp
   *
   * @example
   * generateUniqueFileName('photo.jpg') // '1702555123456_photo.jpg'
   */
  generateUniqueFileName(originalName: string): string {
    const timestamp = Date.now();
    const sanitizedName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${timestamp}_${sanitizedName}`;
  }

  /**
   * Génère un chemin complet pour un fichier
   *
   * @param basePath - Chemin de base (ex: 'documents/123/images')
   * @param fileName - Nom du fichier
   * @returns Chemin complet
   *
   * @example
   * generateFilePath('documents/123/images', 'photo.jpg')
   * // 'documents/123/images/photo.jpg'
   */
  generateFilePath(basePath: string, fileName: string): string {
    const cleanBasePath = basePath.replace(/\/$/, ''); // Retirer slash final
    return `${cleanBasePath}/${fileName}`;
  }
}
