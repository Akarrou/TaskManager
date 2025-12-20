import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase';
import { from, Observable, forkJoin, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import {
  DocumentTab,
  DocumentSection,
  DocumentTabItem,
  CreateDocumentTab,
  UpdateDocumentTab,
  CreateDocumentSection,
  UpdateDocumentSection,
  DocumentDropTarget,
  TabsLoadResult,
} from '../models/document-tabs.model';

@Injectable({
  providedIn: 'root',
})
export class DocumentTabsService {
  private supabase = inject(SupabaseService);

  private get client() {
    return this.supabase.client;
  }

  // =====================================================================
  // TABS
  // =====================================================================

  /**
   * Get all tabs for a project
   */
  getTabsByProject(projectId: string): Observable<DocumentTab[]> {
    return from(
      this.client
        .from('document_tabs')
        .select('*')
        .eq('project_id', projectId)
        .order('position', { ascending: true })
    ).pipe(
      map((response) => {
        if (response.error) throw response.error;
        return response.data as DocumentTab[];
      })
    );
  }

  /**
   * Get all tabs, sections, and items for a project in one call
   */
  getTabsWithItemsByProject(projectId: string): Observable<TabsLoadResult> {
    return this.getTabsByProject(projectId).pipe(
      switchMap((tabs) => {
        if (tabs.length === 0) {
          return of({ tabs: [], sections: [], items: [] });
        }

        const tabIds = tabs.map((t) => t.id);

        return forkJoin({
          tabs: of(tabs),
          sections: this.getSectionsByTabIds(tabIds),
          items: this.getItemsByTabIds(tabIds),
        });
      })
    );
  }

  /**
   * Create a new tab
   */
  createTab(tab: CreateDocumentTab): Observable<DocumentTab> {
    return from(
      this.client.rpc('get_next_tab_position', { p_project_id: tab.project_id })
    ).pipe(
      switchMap((positionResult) => {
        const position = tab.position ?? (positionResult.data as number) ?? 0;

        return from(
          this.client
            .from('document_tabs')
            .insert({
              ...tab,
              position,
              icon: tab.icon ?? 'folder',
              color: tab.color ?? '#6366f1',
              is_default: tab.is_default ?? false,
            })
            .select()
            .single()
        );
      }),
      map((response) => {
        if (response.error) throw response.error;
        return response.data as DocumentTab;
      })
    );
  }

  /**
   * Update an existing tab
   */
  updateTab(tabId: string, updates: UpdateDocumentTab): Observable<DocumentTab> {
    return from(
      this.client
        .from('document_tabs')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', tabId)
        .select()
        .single()
    ).pipe(
      map((response) => {
        if (response.error) throw response.error;
        return response.data as DocumentTab;
      })
    );
  }

  /**
   * Delete a tab (cascade deletes sections and items)
   */
  deleteTab(tabId: string): Observable<boolean> {
    return from(
      this.client.from('document_tabs').delete().eq('id', tabId)
    ).pipe(
      map((response) => {
        if (response.error) throw response.error;
        return true;
      })
    );
  }

  /**
   * Reorder tabs by updating their positions
   */
  reorderTabs(tabIds: string[]): Observable<DocumentTab[]> {
    const updates = tabIds.map((id, index) =>
      this.client
        .from('document_tabs')
        .update({ position: index, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
    );

    return from(Promise.all(updates)).pipe(
      map((responses) =>
        responses.map((r) => {
          if (r.error) throw r.error;
          return r.data as DocumentTab;
        })
      )
    );
  }

  // =====================================================================
  // SECTIONS
  // =====================================================================

  /**
   * Get sections by tab IDs
   */
  private getSectionsByTabIds(tabIds: string[]): Observable<DocumentSection[]> {
    return from(
      this.client
        .from('document_sections')
        .select('*')
        .in('tab_id', tabIds)
        .order('position', { ascending: true })
    ).pipe(
      map((response) => {
        if (response.error) throw response.error;
        return response.data as DocumentSection[];
      })
    );
  }

  /**
   * Get sections for a specific tab
   */
  getSectionsByTab(tabId: string): Observable<DocumentSection[]> {
    return from(
      this.client
        .from('document_sections')
        .select('*')
        .eq('tab_id', tabId)
        .order('position', { ascending: true })
    ).pipe(
      map((response) => {
        if (response.error) throw response.error;
        return response.data as DocumentSection[];
      })
    );
  }

  /**
   * Create a new section
   */
  createSection(section: CreateDocumentSection): Observable<DocumentSection> {
    return from(
      this.client.rpc('get_next_section_position', { p_tab_id: section.tab_id })
    ).pipe(
      switchMap((positionResult) => {
        const position = section.position ?? (positionResult.data as number) ?? 0;

        return from(
          this.client
            .from('document_sections')
            .insert({
              ...section,
              position,
              icon: section.icon ?? 'folder_open',
              color: section.color ?? '#6366f1',
              is_collapsed: false,
            })
            .select()
            .single()
        );
      }),
      map((response) => {
        if (response.error) throw response.error;
        return response.data as DocumentSection;
      })
    );
  }

  /**
   * Update an existing section
   */
  updateSection(sectionId: string, updates: UpdateDocumentSection): Observable<DocumentSection> {
    return from(
      this.client
        .from('document_sections')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', sectionId)
        .select()
        .single()
    ).pipe(
      map((response) => {
        if (response.error) throw response.error;
        return response.data as DocumentSection;
      })
    );
  }

  /**
   * Delete a section (items move to unsectioned)
   */
  deleteSection(sectionId: string): Observable<boolean> {
    return from(
      this.client.from('document_sections').delete().eq('id', sectionId)
    ).pipe(
      map((response) => {
        if (response.error) throw response.error;
        return true;
      })
    );
  }

  /**
   * Reorder sections within a tab
   */
  reorderSections(sectionIds: string[]): Observable<DocumentSection[]> {
    const updates = sectionIds.map((id, index) =>
      this.client
        .from('document_sections')
        .update({ position: index, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
    );

    return from(Promise.all(updates)).pipe(
      map((responses) =>
        responses.map((r) => {
          if (r.error) throw r.error;
          return r.data as DocumentSection;
        })
      )
    );
  }

  // =====================================================================
  // TAB ITEMS
  // =====================================================================

  /**
   * Get items by tab IDs
   */
  private getItemsByTabIds(tabIds: string[]): Observable<DocumentTabItem[]> {
    return from(
      this.client
        .from('document_tab_items')
        .select('*')
        .in('tab_id', tabIds)
        .order('position', { ascending: true })
    ).pipe(
      map((response) => {
        if (response.error) throw response.error;
        return response.data as DocumentTabItem[];
      })
    );
  }

  /**
   * Get items for a specific tab
   */
  getItemsByTab(tabId: string): Observable<DocumentTabItem[]> {
    return from(
      this.client
        .from('document_tab_items')
        .select('*')
        .eq('tab_id', tabId)
        .order('position', { ascending: true })
    ).pipe(
      map((response) => {
        if (response.error) throw response.error;
        return response.data as DocumentTabItem[];
      })
    );
  }

  /**
   * Add a document to a tab
   */
  addDocumentToTab(
    documentId: string,
    tabId: string,
    sectionId?: string | null,
    position?: number
  ): Observable<DocumentTabItem> {
    return from(
      this.client.rpc('get_next_item_position', {
        p_tab_id: tabId,
        p_section_id: sectionId ?? null,
      })
    ).pipe(
      switchMap((positionResult) => {
        const finalPosition = position ?? (positionResult.data as number) ?? 0;

        return from(
          this.client
            .from('document_tab_items')
            .insert({
              document_id: documentId,
              tab_id: tabId,
              section_id: sectionId ?? null,
              position: finalPosition,
            })
            .select()
            .single()
        );
      }),
      map((response) => {
        if (response.error) throw response.error;
        return response.data as DocumentTabItem;
      })
    );
  }

  /**
   * Move a document to a new tab/section/position
   */
  moveDocument(documentId: string, target: DocumentDropTarget): Observable<DocumentTabItem> {
    // First, find the existing item
    return from(
      this.client
        .from('document_tab_items')
        .select('*')
        .eq('document_id', documentId)
        .single()
    ).pipe(
      switchMap((findResult) => {
        if (findResult.error) throw findResult.error;

        // Update the item with new position
        return from(
          this.client
            .from('document_tab_items')
            .update({
              tab_id: target.tabId,
              section_id: target.sectionId,
              position: target.position,
              updated_at: new Date().toISOString(),
            })
            .eq('id', findResult.data.id)
            .select()
            .single()
        );
      }),
      map((response) => {
        if (response.error) throw response.error;
        return response.data as DocumentTabItem;
      })
    );
  }

  /**
   * Remove a document from a tab
   */
  removeDocumentFromTab(documentId: string, tabId: string): Observable<boolean> {
    return from(
      this.client
        .from('document_tab_items')
        .delete()
        .eq('document_id', documentId)
        .eq('tab_id', tabId)
    ).pipe(
      map((response) => {
        if (response.error) throw response.error;
        return true;
      })
    );
  }

  /**
   * Reorder documents within a section (or unsectioned area)
   */
  reorderDocuments(
    tabId: string,
    sectionId: string | null,
    documentIds: string[]
  ): Observable<DocumentTabItem[]> {
    const updates = documentIds.map((docId, index) =>
      this.client
        .from('document_tab_items')
        .update({ position: index, updated_at: new Date().toISOString() })
        .eq('document_id', docId)
        .eq('tab_id', tabId)
        .select()
        .single()
    );

    return from(Promise.all(updates)).pipe(
      map((responses) =>
        responses.map((r) => {
          if (r.error) throw r.error;
          return r.data as DocumentTabItem;
        })
      )
    );
  }

  /**
   * Batch add multiple documents to a tab
   */
  batchAddDocumentsToTab(
    documentIds: string[],
    tabId: string,
    sectionId?: string | null
  ): Observable<DocumentTabItem[]> {
    return from(
      this.client.rpc('get_next_item_position', {
        p_tab_id: tabId,
        p_section_id: sectionId ?? null,
      })
    ).pipe(
      switchMap((positionResult) => {
        const startPosition = (positionResult.data as number) ?? 0;

        const items = documentIds.map((docId, index) => ({
          document_id: docId,
          tab_id: tabId,
          section_id: sectionId ?? null,
          position: startPosition + index,
        }));

        return from(
          this.client.from('document_tab_items').insert(items).select()
        );
      }),
      map((response) => {
        if (response.error) throw response.error;
        return response.data as DocumentTabItem[];
      })
    );
  }
}
