import { Component, OnInit, OnDestroy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { TrashService } from '../../../core/services/trash.service';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { DocumentService, Document, DocumentStorageFile } from '../services/document.service';
import { DocumentDatabase } from '../models/database.model';
import { DatabaseStore } from '../store/database.store';
import { DeleteDocumentDialogComponent } from '../components/delete-document-dialog/delete-document-dialog.component';
import { MarkdownImportDialogComponent } from '../components/markdown-import-dialog/markdown-import-dialog.component';
import { DocumentTabBarComponent } from '../components/document-tab-bar/document-tab-bar.component';
import { DocumentTabContentComponent } from '../components/document-tab-content/document-tab-content.component';
import { FabStore } from '../../../core/stores/fab.store';
import { DocumentTabsStore } from '../store/document-tabs.store';
import { ProjectStore } from '../../projects/store/project.store';
import { DocumentStore } from '../store/document.store';
import {
  DocumentDropTarget,
  UpdateDocumentTab,
  UpdateDocumentSection,
  UpdateDocumentTabGroup,
} from '../models/document-tabs.model';

@Component({
  selector: 'app-document-list',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatCardModule,
    MatTooltipModule,
    DragDropModule,
    DocumentTabBarComponent,
    DocumentTabContentComponent,
  ],
  templateUrl: './document-list.component.html',
  styleUrls: ['./document-list.component.scss']
})
export class DocumentListComponent implements OnInit, OnDestroy {
  private documentService = inject(DocumentService);
  private databaseStore = inject(DatabaseStore);
  private trashService = inject(TrashService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private fabStore = inject(FabStore);
  private projectStore = inject(ProjectStore);
  private documentStore = inject(DocumentStore);
  private tabsStore = inject(DocumentTabsStore);
  private pageId = crypto.randomUUID();

  // Signals from stores
  private selectedProjectSignal = this.projectStore.selectedProject;
  private allDocumentsSignal = this.documentStore.allDocuments;
  private loadingSignal = this.documentStore.loading;

  // Tabs Store signals
  tabs = this.tabsStore.sortedTabs;
  selectedTabId = this.tabsStore.selectedTabId;
  selectedTabWithItems = this.tabsStore.selectedTabWithItems;
  tabsLoading = this.tabsStore.isLoading;
  tabItemCounts = this.tabsStore.tabItemCounts;

  // Groups Store signals
  tabsByGroup = this.tabsStore.tabsByGroup;
  ungroupedTabs = this.tabsStore.ungroupedTabs;
  groups = this.tabsStore.sortedGroups;

  // Computed: Get the group name for the selected tab (for breadcrumb)
  selectedTabBreadcrumb = computed(() => {
    const tab = this.selectedTabWithItems();
    if (!tab) return null;

    const group = this.groups().find(g => g.id === tab.tab_group_id);
    return {
      groupName: group?.name || null,
      groupColor: group?.color || null,
      tabName: tab.name,
      tabIcon: tab.icon,
      tabColor: tab.color,
    };
  });

  // Computed: All drop list IDs (sections + unsectioned + tab drop zones)
  allDropListIds = computed(() => {
    const baseIds = this.tabsStore.allDropListIds();
    const tabDropIds = this.tabs().map(t => `tab-drop-${t.id}`);
    return [...baseIds, ...tabDropIds, 'unorganized-documents'];
  });

  // Computed: filter documents by selected project
  // Only show root documents (no parent_id) in the main grid
  documents = computed(() => {
    const project = this.selectedProjectSignal();
    const allDocs = this.allDocumentsSignal();

    if (!project) {
      return [];
    }

    // Filter by project AND ensure it's a root document (no parent_id)
    return allDocs.filter(doc =>
      doc.project_id === project.id && !doc.parent_id
    );
  });

  // Computed: Map of ALL documents (including children) for quick lookup
  documentMap = computed(() => {
    const project = this.selectedProjectSignal();
    const allDocs = this.allDocumentsSignal();
    const map = new Map<string, Document>();

    if (!project) {
      return map;
    }

    // Include ALL documents from this project (root and children)
    allDocs
      .filter(doc => doc.project_id === project.id)
      .forEach(doc => map.set(doc.id, doc));

    return map;
  });

  // Computed: Documents not in any tab (unorganized)
  unorganizedDocuments = computed(() => {
    const docs = this.documents();
    const organizedIds = this.tabsStore.organizedDocumentIds();
    return docs.filter(doc => !organizedIds.has(doc.id));
  });

  // Computed: IDs of documents already in the selected tab (for picker exclusion)
  selectedTabDocumentIds = computed(() => {
    const tab = this.selectedTabWithItems();
    if (!tab) return new Set<string>();

    const ids = new Set<string>();
    // Unsectioned items
    for (const item of tab.unsectionedItems) {
      ids.add(item.document_id);
    }
    // Sectioned items
    for (const section of tab.sections) {
      for (const item of section.items) {
        ids.add(item.document_id);
      }
    }
    return ids;
  });

  loading = this.loadingSignal;
  currentProject = this.selectedProjectSignal;

  // Map to store storage files for each document
  documentStorageFiles = signal<Map<string, DocumentStorageFile[]>>(new Map());

  // Map to store databases for each document
  documentDatabases = signal<Map<string, DocumentDatabase[]>>(new Map());

  constructor() {
    // Effect: load documents and tabs when selected project changes
    effect(() => {
      const project = this.selectedProjectSignal();
      if (project) {
        this.documentStore.loadDocumentsByProject({ projectId: project.id });
        this.tabsStore.loadTabs({ projectId: project.id });
      }
    });

    // Effect: load storage files and databases when documents change (for all documents including children)
    effect(() => {
      const docMap = this.documentMap();
      if (docMap.size > 0) {
        this.loadStorageFilesForDocuments(Array.from(docMap.values()));
        this.loadDatabasesForDocuments(Array.from(docMap.values()));
      }
    });
  }

  /**
   * Load storage files for all documents
   */
  private async loadStorageFilesForDocuments(docs: Document[]): Promise<void> {
    const filesMap = new Map<string, DocumentStorageFile[]>();

    for (const doc of docs) {
      const files = await this.documentService.getDocumentStorageFiles(doc.id);
      if (files.length > 0) {
        filesMap.set(doc.id, files);
      }
    }

    this.documentStorageFiles.set(filesMap);
  }

  /**
   * Load databases for all documents
   */
  private loadDatabasesForDocuments(docs: Document[]): void {
    const databasesMap = new Map<string, DocumentDatabase[]>();

    // Use forkJoin to load all databases in parallel
    const requests = docs.map(doc =>
      this.databaseStore.getDatabasesByDocumentId(doc.id).pipe(
        catchError(() => of([]))
      )
    );

    if (requests.length === 0) {
      this.documentDatabases.set(databasesMap);
      return;
    }

    forkJoin(requests).subscribe(results => {
      results.forEach((databases, index) => {
        if (databases.length > 0) {
          databasesMap.set(docs[index].id, databases);
        }
      });
      this.documentDatabases.set(databasesMap);
    });
  }

  ngOnInit() {
    // Enregistrer la configuration FAB avec custom actions
    this.fabStore.registerPage(
      {
        context: { currentPage: 'document-list' },
        actions: [
          {
            id: 'new-document',
            icon: 'post_add',
            label: 'Nouveau document',
            tooltip: 'Créer un nouveau document',
            action: () => this.createNewDocument(),
            color: 'primary'
          },
          {
            id: 'import-markdown',
            icon: 'upload_file',
            label: 'Importer Markdown',
            tooltip: 'Importer un fichier Markdown',
            action: () => this.openMarkdownImportDialog(),
            color: 'accent'
          }
        ]
      },
      this.pageId
    );
  }

  ngOnDestroy() {
    this.fabStore.unregisterPage(this.pageId);
  }

  // ==========================================================================
  // TAB OPERATIONS
  // ==========================================================================

  onTabSelect(tabId: string): void {
    this.tabsStore.selectTab(tabId);
  }

  onCreateTab(data: { name: string; icon: string; color: string }): void {
    const project = this.currentProject();
    if (!project) return;

    this.tabsStore.createTab({
      tab: {
        project_id: project.id,
        name: data.name,
        icon: data.icon,
        color: data.color,
      }
    });
  }

  onUpdateTab(data: { tabId: string; updates: UpdateDocumentTab }): void {
    this.tabsStore.updateTab(data);
  }

  onDeleteTab(tabId: string): void {
    this.tabsStore.deleteTab({ tabId });
  }

  onReorderTabs(tabIds: string[]): void {
    this.tabsStore.reorderTabs({ tabIds });
  }

  onDocumentDropOnTab(data: { documentId: string; targetTabId: string }): void {
    // Move document to another tab (unsectioned area of that tab)
    this.tabsStore.moveDocument({
      documentId: data.documentId,
      target: {
        tabId: data.targetTabId,
        sectionId: null,
        position: 0,
      }
    });
  }

  // ==========================================================================
  // GROUP OPERATIONS
  // ==========================================================================

  onCreateGroup(data: { name: string; color: string }): void {
    const project = this.currentProject();
    if (!project) return;

    this.tabsStore.createGroup({
      group: {
        project_id: project.id,
        name: data.name,
        color: data.color,
      }
    });
  }

  onUpdateGroup(data: { groupId: string; updates: UpdateDocumentTabGroup }): void {
    this.tabsStore.updateGroup(data);
  }

  onDeleteGroup(groupId: string): void {
    this.tabsStore.deleteGroup({ groupId });
  }

  onToggleGroupCollapse(groupId: string): void {
    this.tabsStore.toggleGroupCollapse(groupId);
  }

  onReorderGroups(groupIds: string[]): void {
    this.tabsStore.reorderGroups({ groupIds });
  }

  onTabMoveToGroup(data: { tabId: string; groupId: string | null }): void {
    this.tabsStore.moveTabToGroup(data);
  }

  onGroupCreateWithTabs(data: { group: { name: string; color: string }; tabIds: string[] }): void {
    const project = this.currentProject();
    if (!project) return;

    this.tabsStore.createGroupWithTabs({
      group: {
        project_id: project.id,
        name: data.group.name,
        color: data.group.color,
      },
      tabIds: data.tabIds,
    });
  }

  // ==========================================================================
  // SECTION OPERATIONS
  // ==========================================================================

  onCreateSection(tabId: string): void {
    this.tabsStore.createSection({
      section: {
        tab_id: tabId,
        title: 'Nouvelle section',
      }
    });
  }

  onUpdateSection(data: { sectionId: string; updates: UpdateDocumentSection }): void {
    this.tabsStore.updateSection({
      sectionId: data.sectionId,
      updates: data.updates
    });
  }

  onReorderSections(data: { tabId: string; sectionIds: string[] }): void {
    this.tabsStore.reorderSections({ sectionIds: data.sectionIds });
  }

  onDeleteSection(sectionId: string): void {
    this.tabsStore.deleteSection({ sectionId });
  }

  onToggleSectionCollapse(sectionId: string): void {
    this.tabsStore.toggleSectionCollapse(sectionId);
  }

  // ==========================================================================
  // DOCUMENT OPERATIONS
  // ==========================================================================

  onDocumentMove(data: { documentId: string; target: DocumentDropTarget }): void {
    this.tabsStore.moveDocument(data);
  }

  onDocumentsReorder(data: { tabId: string; sectionId: string | null; documentIds: string[] }): void {
    this.tabsStore.reorderDocuments(data);
  }

  onDocumentAdd(data: { documentId: string; tabId: string; sectionId: string | null; position: number }): void {
    this.tabsStore.addDocumentToTab({
      documentId: data.documentId,
      tabId: data.tabId,
      sectionId: data.sectionId,
      position: data.position,
    });
  }

  onDocumentAddToSection(data: { documentId: string; sectionId: string }): void {
    const tabId = this.selectedTabId();
    if (!tabId) return;

    this.tabsStore.addDocumentToTab({
      documentId: data.documentId,
      tabId,
      sectionId: data.sectionId,
    });
  }

  openDocument(id: string): void {
    this.router.navigate(['/documents', id]);
  }

  openDatabase(databaseId: string): void {
    this.router.navigate(['/bdd', databaseId]);
  }

  createNewDocument(): void {
    const currentProject = this.currentProject();
    if (!currentProject) {
      this.snackBar.open('Veuillez sélectionner un projet', 'OK', { duration: 3000 });
      return;
    }

    // Create document with project_id
    this.documentStore.createDocument({
      document: {
        title: 'Nouveau document',
        content: { type: 'doc', content: [] },
        project_id: currentProject.id
      }
    });
  }

  openMarkdownImportDialog(): void {
    const currentProject = this.currentProject();
    if (!currentProject) {
      this.snackBar.open('Veuillez sélectionner un projet', 'OK', { duration: 3000 });
      return;
    }

    const dialogRef = this.dialog.open(MarkdownImportDialogComponent, {
      width: '600px',
      disableClose: true,
      data: { projectId: currentProject.id }
    });

    dialogRef.afterClosed().subscribe((doc: Document | null) => {
      if (doc) {
        this.snackBar.open('Document Markdown importé avec succès', 'OK', {
          duration: 3000
        });
        // Reload documents for current project
        this.documentStore.loadDocumentsByProject({ projectId: currentProject.id });
      }
    });
  }

  onDeleteDocument(data: { event: Event; documentId: string }): void {
    this.deleteDocument(data.event, data.documentId);
  }

  async deleteDocument(event: Event, id: string): Promise<void> {
    event.stopPropagation();

    // 1. Récupérer le document pour extraire les bases de données
    const doc = this.documentMap().get(id);
    if (!doc) {
      this.snackBar.open('Document introuvable', 'OK', { duration: 3000 });
      return;
    }

    // 2. Extraire les IDs de bases de données du contenu
    const databaseIds = this.documentStore.extractDatabaseIds(doc.content);

    // 3. Ouvrir le dialog de confirmation
    const dialogRef = this.dialog.open(DeleteDocumentDialogComponent, {
      width: '500px',
      data: {
        documentTitle: doc.title,
        databaseCount: databaseIds.length
      }
    });

    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.performDelete(id, databaseIds);
      }
    });
  }

  private performDelete(documentId: string, databaseIds: string[]): void {
    const doc = this.documentMap().get(documentId);
    const documentTitle = doc?.title || 'Document sans titre';
    const projectId = doc?.project_id ?? undefined;

    // 1. Soft-delete embedded databases (set deleted_at + register in trash_items)
    const softDeleteDatabases$ = databaseIds.length > 0
      ? forkJoin(
          databaseIds.map(dbId =>
            this.databaseStore.softDeleteDatabase(dbId).pipe(
              switchMap((metadata) =>
                this.trashService.softDeleteTrashOnly(
                  'database',
                  metadata.id,
                  'document_databases',
                  metadata.name || dbId,
                  { databaseId: dbId, documentId },
                )
              ),
              catchError(err => {
                console.error(`[deleteDocument] Erreur soft-delete base ${dbId}:`, err);
                return of(null);
              })
            )
          )
        )
      : of([]);

    // 2. After soft-deleting databases, soft-delete the document via store
    softDeleteDatabases$.subscribe({
      next: () => {
        this.documentStore.deleteDocument({ documentId, documentTitle, projectId });
      },
      error: (err) => {
        console.error('[deleteDocument] Erreur soft-delete bases:', err);
        this.snackBar.open('Erreur lors de la suppression des bases de données', 'OK', {
          duration: 5000
        });
      }
    });
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  /**
   * Get child documents for a given parent document
   */
  getChildDocuments(parentId: string): Document[] {
    const allDocs = this.allDocumentsSignal();
    return allDocs.filter(doc => doc.parent_id === parentId);
  }

  /**
   * Get storage files for a document
   */
  getStorageFiles(documentId: string): DocumentStorageFile[] {
    return this.documentStorageFiles().get(documentId) || [];
  }

  // ==========================================================================
  // DRAG & DROP FROM UNORGANIZED DOCUMENTS
  // ==========================================================================

  /**
   * Handle drop event from the unorganized documents zone
   * When a document is dropped back into unorganized zone (from a tab)
   */
  onUnorganizedDrop(event: CdkDragDrop<Document[]>): void {
    // If dropped in the same container (unorganized), ignore
    if (event.previousContainer === event.container) {
      return;
    }

    // Get the dragged item data
    const dragData = event.item.data;

    // If it's coming from an organized tab, remove it from that tab
    if (dragData && dragData.document_id && !dragData.isUnorganized) {
      this.tabsStore.removeDocumentFromTab({ documentId: dragData.document_id });
    }
  }
}
