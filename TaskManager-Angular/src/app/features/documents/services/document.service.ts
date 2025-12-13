import { Injectable, inject, Injector } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase';
import { StorageService } from '../../../core/services/storage.service';
import { from, Observable, of, firstValueFrom } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import { JSONContent } from '@tiptap/core';
import { DocumentTaskRelation, TaskMentionData, TaskSearchResult } from '../models/document-task-relation.model';
import { Task } from '../../../core/models/task.model';
import type { DatabaseService } from './database.service';

export interface CascadeDeleteInfo {
  childDocumentCount: number;
  databaseCount: number;
}

export interface Document {
  id: string;
  title: string;
  content: JSONContent; // TipTap's JSON content (ProseMirror schema)
  parent_id?: string | null; // Parent document for hierarchical navigation
  project_id?: string | null; // Project this document belongs to
  created_at?: string;
  updated_at?: string;
  user_id?: string;

  // Database row link (for Notion-like database pages)
  database_id?: string | null; // ID of the database (format: db-<uuid>) if this document represents a database row
  database_row_id?: string | null; // ID of the row in the database_<uuid> table
}

export interface DocumentBreadcrumb {
  id: string;
  title: string;
}

export interface DocumentStorageFile {
  name: string;
  url: string;
  path: string;
}

@Injectable({
  providedIn: 'root'
})
export class DocumentService {
  private supabase = inject(SupabaseService);
  private storageService = inject(StorageService);
  private injector = inject(Injector);

  private readonly DOCUMENTS_FILES_BUCKET = 'documents-files';

  // Lazy getter to avoid circular dependency with DatabaseService
  private get databaseService(): DatabaseService {
    // Import dynamically to avoid circular dependency at initialization
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DatabaseService } = require('./database.service');
    return this.injector.get(DatabaseService);
  }

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

    // Include project_id if provided
    if (doc.project_id !== undefined) {
      newDoc['project_id'] = doc.project_id;
    }

    // Include database link if provided (for database row documents)
    if (doc.database_id !== undefined) {
      newDoc['database_id'] = doc.database_id;
    }

    if (doc.database_row_id !== undefined) {
      newDoc['database_row_id'] = doc.database_row_id;
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

  /**
   * Create a document linked to a database row (Notion-style)
   * This document represents a row in a database and will display properties when opened
   */
  createDatabaseRowDocument(data: {
    title: string;
    database_id: string;
    database_row_id: string;
    project_id?: string;
    content?: JSONContent;
  }): Observable<Document> {
    // Default to valid empty TipTap document structure if no content provided
    const defaultContent: JSONContent = { type: 'doc', content: [] };

    return this.createDocument({
      title: data.title,
      database_id: data.database_id,
      database_row_id: data.database_row_id,
      project_id: data.project_id,
      content: data.content || defaultContent,
    });
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

  /**
   * Delete a document and all its associated files from storage
   * Files are stored at: documents/{documentId}/files/
   */
  deleteDocument(id: string): Observable<boolean> {
    return from(this.deleteDocumentStorageFiles(id)).pipe(
      switchMap(() =>
        from(
          this.client
            .from('documents')
            .delete()
            .eq('id', id)
        )
      ),
      map(response => {
        if (response.error) throw response.error;
        return true;
      }),
      catchError((error) => {
        console.error('Error deleting document:', error);
        return of(false);
      })
    );
  }

  /**
   * Get all descendant document IDs recursively (children, grandchildren, etc.)
   * @param documentId - The root document ID
   * @returns Array of all descendant document IDs (not including the root)
   */
  async getAllDescendantIds(documentId: string): Promise<string[]> {
    const descendants: string[] = [];
    const queue: string[] = [documentId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;

      // Get direct children
      const { data, error } = await this.client
        .from('documents')
        .select('id')
        .eq('parent_id', currentId);

      if (error) {
        console.error(`Error fetching children for document ${currentId}:`, error);
        continue;
      }

      for (const child of data || []) {
        descendants.push(child.id);
        queue.push(child.id); // Add to queue for further traversal
      }
    }

    return descendants;
  }

  /**
   * Get cascade delete info for a document (counts of descendants and databases)
   * @param documentId - The document ID to analyze
   */
  async getCascadeDeleteInfo(documentId: string): Promise<CascadeDeleteInfo> {
    // Get all descendant IDs
    const descendantIds = await this.getAllDescendantIds(documentId);

    // Get the root document
    const { data: rootDoc } = await this.client
      .from('documents')
      .select('content')
      .eq('id', documentId)
      .single();

    // Count databases in root document
    let databaseCount = rootDoc?.content ? this.extractDatabaseIds(rootDoc.content).length : 0;

    // Count databases in all descendants
    for (const descId of descendantIds) {
      const { data: descDoc } = await this.client
        .from('documents')
        .select('content')
        .eq('id', descId)
        .single();

      if (descDoc?.content) {
        databaseCount += this.extractDatabaseIds(descDoc.content).length;
      }
    }

    return {
      childDocumentCount: descendantIds.length,
      databaseCount
    };
  }

  /**
   * Delete a document and all its descendants in cascade
   * Deletes: storage files, databases, and document records
   * @param documentId - The root document ID to delete
   */
  async deleteDocumentCascade(documentId: string): Promise<boolean> {
    try {
      // 1. Get all descendant IDs
      const descendantIds = await this.getAllDescendantIds(documentId);

      // Add root document at the end (delete children first)
      const allDocIds = [...descendantIds, documentId];

      // 2. Delete each document (from leaves to root)
      // We reverse to delete children before parents
      for (const docId of allDocIds.reverse()) {
        await this.deleteSingleDocumentWithContent(docId);
      }

      console.log(`Successfully deleted document ${documentId} and ${descendantIds.length} descendants`);
      return true;
    } catch (error) {
      console.error('Error in cascade delete:', error);
      return false;
    }
  }

  /**
   * Delete a single document along with its storage files and databases
   * @param documentId - The document ID to delete
   */
  private async deleteSingleDocumentWithContent(documentId: string): Promise<void> {
    // 1. Get document content for database IDs
    const { data: doc } = await this.client
      .from('documents')
      .select('content')
      .eq('id', documentId)
      .single();

    // 2. Delete storage files
    await this.deleteDocumentStorageFiles(documentId);

    // 3. Delete databases if any
    if (doc?.content) {
      const databaseIds = this.extractDatabaseIds(doc.content);
      for (const dbId of databaseIds) {
        try {
          await firstValueFrom(this.databaseService.deleteDatabase(dbId));
        } catch (err) {
          console.warn(`Failed to delete database ${dbId}:`, err);
        }
      }
    }

    // 4. Delete document_task_relations
    await this.client
      .from('document_task_relations')
      .delete()
      .eq('document_id', documentId);

    // 5. Delete document record
    const { error } = await this.client
      .from('documents')
      .delete()
      .eq('id', documentId);

    if (error) {
      throw error;
    }
  }

  /**
   * Check if a document is a child of another document
   * @param documentId - The potential child document ID
   * @param parentId - The potential parent document ID
   */
  async isChildDocument(documentId: string, parentId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from('documents')
      .select('parent_id')
      .eq('id', documentId)
      .single();

    if (error || !data) {
      return false;
    }

    return data.parent_id === parentId;
  }

  /**
   * Get basic document info (title and parent_id)
   * @param documentId - The document ID
   */
  async getDocumentBasicInfo(documentId: string): Promise<{ title: string; parent_id: string | null } | null> {
    const { data, error } = await this.client
      .from('documents')
      .select('title, parent_id')
      .eq('id', documentId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      title: data.title,
      parent_id: data.parent_id
    };
  }

  /**
   * Delete all files associated with a document from storage
   * @param documentId - The document ID
   */
  private async deleteDocumentStorageFiles(documentId: string): Promise<void> {
    const folderPath = `documents/${documentId}/files`;

    try {
      // List all files in the document's folder
      const files = await this.storageService.listFiles(
        this.DOCUMENTS_FILES_BUCKET,
        folderPath
      );

      if (files.length === 0) {
        return;
      }

      // Build full paths for deletion
      const filePaths = files.map(file => `${folderPath}/${file.name}`);

      // Delete all files
      await this.storageService.deleteFiles(this.DOCUMENTS_FILES_BUCKET, filePaths);

      console.log(`Deleted ${filePaths.length} files from storage for document ${documentId}`);
    } catch (error) {
      // Log error but don't fail the document deletion
      console.warn(`Failed to delete storage files for document ${documentId}:`, error);
    }
  }

  /**
   * Get all storage files associated with a document
   * Files are stored at: documents/{documentId}/files/
   */
  async getDocumentStorageFiles(documentId: string): Promise<DocumentStorageFile[]> {
    const folderPath = `documents/${documentId}/files`;

    try {
      const files = await this.storageService.listFiles(
        this.DOCUMENTS_FILES_BUCKET,
        folderPath
      );

      return files
        .filter(file => file.name !== '.emptyFolderPlaceholder') // Filter out placeholder files
        .map(file => {
          const filePath = `${folderPath}/${file.name}`;
          return {
            name: file.name,
            path: filePath,
            url: this.storageService.getPublicUrl(this.DOCUMENTS_FILES_BUCKET, filePath)
          };
        });
    } catch (error) {
      console.warn(`Failed to get storage files for document ${documentId}:`, error);
      return [];
    }
  }

  /**
   * Extrait les IDs de bases de données du contenu d'un document
   * Parcourt récursivement le JSON TipTap pour trouver tous les noeuds database
   */
  extractDatabaseIds(content: JSONContent): string[] {
    const databaseIds: string[] = [];

    const traverse = (node: any) => {
      if (!node) return;

      // Si c'est un noeud database avec un databaseId
      if (node.type === 'database' && node.attrs?.databaseId) {
        databaseIds.push(node.attrs.databaseId);
      }

      // Parcourir récursivement les enfants
      if (node.content && Array.isArray(node.content)) {
        node.content.forEach((child: any) => traverse(child));
      }
    };

    traverse(content);
    return databaseIds;
  }

  /**
   * Get the breadcrumb path (parent hierarchy) for a document
   * Returns array from root to current document
   * For database row documents, includes the parent document containing the database
   */
  async getDocumentBreadcrumb(documentId: string): Promise<DocumentBreadcrumb[]> {
    const breadcrumbs: DocumentBreadcrumb[] = [];
    let currentId: string | null = documentId;

    // First, check if this is a database row document
    const currentDocResult = await this.client
      .from('documents')
      .select('id, title, parent_id, database_id')
      .eq('id', documentId)
      .single();

    if (currentDocResult.error || !currentDocResult.data) {
      return breadcrumbs;
    }

    const currentDoc = currentDocResult.data;

    // If this is a database row document, find the parent document containing the database
    if (currentDoc.database_id) {
      const databaseResult = await this.client
        .from('document_databases')
        .select('document_id')
        .eq('database_id', currentDoc.database_id)
        .single();

      if (!databaseResult.error && databaseResult.data) {
        // Get the parent document that contains the database
        const parentDocResult = await this.client
          .from('documents')
          .select('id, title')
          .eq('id', databaseResult.data.document_id)
          .single();

        if (!parentDocResult.error && parentDocResult.data) {
          // Add parent document to breadcrumb
          breadcrumbs.push({
            id: parentDocResult.data.id,
            title: parentDocResult.data.title
          });
        }
      }
    }

    // Add current document
    breadcrumbs.push({
      id: currentDoc.id,
      title: currentDoc.title
    });

    // If there's a parent_id hierarchy, traverse it (for non-database row documents)
    if (!currentDoc.database_id && currentDoc.parent_id) {
      currentId = currentDoc.parent_id as string | null;

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
        const tasks = (response.data || [])
          .filter((rel: any) => rel.tasks) // Filter out any null tasks
          .map((rel: any) => rel.tasks as Task);
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

  /**
   * Get documents statistics for dashboard
   */
  getDocumentsStats(): Observable<{ total: number; recentCount: number; lastModified: Date | null }> {
    return this.getDocuments().pipe(
      map(documents => {
        const total = documents.length;

        // Calculate recent count (modified in last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const recentCount = documents.filter(doc => {
          if (!doc.updated_at) return false;
          const updatedDate = new Date(doc.updated_at);
          return updatedDate >= sevenDaysAgo;
        }).length;

        // Get last modified date
        let lastModified: Date | null = null;
        if (documents.length > 0 && documents[0].updated_at) {
          lastModified = new Date(documents[0].updated_at);
        }

        return { total, recentCount, lastModified };
      }),
      catchError(() => of({ total: 0, recentCount: 0, lastModified: null }))
    );
  }

  /**
   * Get documents for a specific project
   */
  getDocumentsByProject(projectId: string): Observable<Document[]> {
    return from(
      this.client
        .from('documents')
        .select('*')
        .eq('project_id', projectId)
        .order('updated_at', { ascending: false })
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return response.data as Document[];
      })
    );
  }

  /**
   * Search tasks for a document, filtered by the document's project
   */
  searchTasksForDocument(documentId: string, query: string, limit: number = 10): Observable<TaskSearchResult[]> {
    // First get the document to find its project_id
    return this.getDocument(documentId).pipe(
      switchMap(doc => {
        const projectId = doc?.project_id || null;
        if (!projectId) {
          // If document has no project, return empty array
          return of([]);
        }
        // Then search tasks with that project_id filter
        return this.searchTasks(query, projectId, limit);
      }),
      catchError(() => of([]))
    );
  }
}
