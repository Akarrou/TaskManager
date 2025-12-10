import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase';
import { from, Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { JSONContent } from '@tiptap/core';

export interface Document {
  id: string;
  title: string;
  content: JSONContent; // TipTap's JSON content (ProseMirror schema)
  parent_id?: string | null; // Parent document for hierarchical navigation
  created_at?: string;
  updated_at?: string;
  user_id?: string;
}

export interface DocumentBreadcrumb {
  id: string;
  title: string;
}

@Injectable({
  providedIn: 'root'
})
export class DocumentService {
  private supabase = inject(SupabaseService);

  private get client() {
    return this.supabase.client;
  }

  getDocuments(): Observable<Document[]> {
    return from(
      this.client
        .from('documents')
        .select('*')
        .order('updated_at', { ascending: false })
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return response.data as Document[];
      })
    );
  }

  getDocument(id: string): Observable<Document | null> {
    return from(
      this.client
        .from('documents')
        .select('*')
        .eq('id', id)
        .single()
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return response.data as Document;
      })
    );
  }

  createDocument(doc: Partial<Document>): Observable<Document> {
    const newDoc: Record<string, unknown> = {
      title: doc.title || 'Sans titre',
      content: doc.content || {},
    };

    // Include parent_id if provided (for hierarchical navigation)
    if (doc.parent_id !== undefined) {
      newDoc['parent_id'] = doc.parent_id;
    }

    return from(
      this.client
        .from('documents')
        .insert(newDoc)
        .select()
        .single()
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return response.data as Document;
      })
    );
  }

  updateDocument(id: string, updates: Partial<Document>): Observable<Document> {
    return from(
      this.client
        .from('documents')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single()
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return response.data as Document;
      })
    );
  }

  deleteDocument(id: string): Observable<boolean> {
    return from(
      this.client
        .from('documents')
        .delete()
        .eq('id', id)
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return true;
      }),
      catchError(() => of(false))
    );
  }

  /**
   * Get the breadcrumb path (parent hierarchy) for a document
   * Returns array from root to current document
   */
  async getDocumentBreadcrumb(documentId: string): Promise<DocumentBreadcrumb[]> {
    const breadcrumbs: DocumentBreadcrumb[] = [];
    let currentId: string | null = documentId;

    // Traverse up the parent chain (max 10 levels to prevent infinite loops)
    for (let i = 0; i < 10 && currentId; i++) {
      const result = await this.client
        .from('documents')
        .select('id, title, parent_id')
        .eq('id', currentId)
        .single();

      if (result.error || !result.data) break;

      // Add to beginning of array (we're traversing backwards)
      breadcrumbs.unshift({
        id: result.data.id,
        title: result.data.title
      });

      currentId = result.data.parent_id as string | null;
    }

    return breadcrumbs;
  }
}
