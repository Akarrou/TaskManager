import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase';
import { from, Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { JSONContent } from '@tiptap/core';

export interface Document {
  id: string;
  title: string;
  content: JSONContent; // TipTap's JSON content (ProseMirror schema)
  created_at?: string;
  updated_at?: string;
  user_id?: string;
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
    const newDoc = {
      title: doc.title || 'Sans titre',
      content: doc.content || {},
      // user_id will be handled by Supabase if strictly RLSecurity, 
      // or we can inject it here if we have the current user in session
    };

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
}
