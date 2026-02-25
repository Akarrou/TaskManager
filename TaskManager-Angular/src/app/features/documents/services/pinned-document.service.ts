import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase';
import { from, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface PinnedDocument {
  id: string;
  user_id: string;
  document_id: string;
  project_id: string;
  position: number;
  created_at: string;
}

@Injectable({
  providedIn: 'root',
})
export class PinnedDocumentService {
  private supabase = inject(SupabaseService);

  private get client() {
    return this.supabase.client;
  }

  /**
   * Get all pinned documents for a project
   */
  getPinnedByProject(projectId: string): Observable<PinnedDocument[]> {
    return from(
      this.client
        .from('pinned_documents')
        .select('*')
        .eq('project_id', projectId)
        .order('position', { ascending: true })
    ).pipe(
      map((response) => {
        if (response.error) throw response.error;
        return (response.data ?? []) as PinnedDocument[];
      })
    );
  }

  /**
   * Pin a document
   */
  pinDocument(documentId: string, projectId: string): Observable<PinnedDocument> {
    return from(this.pinDocumentAsync(documentId, projectId));
  }

  /**
   * Unpin a document (scoped to current user)
   */
  unpinDocument(documentId: string): Observable<void> {
    return from(this.unpinDocumentAsync(documentId));
  }

  private async pinDocumentAsync(documentId: string, projectId: string): Promise<PinnedDocument> {
    const userId = await this.getCurrentUserId();

    // Get max position for ordering
    const { data: existing } = await this.client
      .from('pinned_documents')
      .select('position')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .order('position', { ascending: false })
      .limit(1);

    const nextPosition = (existing?.[0]?.position ?? -1) + 1;

    const { data, error } = await this.client
      .from('pinned_documents')
      .insert({
        user_id: userId,
        document_id: documentId,
        project_id: projectId,
        position: nextPosition,
      })
      .select()
      .single();

    if (error) throw error;
    return data as PinnedDocument;
  }

  private async unpinDocumentAsync(documentId: string): Promise<void> {
    const userId = await this.getCurrentUserId();

    const { error } = await this.client
      .from('pinned_documents')
      .delete()
      .eq('document_id', documentId)
      .eq('user_id', userId);

    if (error) throw error;
  }

  private async getCurrentUserId(): Promise<string> {
    const { data, error } = await this.client.auth.getUser();
    if (error || !data.user) throw new Error('User not authenticated');
    return data.user.id;
  }
}
