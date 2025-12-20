import { Component, OnInit, OnDestroy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { DocumentService, Document, DocumentStorageFile } from '../services/document.service';
import { DatabaseService } from '../services/database.service';
import { DeleteDocumentDialogComponent } from '../components/delete-document-dialog/delete-document-dialog.component';
import { MarkdownImportDialogComponent } from '../components/markdown-import-dialog/markdown-import-dialog.component';
import { DocumentTabBarComponent } from '../components/document-tab-bar/document-tab-bar.component';
import { DocumentTabContentComponent } from '../components/document-tab-content/document-tab-content.component';
import { FabStore } from '../../../core/stores/fab.store';
import { DocumentTabsStore } from '../store/document-tabs.store';
import { AppState } from '../../../app.state';
import { selectSelectedProject } from '../../projects/store/project.selectors';
import { selectAllDocuments, selectDocumentsLoading } from '../store/document.selectors';
import * as DocumentActions from '../store/document.actions';
import { DocumentDropTarget, UpdateDocumentTab, UpdateDocumentSection } from '../models/document-tabs.model';

@Component({
  selector: 'app-document-list',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatCardModule,
    DragDropModule,
    DocumentTabBarComponent,
    DocumentTabContentComponent,
  ],
  templateUrl: './document-list.component.html',
  styleUrls: ['./document-list.component.scss']
})
export class DocumentListComponent implements OnInit, OnDestroy {
  private documentService = inject(DocumentService);
  private databaseService = inject(DatabaseService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private fabStore = inject(FabStore);
  private store = inject(Store<AppState>);
  private tabsStore = inject(DocumentTabsStore);
  private pageId = crypto.randomUUID();

  // Signals from NgRx Store
  private selectedProjectSignal = toSignal(this.store.select(selectSelectedProject));
  private allDocumentsSignal = toSignal(this.store.select(selectAllDocuments), { initialValue: [] });
  private loadingSignal = toSignal(this.store.select(selectDocumentsLoading), { initialValue: true });

  // Tabs Store signals
  tabs = this.tabsStore.sortedTabs;
  selectedTabId = this.tabsStore.selectedTabId;
  selectedTabWithItems = this.tabsStore.selectedTabWithItems;
  allDropListIds = this.tabsStore.allDropListIds;
  tabsLoading = this.tabsStore.isLoading;

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

  // Computed: Map of documents for quick lookup
  documentMap = computed(() => {
    const docs = this.documents();
    const map = new Map<string, Document>();
    docs.forEach(doc => map.set(doc.id, doc));
    return map;
  });

  // Computed: Documents not in any tab (unorganized)
  unorganizedDocuments = computed(() => {
    const docs = this.documents();
    const organizedIds = this.tabsStore.organizedDocumentIds();
    return docs.filter(doc => !organizedIds.has(doc.id));
  });

  loading = this.loadingSignal;
  currentProject = this.selectedProjectSignal;

  // Map to store storage files for each document
  documentStorageFiles = signal<Map<string, DocumentStorageFile[]>>(new Map());

  constructor() {
    // Effect: load documents and tabs when selected project changes
    effect(() => {
      const project = this.selectedProjectSignal();
      if (project) {
        this.store.dispatch(DocumentActions.loadDocumentsByProject({ projectId: project.id }));
        this.tabsStore.loadTabs({ projectId: project.id });
      }
    });

    // Effect: load storage files when documents change
    effect(() => {
      const docs = this.documents();
      if (docs.length > 0) {
        this.loadStorageFilesForDocuments(docs);
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

  openDocument(id: string): void {
    this.router.navigate(['/documents', id]);
  }

  createNewDocument(): void {
    const currentProject = this.currentProject();
    if (!currentProject) {
      this.snackBar.open('Veuillez sélectionner un projet', 'OK', { duration: 3000 });
      return;
    }

    // Create document with project_id
    this.store.dispatch(DocumentActions.createDocument({
      document: {
        title: 'Nouveau document',
        content: { type: 'doc', content: [] },
        project_id: currentProject.id
      }
    }));
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
        this.store.dispatch(DocumentActions.loadDocumentsByProject({ projectId: currentProject.id }));
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
    const databaseIds = this.documentService.extractDatabaseIds(doc.content);

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
    // 1. Supprimer les bases de données en cascade (parallèle)
    const deleteDatabases$ = databaseIds.length > 0
      ? forkJoin(
          databaseIds.map(dbId =>
            this.databaseService.deleteDatabase(dbId).pipe(
              catchError(err => {
                console.error(`[deleteDocument] Erreur suppression base ${dbId}:`, err);
                return of(false); // Continue même si une base échoue
              })
            )
          )
        )
      : of([]);

    // 2. Après suppression des bases, supprimer le document via store
    deleteDatabases$.subscribe({
      next: () => {
        // Dispatch delete action to NgRx store
        this.store.dispatch(DocumentActions.deleteDocument({ documentId }));

        if (databaseIds.length > 0) {
          this.snackBar.open(
            `Document supprimé avec ${databaseIds.length} base(s) de données`,
            'OK',
            { duration: 5000 }
          );
        }
      },
      error: (err) => {
        console.error('[deleteDocument] Erreur suppression bases:', err);
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
