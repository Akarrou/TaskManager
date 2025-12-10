import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase';
import { from, Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { JSONContent } from '@tiptap/core';
import { DocumentTaskRelation, TaskMentionData, TaskSearchResult } from '../models/document-task-relation.model';
import { Task } from '../../../core/services/task';

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

  /**
   * Link a task to a document
   */
  linkTaskToDocument(documentId: string, taskId: string, relationType: 'linked' | 'embedded' = 'linked'): Observable<DocumentTaskRelation> {
    return from(
      this.client
        .from('document_task_relations')
        .insert({ document_id: documentId, task_id: taskId, relation_type: relationType })
        .select()
        .single()
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return response.data as DocumentTaskRelation;
      })
    );
  }

  /**
   * Get all tasks linked to a document
   */
  getTasksForDocument(documentId: string): Observable<TaskMentionData[]> {
    return from(
      this.client
        .from('document_task_relations')
        .select(`task_id, tasks(id, title, status, priority, type, task_number, project_id)`)
        .eq('document_id', documentId)
        .order('position_in_document', { ascending: true })
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return (response.data || []).map((rel: any) => ({
          id: rel.tasks.id,
          title: rel.tasks.title,
          status: rel.tasks.status,
          priority: rel.tasks.priority,
          type: rel.tasks.type,
          task_number: rel.tasks.task_number,
          project_id: rel.tasks.project_id,
        }));
      })
    );
  }

  /**
   * Search tasks by title
   */
  searchTasks(query: string, projectId?: string, limit: number = 10): Observable<TaskSearchResult[]> {
    let request = this.client
      .from('tasks')
      .select('id, title, task_number, type, status, priority, project_id')
      .ilike('title', `%${query}%`)
      .order('task_number', { ascending: false })
      .limit(limit);

    if (projectId) {
      request = request.eq('project_id', projectId);
    }

    return from(request).pipe(
      map(response => {
        if (response.error) throw response.error;
        return response.data as TaskSearchResult[];
      })
    );
  }

  /**
   * Get task data for mention node
   */
  getTaskForMention(taskId: string): Observable<TaskMentionData> {
    return from(
      this.client
        .from('tasks')
        .select('id, title, status, priority, type, task_number, project_id')
        .eq('id', taskId)
        .single()
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return response.data as TaskMentionData;
      })
    );
  }

  /**
   * Get full task objects for all tasks linked to a document
   * Returns complete Task objects needed for table/kanban/calendar/timeline views
   */
  getFullTasksForDocument(documentId: string): Observable<Task[]> {
    return from(
      this.client
        .from('document_task_relations')
        .select(`
          task_id,
          tasks!inner(
            id,
            title,
            description,
            status,
            priority,
            assigned_to,
            created_by,
            due_date,
            created_at,
            updated_at,
            completed_at,
            tags,
            slug,
            prd_slug,
            estimated_hours,
            actual_hours,
            task_number,
            environment,
            guideline_refs,
            type,
            parent_task_id,
            project_id,
            epic_id,
            feature_id
          )
        `)
        .eq('document_id', documentId)
        .order('position_in_document', { ascending: true })
    ).pipe(
      map(response => {
        if (response.error) {
          console.error('Error fetching tasks for document:', response.error);
          throw response.error;
        }
        console.log('Document tasks raw response:', response.data);
        const tasks = (response.data || [])
          .filter((rel: any) => rel.tasks) // Filter out any null tasks
          .map((rel: any) => rel.tasks as Task);
        console.log(`Found ${tasks.length} tasks for document ${documentId}`);
        return tasks;
      })
    );
  }

  /**
   * Update task position in document
   */
  updateTaskPosition(documentId: string, taskId: string, position: number): Observable<boolean> {
    return from(
      this.client
        .from('document_task_relations')
        .update({ position_in_document: position })
        .eq('document_id', documentId)
        .eq('task_id', taskId)
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return true;
      }),
      catchError(() => of(false))
    );
  }
}
