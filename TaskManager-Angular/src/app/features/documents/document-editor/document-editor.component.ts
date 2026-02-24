import { Component, OnDestroy, OnInit, inject, signal, computed, ViewEncapsulation, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Editor, JSONContent } from '@tiptap/core';
import { EditorView } from '@tiptap/pm/view';
import { TextSelection } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extension-placeholder';
import { EnhancedImage } from '../extensions/enhanced-image.extension';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { CustomTableCell, CustomTableHeader } from '../extensions/table-cell-background.extension';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { Gapcursor } from '@tiptap/extension-gapcursor';
import { Dropcursor } from '@tiptap/extension-dropcursor';
import GlobalDragHandle from 'tiptap-extension-global-drag-handle';
import { TiptapEditorDirective } from 'ngx-tiptap';
import { all, createLowlight } from 'lowlight';
import { SlashMenuComponent, SlashCommand } from '../slash-menu/slash-menu.component';
import { BubbleMenuComponent } from '../bubble-menu/bubble-menu.component';
import { DocumentService, Document, DocumentBreadcrumb } from '../services/document.service';
import { FabStore } from '../../../core/stores/fab.store';
import { RealtimeService } from '../../../core/services/realtime.service';
import { RealtimeCooldown } from '../../../core/utils/realtime-cooldown';
import { debounceTime, Subject, takeUntil, map, catchError, throwError, take, forkJoin, filter } from 'rxjs';
import { DocumentState, DocumentSnapshot, createSnapshot, hasChanges } from '../models/document-content.types';
import { Columns, Column } from '../extensions/columns.extension';
import { AccordionGroup, AccordionItem, AccordionTitle, AccordionContent } from '../extensions/accordion.extension';
import { AccordionSettingsPopoverComponent, AccordionSettings } from '../components/accordion-settings-popover/accordion-settings-popover.component';
import { DatabaseRow, DatabaseColumn, DocumentDatabase, CellValue, createTaskDatabaseConfig, PROPERTY_COLORS, PropertyColor, getDefaultColumnColor, LinkedItem } from '../models/database.model';
import { FontSize } from '../extensions/font-size.extension';
import { TextStyle } from '@tiptap/extension-text-style';
import { FontFamily } from '@tiptap/extension-font-family';
import { Color } from '@tiptap/extension-color';
import { Highlight } from '@tiptap/extension-highlight';
import { TextAlign } from '@tiptap/extension-text-align';
import { Link } from '@tiptap/extension-link';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TaskSearchModalComponent } from '../components/task-search-modal/task-search-modal.component';
import { ImageInsertDialogComponent, ImageInsertDialogData, ImageInsertDialogResult } from '../components/image-insert-dialog/image-insert-dialog.component';
import { ImageBubbleMenuComponent } from '../components/image-bubble-menu/image-bubble-menu.component';
import { TableBubbleMenuComponent } from '../components/table-bubble-menu/table-bubble-menu.component';
import { NewDocumentDialogComponent, NewDocumentDialogResult } from '../components/new-document-dialog/new-document-dialog';
import { ExternalLinkDialogComponent, ExternalLinkDialogData, ExternalLinkDialogResult } from '../components/external-link-dialog/external-link-dialog.component';
import { DocumentUploadDialogComponent, DocumentUploadDialogData, DocumentUploadDialogResult } from '../components/document-upload-dialog/document-upload-dialog.component';
import { TaskMention, TaskMentionAttributes } from '../extensions/task-mention.extension';
import { TaskSearchResult, TaskMentionData } from '../models/document-task-relation.model';
import { DocumentTasksSectionComponent } from '../components/document-tasks-section/document-tasks-section';
import { TaskSectionExtension } from '../extensions/task-section.extension';
import { TaskSectionRendererDirective } from '../directives/task-section-renderer.directive';
import { DatabaseTableExtension } from '../extensions/database-table.extension';
import { DatabaseTableRendererDirective } from '../directives/database-table-renderer.directive';
import { DatabaseService } from '../services/database.service';
import { DEFAULT_DATABASE_CONFIG } from '../models/database.model';
import { StorageService } from '../../../core/services/storage.service';
import { DocumentStore } from '../store/document.store';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { DeleteChildDocumentDialogComponent, DeleteChildDocumentDialogData } from '../components/delete-child-document-dialog/delete-child-document-dialog.component';
import { BlockIdExtension, extractBlockIdsFromContent, setCommentBadgeClickHandler } from '../extensions/block-id.extension';
import { BlockCommentService } from '../services/block-comment.service';
import { BlockComment, BlockCommentsMap } from '../models/block-comment.model';
import { CommentThreadPanelComponent } from '../components/comment-thread-panel/comment-thread-panel.component';
import { CommentIndicatorDirective } from '../directives/comment-indicator.directive';
import { MindmapExtension } from '../extensions/mindmap.extension';
import { MindmapRendererDirective } from '../directives/mindmap-renderer.directive';
import { SpreadsheetExtension } from '../extensions/spreadsheet.extension';
import { SpreadsheetRendererDirective } from '../directives/spreadsheet-renderer.directive';
import { AddToEventDialogComponent, AddToEventDialogData } from '../../calendar/components/add-to-event-dialog/add-to-event-dialog.component';
import { DocumentExportService } from '../services/document-export.service';

const lowlight = createLowlight(all);

@Component({
  selector: 'app-document-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatIconModule, TiptapEditorDirective, SlashMenuComponent, BubbleMenuComponent, ImageBubbleMenuComponent, TableBubbleMenuComponent, TaskSectionRendererDirective, DatabaseTableRendererDirective, CommentThreadPanelComponent, CommentIndicatorDirective, MindmapRendererDirective, SpreadsheetRendererDirective, AccordionSettingsPopoverComponent],
  templateUrl: './document-editor.component.html',
  styleUrl: './document-editor.component.scss',
  encapsulation: ViewEncapsulation.None
})
export class DocumentEditorComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private documentService = inject(DocumentService);
  private fabStore = inject(FabStore);
  private dialog = inject(MatDialog);
  private databaseService = inject(DatabaseService);
  private storageService = inject(StorageService);
  private blockCommentService = inject(BlockCommentService);
  private documentStore = inject(DocumentStore);
  private documentExportService = inject(DocumentExportService);
  private realtimeService = inject(RealtimeService);
  private pageId = crypto.randomUUID();
  private realtimeCooldown = new RealtimeCooldown();

  // Track document file URLs for cleanup when links are deleted
  private previousDocumentFileUrls = new Set<string>();
  // Track internal document links for cleanup when links are deleted
  private previousDocumentLinkIds = new Set<string>();
  private isComponentDestroying = false;
  private isInsertingDocumentFile = false;
  private isInsertingDocumentLink = false;
  private isLoadingDocument = false;

  editor: Editor;
  showSlashMenu = signal(false);
  slashMenuPosition = signal({ top: 0, left: 0 });
  slashMenuIndex = signal(0);
  slashFilterText = signal<string>('');

  // Accordion settings popover
  showAccordionPopover = signal(false);
  accordionPopoverPosition = signal({ top: 0, left: 0 });
  accordionEditingTitlePos = signal<number>(-1);
  accordionCurrentIcon = signal('description');
  accordionCurrentIconColor = signal('#3b82f6');
  accordionCurrentTitleColor = signal('#1f2937');

  // Bubble menu (text selection)
  showBubbleMenu = signal(false);
  bubbleMenuPosition = signal({ top: 0, left: 0 });
  isDragging = signal(false);
  bubbleMenuDisabled = signal(false); // Temporarily disable bubble menu after drag

  // Unified document state (single source of truth)
  documentState = signal<DocumentState>({
    id: null,
    title: 'Sans titre',
    content: {},
    isDirty: false,
    isSaving: false,
    lastSaved: null,
    database_id: null,
    database_row_id: null
  });

  // Breadcrumb hierarchy
  breadcrumbs = signal<DocumentBreadcrumb[]>([]);

  // Origin context for breadcrumb root
  breadcrumbRoot = computed(() => {
    const from = this.route.snapshot.queryParamMap.get('from');
    if (from === 'calendar') {
      return { label: 'Calendrier', route: '/calendar' };
    }
    return { label: 'Documents', route: '/documents' };
  });

  // Database row properties (for Notion-style database pages)
  isDatabaseRowDocument = computed(() => {
    const doc = this.documentState();
    return !!(doc.id && doc.database_id);
  });

  databaseMetadata = signal<DocumentDatabase | null>(null);
  databaseRow = signal<DatabaseRow | null>(null);
  isLoadingDatabaseProperties = signal(false);
  propertiesPanelOpen = signal(false); // Panel overlay state

  // Block comments state
  commentPanelOpen = signal(false);
  selectedBlockId = signal<string | null>(null);
  blockComments = signal<BlockCommentsMap>({});
  blocksWithComments = signal<Set<string>>(new Set());
  currentUserId = signal<string | null>(null);

  // Computed: comment counts per block for indicators
  blockCommentCounts = computed(() => {
    const comments = this.blockComments();
    const counts = new Map<string, number>();
    for (const [blockId, commentList] of Object.entries(comments)) {
      counts.set(blockId, commentList.length);
    }
    return counts;
  });

  // Editable properties (Notion-style click-to-edit)
  editingPropertyId = signal<string | null>(null);
  tempPropertyValue = signal<CellValue>(null);
  @ViewChild('propertyInput') propertyInput?: ElementRef<HTMLInputElement>;

  // Editable title in breadcrumb
  isEditingTitle = signal(false);
  tempTitle = signal('');
  @ViewChild('titleInput') titleInput?: ElementRef<HTMLInputElement>;

  // Snapshot for dirty tracking
  private originalSnapshot = signal<DocumentSnapshot | null>(null);

  // Computed dirty state
  isDirty = computed(() => {
    const current = this.documentState();
    const original = this.originalSnapshot();
    const dirty = hasChanges(createSnapshot(current), original);
    return dirty;
  });

  private destroy$ = new Subject<void>();
  private changeSubject = new Subject<void>();

  // Callback for directives to trigger manual save
  saveDocumentCallback = () => {
    // Force content update from editor before saving
    if (this.editor) {
      const currentContent = this.editor.getJSON();
      this.documentState.update(state => ({
        ...state,
        content: currentContent
      }));
    }
    this.saveDocument();
  };

  menuItems: SlashCommand[] = [
    // Texte et titres
    { id: 'text', label: 'Texte', icon: 'text_fields', action: () => this.editor.chain().focus().setParagraph().run() },
    { id: 'h1', label: 'Titre 1', icon: 'looks_one', action: () => this.editor.chain().focus().toggleHeading({ level: 1 }).run() },
    { id: 'h2', label: 'Titre 2', icon: 'looks_two', action: () => this.editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { id: 'h3', label: 'Titre 3', icon: 'looks_3', action: () => this.editor.chain().focus().toggleHeading({ level: 3 }).run() },

    // Listes
    { id: 'bulletList', label: 'Liste à puces', icon: 'format_list_bulleted', action: () => this.editor.chain().focus().toggleBulletList().run() },
    { id: 'orderedList', label: 'Liste numérotée', icon: 'format_list_numbered', action: () => this.editor.chain().focus().toggleOrderedList().run() },
    { id: 'taskList', label: 'Liste de tâches', icon: 'check_box', action: () => this.editor.chain().focus().toggleTaskList().run() },

    // Formatage avancé
    { id: 'quote', label: 'Citation', icon: 'format_quote', action: () => this.editor.chain().focus().toggleBlockquote().run() },
    { id: 'divider', label: 'Séparateur', icon: 'horizontal_rule', action: () => this.editor.chain().focus().setHorizontalRule().run() },
    { id: 'codeBlock', label: 'Bloc de code', icon: 'integration_instructions', action: () => this.editor.chain().focus().toggleCodeBlock().run() },
    { id: 'code', label: 'Code inline', icon: 'code', action: () => this.editor.chain().focus().toggleCode().run() },

    // Éléments structurels
    { id: 'table', label: 'Tableau', icon: 'table_chart', action: () => this.addTable() },
    { id: 'image', label: 'Image', icon: 'image', action: () => this.addImage() },
    { id: 'uploadDoc', label: 'Upload document', icon: 'upload_file', action: () => this.addDocumentFile() },
    { id: 'link', label: 'Lien externe', icon: 'link', action: () => this.addExternalLink() },
    { id: 'columns2', label: '2 Colonnes', icon: 'view_column', action: () => this.editor.chain().focus().setColumns(2).run() },
    { id: 'columns3', label: '3 Colonnes', icon: 'view_week', action: () => this.editor.chain().focus().setColumns(3).run() },
    { id: 'accordion', label: 'Accordéon', icon: 'expand_circle_down', action: () => this.editor.chain().focus().insertAccordion(1).run() },
    { id: 'newDocument', label: 'Nouvelle page', icon: 'note_add', action: () => this.createLinkedDocument() },

    // Base de données
    { id: 'database', label: 'Base de données', icon: 'table_view', action: () => this.insertDatabase() },
    { id: 'taskDatabase', label: 'Base de données de tâches', icon: 'task_alt', action: () => this.insertTaskDatabase() },

    // Mind Map
    { id: 'mindmap', label: 'Mind Map', icon: 'hub', action: () => this.insertMindmap() },

    // Feuille de calcul
    { id: 'spreadsheet', label: 'Feuille de calcul', icon: 'grid_on', action: () => this.insertSpreadsheet() },

    // Utilitaires
    { id: 'break', label: 'Saut de ligne', icon: 'keyboard_return', action: () => this.editor.chain().focus().setHardBreak().run() },
    { id: 'clear', label: 'Effacer format', icon: 'format_clear', action: () => this.editor.chain().focus().clearNodes().unsetAllMarks().run() },
  ];

  constructor() {
    // Initialize editor WITHOUT content or element (ngx-tiptap handles DOM)
    this.editor = new Editor({
      extensions: [
        StarterKit.configure({
          codeBlock: false, // Disable CodeBlock from StarterKit (using CodeBlockLowlight instead)
          dropcursor: false, // Disable default dropcursor (using custom one)
          gapcursor: false, // Disable default gapcursor (using custom one)
          link: false, // Disable default Link (using custom configured one below)
        }),
        Placeholder.configure({
          placeholder: 'Tapez \'/\' pour afficher les commandes...',
          emptyEditorClass: 'is-editor-empty',
        }),
        Gapcursor,
        Dropcursor.configure({
          color: '#3b82f6',
          width: 3,
        }),
        GlobalDragHandle.configure({
          dragHandleWidth: 40,
        }),
        EnhancedImage.configure({
          inline: false,
          allowBase64: false,
          HTMLAttributes: {
            class: 'tiptap-image',
          },
          resize: {
            enabled: true,
            directions: ['bottom', 'right', 'bottom-right'],
            minWidth: 100,
            minHeight: 100,
            alwaysPreserveAspectRatio: true,
          },
        }),
        TaskList,
        TaskItem.configure({
          nested: true, // Enable nested task lists
        }),
        Table.configure({ resizable: true }),
        TableRow,
        CustomTableHeader,
        CustomTableCell,
        CodeBlockLowlight.configure({ lowlight }),
        Columns,
        Column,
        AccordionGroup,
        AccordionItem,
        AccordionTitle,
        AccordionContent,
        TextStyle,
        FontFamily,
        FontSize,
        Color,
        Highlight.configure({ multicolor: true }),
        TextAlign.configure({
          types: ['heading', 'paragraph'],
        }),
        Link.configure({
          openOnClick: true,
          HTMLAttributes: {
            class: 'document-link',
          },
        }),
        TaskMention.configure({
          onTaskClick: (taskId: string) => this.navigateToTask(taskId),
        }),
        TaskSectionExtension,
        DatabaseTableExtension,
        BlockIdExtension,
        MindmapExtension,
        SpreadsheetExtension,
      ],
      editorProps: {
        attributes: {
          // Remove all attributes that could add borders/outlines
          class: '',
          style: 'outline: none; border: none;'
        },
        handleKeyDown: (view: EditorView, event: KeyboardEvent) => this.handleKeyDown(view, event),
        handleClick: (_view: EditorView, _pos: number, _event: MouseEvent) => {
          // Allow default click behavior for node selection and dragging
          return false;
        },
        // Enable native drag & drop for blocks
        handleDOMEvents: {
          mousedown: (view: EditorView, event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (target.classList.contains('drag-handle') || target.closest('.drag-handle')) {
              this.isDragging.set(true);
              this.showBubbleMenu.set(false);
            }
            return false;
          },
          dragstart: (view: EditorView, event: DragEvent) => {
            this.isDragging.set(true);
            this.bubbleMenuDisabled.set(true);
            this.showBubbleMenu.set(false);
            return false;
          },
          drag: () => {
            if (!this.isDragging()) {
              this.isDragging.set(true);
            }
            this.showBubbleMenu.set(false);
            return false;
          },
          dragend: () => {
            setTimeout(() => {
              this.isDragging.set(false);
            }, 150);
            return false;
          },
          drop: (view: EditorView) => {
            this.showBubbleMenu.set(false);
            setTimeout(() => {
              this.bubbleMenuDisabled.set(false);
              this.isDragging.set(false);
            }, 300);
            return false;
          },
          mouseup: () => {
            if (this.isDragging()) {
              setTimeout(() => this.isDragging.set(false), 150);
            }
            return false;
          }
        }
      },
      onUpdate: ({ editor }) => {
        this.handleContentChange(editor.getJSON());
      },
      onSelectionUpdate: ({ editor }) => {
        // Check if ProseMirror is in drag mode (has hideselection class)
        const isDraggingNow = editor.view.dom.classList.contains('ProseMirror-hideselection');

        // If ProseMirror is hiding selection, we're dragging - block bubble menu
        if (isDraggingNow) {
          this.showBubbleMenu.set(false);
          this.bubbleMenuDisabled.set(true);
          return;
        }

        // Skip bubble menu updates during drag operations or when disabled
        if (!this.isDragging() && !this.bubbleMenuDisabled()) {
          this.updateBubbleMenu(editor);
        }
      }
    });

    // Unified auto-save (handles both title and content changes)
    this.changeSubject.pipe(
      debounceTime(2000),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.saveDocument();
    });

    // Register FAB once - isDirty is passed as a signal for reactive updates
    this.fabStore.registerPage(
      {
        context: {
          currentPage: 'document-editor',
          isDirty: false,
          hasUnsavedChanges: false
        },
        actions: [
          {
            id: 'export-print',
            icon: 'print',
            label: 'Imprimer / PDF',
            tooltip: 'Ouvrir une version imprimable du document',
            action: () => this.exportForPrint(),
            color: 'accent'
          },
          {
            id: 'add-to-event',
            icon: 'event',
            label: 'Lier à un événement',
            tooltip: 'Ajouter ce document à un événement du calendrier',
            action: () => this.openAddToEventDialog(),
            color: 'accent'
          }
        ],
        onSave: () => this.saveDocument(),
        isDirtySignal: this.isDirty
      },
      this.pageId
    );
  }

  // Handle content changes from editor
  private handleContentChange(content: JSONContent) {
    // Detect and cleanup deleted document files
    this.cleanupDeletedDocumentFiles(content);
    // Detect and cleanup deleted document links (child pages)
    this.cleanupDeletedDocumentLinks(content);

    this.documentState.update(state => ({
      ...state,
      content
    }));
    this.changeSubject.next();
  }

  /**
   * Extract all document file URLs from the editor content
   * These are URLs pointing to the 'documents-files' bucket
   */
  private extractDocumentFileUrls(content: JSONContent): Set<string> {
    const urls = new Set<string>();

    const traverse = (node: JSONContent) => {
      // Check if this node has a link mark pointing to documents-files bucket
      if (node.marks) {
        for (const mark of node.marks) {
          if (mark.type === 'link' && mark.attrs?.['href']) {
            const href = mark.attrs['href'] as string;
            if (href.includes('/documents-files/')) {
              urls.add(href);
            }
          }
        }
      }

      // Recursively process children
      if (node.content) {
        for (const child of node.content) {
          traverse(child);
        }
      }
    };

    traverse(content);
    return urls;
  }

  /**
   * Extract the storage path from a Supabase public URL
   * Example: https://xxx.supabase.co/storage/v1/object/public/documents-files/documents/123/files/file.pdf
   * Returns: documents/123/files/file.pdf
   */
  private extractStoragePathFromUrl(url: string): string | null {
    const match = url.match(/\/documents-files\/(.+)$/);
    return match ? match[1] : null;
  }

  /**
   * Detect deleted document files and prompt for removal from storage
   */
  private cleanupDeletedDocumentFiles(newContent: JSONContent) {
    // Don't trigger cleanup when component is being destroyed, during insertion, or during document loading
    if (this.isComponentDestroying || this.isInsertingDocumentFile || this.isLoadingDocument) {
      return;
    }

    const currentUrls = this.extractDocumentFileUrls(newContent);

    // Find URLs that were in previous content but not in current
    const deletedUrls = [...this.previousDocumentFileUrls].filter(url => !currentUrls.has(url));

    // Update the tracked URLs immediately
    this.previousDocumentFileUrls = currentUrls;

    // Prompt for deletion of each removed file
    for (const url of deletedUrls) {
      const path = this.extractStoragePathFromUrl(url);
      if (path) {
        // Extract filename from path for the dialog message
        const fileName = path.split('/').pop() || 'le fichier';

        this.confirmAndDeleteFile(path, fileName);
      }
    }
  }

  /**
   * Show confirmation dialog and delete file if confirmed
   */
  private confirmAndDeleteFile(path: string, fileName: string) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Supprimer le document',
        message: `Voulez-vous également supprimer le fichier "${fileName}" du stockage ?`
      } as ConfirmDialogData
    });

    dialogRef.afterClosed().subscribe((confirmed: boolean) => {
      if (confirmed) {
        console.log('Deleting document file from storage:', path);
        this.storageService.deleteFile('documents-files', path)
          .then(() => console.log('Successfully deleted:', path))
          .catch(err => console.error('Failed to delete file:', path, err));
      } else {
        console.log('File deletion cancelled, file remains in storage:', path);
      }
    });
  }

  /**
   * Initialize the document file URLs tracking when content is loaded
   */
  private initializeDocumentFileTracking(content: JSONContent) {
    this.previousDocumentFileUrls = this.extractDocumentFileUrls(content);
  }

  /**
   * Extract all internal document link IDs from the editor content
   * These are links in the format /documents/{id}
   */
  private extractDocumentLinkIds(content: JSONContent): Set<string> {
    const ids = new Set<string>();

    const traverse = (node: JSONContent) => {
      // Check if this node has a link mark pointing to internal documents
      if (node.marks) {
        for (const mark of node.marks) {
          if (mark.type === 'link' && mark.attrs?.['href']) {
            const href = mark.attrs['href'] as string;
            // Match internal document links: /documents/{uuid}
            const match = href.match(/^\/documents\/([a-f0-9-]{36})$/i);
            if (match) {
              ids.add(match[1]);
            }
          }
        }
      }

      // Recursively process children
      if (node.content) {
        for (const child of node.content) {
          traverse(child);
        }
      }
    };

    traverse(content);
    return ids;
  }

  /**
   * Initialize the document link IDs tracking when content is loaded
   */
  private initializeDocumentLinkTracking(content: JSONContent) {
    this.previousDocumentLinkIds = this.extractDocumentLinkIds(content);
  }

  /**
   * Detect deleted document links and prompt for cascade deletion
   */
  private cleanupDeletedDocumentLinks(newContent: JSONContent) {
    // Don't trigger cleanup when component is being destroyed, during insertion, or during document loading
    if (this.isComponentDestroying || this.isInsertingDocumentLink || this.isLoadingDocument) {
      return;
    }

    const currentDocId = this.documentState().id;
    if (!currentDocId) {
      return;
    }

    const currentIds = this.extractDocumentLinkIds(newContent);

    // Find IDs that were in previous content but not in current
    const deletedIds = [...this.previousDocumentLinkIds].filter(id => !currentIds.has(id));

    // Update the tracked IDs immediately
    this.previousDocumentLinkIds = currentIds;

    // Check each deleted link - only prompt for child documents
    for (const deletedDocId of deletedIds) {
      this.checkAndPromptChildDocumentDeletion(deletedDocId, currentDocId);
    }
  }

  /**
   * Check if a document is a child of current document and prompt for deletion
   */
  private async checkAndPromptChildDocumentDeletion(documentId: string, parentId: string) {
    // Check if this document is a direct child of the current document
    const isChild = await this.documentService.isChildDocument(documentId, parentId);

    if (!isChild) {
      // Not a child document, just a link - don't prompt for deletion
      return;
    }

    // Get document info for the dialog
    const docInfo = await this.documentService.getDocumentBasicInfo(documentId);
    if (!docInfo) {
      return;
    }

    // Get cascade delete info (count of descendants and databases)
    const cascadeInfo = await this.documentService.getCascadeDeleteInfo(documentId);

    // Open confirmation dialog
    const dialogRef = this.dialog.open(DeleteChildDocumentDialogComponent, {
      width: '500px',
      data: {
        documentTitle: docInfo.title || 'Sans titre',
        childDocumentCount: cascadeInfo.childDocumentCount,
        databaseCount: cascadeInfo.databaseCount
      } as DeleteChildDocumentDialogData
    });

    dialogRef.afterClosed().subscribe((confirmed: boolean) => {
      if (confirmed) {
        const documentTitle = docInfo.title || 'Sans titre';
        const projectId = this.documentState().project_id ?? undefined;
        this.documentStore.deleteDocument({ documentId, documentTitle, projectId });
      }
    });
  }

  // Handle title changes from input
  onTitleChange(newTitle: string) {
    const capitalizedTitle = this.capitalizeFirstLetter(newTitle);
    const state = this.documentState();

    this.documentState.update(s => ({
      ...s,
      title: capitalizedTitle
    }));
    this.changeSubject.next();

    // Sync title to database row if this is a database row document
    if (state.database_id && state.database_row_id) {
      this.databaseService.syncDocumentTitleToRow(
        state.database_id,
        state.database_row_id,
        capitalizedTitle
      ).pipe(takeUntil(this.destroy$))
        .subscribe({
          error: (err) => console.error('Failed to sync title to database:', err)
        });
    }
  }

  private capitalizeFirstLetter(text: string): string {
    if (!text) return text;
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  ngOnInit() {
    // Load current user ID for comment ownership
    this.loadCurrentUser();

    // Set up comment badge click handler
    setCommentBadgeClickHandler((blockId: string) => {
      this.openCommentPanel(blockId);
    });

    // Listen for accordion icon edit events
    this.setupAccordionIconEditListener();

    // Listen for accordion delete item events
    this.setupAccordionDeleteListener();

    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
      if (params['id']) {
        this.loadDocument(params['id']);
      }
    });

    // Realtime: reload document when another session saves it
    this.realtimeService.onTableChange('documents').pipe(
      debounceTime(500),
      filter((event) => {
        const currentDocId = this.documentState().id;
        if (!currentDocId || event.recordId !== currentDocId) return false;
        if (this.realtimeCooldown.isActive()) return false;
        if (this.isDirty() || this.documentState().isSaving) return false;
        return true;
      }),
      takeUntil(this.destroy$),
    ).subscribe(() => {
      this.reloadDocumentFromRealtime();
    });
  }

  private setupAccordionIconEditListener() {
    // Delay setup to ensure editor DOM is ready
    setTimeout(() => {
      const editorDom = this.editor?.view?.dom;
      if (editorDom) {
        editorDom.addEventListener('accordion-icon-edit', ((event: CustomEvent) => {
          const { pos, rect } = event.detail;
          if (pos >= 0) {
            // Read current attributes from the node
            const node = this.editor.state.doc.nodeAt(pos);
            if (node && node.type.name === 'accordionTitle') {
              this.accordionCurrentIcon.set(node.attrs['icon'] || 'description');
              this.accordionCurrentIconColor.set(node.attrs['iconColor'] || '#3b82f6');
              this.accordionCurrentTitleColor.set(node.attrs['titleColor'] || '#1f2937');
            }
            this.accordionEditingTitlePos.set(pos);
            this.accordionPopoverPosition.set({
              top: rect.bottom + 4,
              left: rect.left,
            });
            this.showAccordionPopover.set(true);
          }
        }) as EventListener);
      }
    }, 500);
  }

  private setupAccordionDeleteListener() {
    setTimeout(() => {
      const editorDom = this.editor?.view?.dom;
      if (editorDom) {
        editorDom.addEventListener('accordion-delete-item', ((event: CustomEvent) => {
          const { itemPos } = event.detail;
          if (itemPos >= 0) {
            this.confirmDeleteAccordionItem(itemPos);
          }
        }) as EventListener);
      }
    }, 500);
  }

  private confirmDeleteAccordionItem(itemPos: number) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Supprimer l\'élément',
        message: 'Voulez-vous vraiment supprimer cet élément de l\'accordéon ?'
      } as ConfirmDialogData
    });

    dialogRef.afterClosed().subscribe((confirmed: boolean) => {
      if (confirmed) {
        this.editor.commands.deleteAccordionItem(itemPos);
      }
    });
  }

  onAccordionSettingsChanged(settings: AccordionSettings) {
    const pos = this.accordionEditingTitlePos();
    if (pos < 0) return;

    const node = this.editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'accordionTitle') return;

    this.editor.view.dispatch(
      this.editor.state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        icon: settings.icon,
        iconColor: settings.iconColor,
        titleColor: settings.titleColor,
      })
    );

    this.accordionCurrentIcon.set(settings.icon);
    this.accordionCurrentIconColor.set(settings.iconColor);
    this.accordionCurrentTitleColor.set(settings.titleColor);
  }

  closeAccordionPopover() {
    this.showAccordionPopover.set(false);
    this.accordionEditingTitlePos.set(-1);
  }

  /**
   * Load current user ID for comment ownership checks
   */
  private async loadCurrentUser() {
    const { data } = await this.blockCommentService.supabase.client.auth.getUser();
    if (data.user) {
      this.currentUserId.set(data.user.id);
    }
  }

  async loadDocument(id: string) {
    this.documentService.getDocument(id).subscribe({
      next: async (doc: Document | null) => {
        if (doc) {
          // Update unified state
          this.documentState.set({
            id: doc.id,
            title: doc.title,
            content: doc.content,
            isDirty: false,
            isSaving: false,
            lastSaved: doc.updated_at ? new Date(doc.updated_at) : null,
            database_id: doc.database_id || null,
            database_row_id: doc.database_row_id || null,
            project_id: doc.project_id || null
          });

          // Set original snapshot for dirty tracking
          this.originalSnapshot.set({
            title: doc.title,
            content: doc.content
          });

          // Load breadcrumb hierarchy
          const breadcrumbPath = await this.documentService.getDocumentBreadcrumb(id);
          // When coming from calendar, the root already shows "Calendrier",
          // so skip the database parent document to avoid duplication
          const from = this.route.snapshot.queryParamMap.get('from');
          if (from === 'calendar' && doc.database_id && breadcrumbPath.length > 1) {
            breadcrumbPath.shift();
          }
          this.breadcrumbs.set(breadcrumbPath);

          // Check if this document is linked to a database row (Notion-style)
          if (doc.database_id && doc.database_row_id) {
            this.loadDatabaseProperties(doc.database_id, doc.database_row_id);
          }

          // Update editor content
          if (doc.content && Object.keys(doc.content).length > 0) {
            // Set flag to prevent cleanup dialogs during document loading
            this.isLoadingDocument = true;
            this.editor.commands.setContent(doc.content);
            // Initialize tracking of document file URLs for cleanup on deletion
            this.initializeDocumentFileTracking(doc.content as JSONContent);
            // Initialize tracking of internal document links for cleanup on deletion
            this.initializeDocumentLinkTracking(doc.content as JSONContent);
            // Reset flag after initialization
            this.isLoadingDocument = false;
          } else {
            // Clear tracking for empty documents
            this.previousDocumentFileUrls.clear();
            this.previousDocumentLinkIds.clear();
          }

          // Check if we need to insert task section after creating a task
          const pendingTaskId = sessionStorage.getItem('pendingTaskMentionInsert');
          if (pendingTaskId) {
            sessionStorage.removeItem('pendingTaskMentionInsert');
            // Insert task section block if it doesn't exist
            this.ensureTaskSectionExists();
          }

          // Load and refresh task mentions (for existing ones)
          this.loadAndRefreshTaskMentions(id);

          // Load block comments for this document
          this.loadBlockComments(id);
        }
      },
      error: (err) => console.error('Error loading doc', err)
    });
  }

  /**
   * Reload document content from Supabase when a Realtime event is received.
   * Only updates title, content, and snapshot — does not reload breadcrumbs,
   * database properties, or other metadata.
   */
  private reloadDocumentFromRealtime(): void {
    const docId = this.documentState().id;
    if (!docId) return;

    this.documentService.getDocument(docId).pipe(
      take(1),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (doc) => {
        if (!doc) return;

        this.documentState.update(s => ({
          ...s,
          title: doc.title,
          content: doc.content,
          lastSaved: doc.updated_at ? new Date(doc.updated_at) : s.lastSaved,
        }));

        this.originalSnapshot.set({
          title: doc.title,
          content: doc.content,
        });

        if (this.editor && !this.editor.isDestroyed) {
          this.isLoadingDocument = true;
          this.editor.commands.setContent(doc.content);
          this.isLoadingDocument = false;
        }
      },
    });
  }

  /**
   * Load all block comments for the document
   */
  private loadBlockComments(documentId: string) {
    this.blockCommentService.getCommentsForDocument(documentId).subscribe({
      next: (comments) => {
        const grouped = this.blockCommentService.groupCommentsByBlock(comments);
        this.blockComments.set(grouped);

        const blockIds = new Set(Object.keys(grouped));
        this.blocksWithComments.set(blockIds);

        // Update editor decorations
        this.updateCommentDecorations();
      },
      error: (err) => console.error('Error loading block comments:', err)
    });
  }

  /**
   * Update ProseMirror decorations for comment indicators
   */
  private updateCommentDecorations(): void {
    if (this.editor) {
      const blockIds = this.blocksWithComments();
      const counts = this.blockCommentCounts();
      this.editor.commands.setBlocksWithComments(blockIds, counts);
    }
  }

  /**
   * Load database metadata and row data for database-linked documents
   * This enables Notion-style property editing
   */
  private loadDatabaseProperties(databaseId: string, rowId: string) {
    this.isLoadingDatabaseProperties.set(true);

    forkJoin({
      metadata: this.databaseService.getDatabaseMetadata(databaseId),
      rows: this.databaseService.getRows({ databaseId, limit: 1000 })
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ metadata, rows }: { metadata: DocumentDatabase; rows: DatabaseRow[] }) => {
          this.databaseMetadata.set(metadata);

          // Find the specific row for this document
          const row = rows.find((r: DatabaseRow) => r.id === rowId);
          if (row) {
            this.databaseRow.set(row);
          }

          this.isLoadingDatabaseProperties.set(false);
        },
        error: (err: unknown) => {
          console.error('Failed to load database properties:', err);
          this.isLoadingDatabaseProperties.set(false);
        }
      });
  }

  /**
   * Update a database property cell value
   * Syncs changes back to the database row
   */
  onUpdateDatabaseProperty(columnId: string, value: CellValue) {
    const doc = this.documentState();
    if (!doc.database_id || !doc.database_row_id) return;

    this.databaseService.updateCell({
      databaseId: doc.database_id,
      rowId: doc.database_row_id,
      columnId,
      value
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          // Update local state
          this.databaseRow.update((row: DatabaseRow | null) => {
            if (!row) return row;
            return {
              ...row,
              cells: {
                ...row.cells,
                [columnId]: value
              }
            };
          });
        },
        error: (err: unknown) => {
          console.error('Failed to update database property:', err);
          alert('Impossible de mettre à jour la propriété');
        }
      });
  }

  /**
   * Helper to safely get array value from cell (for multi-select)
   */
  getCellAsArray(cellValue: CellValue | undefined): string[] {
    if (!cellValue) return [];
    if (Array.isArray(cellValue)) return cellValue as string[];
    return [];
  }

  /**
   * Check if a column is the title column (to sync with document title)
   */
  isTitleColumn(columnName: string): boolean {
    return columnName.toLowerCase().includes('title') || columnName.toLowerCase().includes('titre');
  }

  /**
   * Check if a column is the description column (to use textarea)
   */
  isDescriptionColumn(columnName: string): boolean {
    return columnName.toLowerCase().includes('description');
  }

  /**
   * Check if a column should be narrow (status, priority, hours)
   */
  isNarrowColumn(columnName: string): boolean {
    const narrowColumns = ['status', 'statut', 'priority', 'priorité', 'hours', 'heures', 'estimated', 'estimé', 'actual'];
    return narrowColumns.some(narrow => columnName.toLowerCase().includes(narrow));
  }

  /**
   * Toggle the properties panel overlay
   */
  togglePropertiesPanel() {
    this.propertiesPanelOpen.update((open: boolean) => !open);
  }

  /**
   * Get pinned columns for display
   */
  getPinnedColumns(): DatabaseColumn[] {
    const metadata = this.databaseMetadata();
    if (!metadata) return [];

    const pinnedColumnIds = metadata.config.pinnedColumns || [];
    return metadata.config.columns.filter((col: DatabaseColumn) =>
      pinnedColumnIds.includes(col.id) &&
      col.visible !== false &&
      !this.isTitleColumn(col.name)
    );
  }

  /**
   * Check if a column is pinned
   */
  isColumnPinned(columnId: string): boolean {
    const metadata = this.databaseMetadata();
    if (!metadata) return false;
    return (metadata.config.pinnedColumns || []).includes(columnId);
  }

  /**
   * Toggle pin status for a column
   */
  toggleColumnPin(columnId: string) {
    const metadata = this.databaseMetadata();
    if (!metadata) return;

    const currentPinned = metadata.config.pinnedColumns || [];
    const isPinned = currentPinned.includes(columnId);

    const updatedPinned = isPinned
      ? currentPinned.filter((id: string) => id !== columnId)
      : [...currentPinned, columnId];

    // Update config
    const updatedConfig = {
      ...metadata.config,
      pinnedColumns: updatedPinned
    };

    // Save to database
    this.databaseService.updateDatabaseConfig(metadata.database_id, updatedConfig)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          // Update local state
          this.databaseMetadata.update((meta: DocumentDatabase | null) =>
            meta ? { ...meta, config: updatedConfig } : null
          );
        },
        error: (err: unknown) => {
          console.error('Failed to update pinned columns:', err);
        }
      });
  }

  /**
   * Start editing title in breadcrumb
   */
  startEditingTitle() {
    this.tempTitle.set(this.documentState().title || '');
    this.isEditingTitle.set(true);

    // Focus the input after render
    setTimeout(() => {
      this.titleInput?.nativeElement.focus();
      this.titleInput?.nativeElement.select();
    }, 0);
  }

  /**
   * Save edited title from breadcrumb
   */
  saveTitle() {
    const newTitle = this.capitalizeFirstLetter(this.tempTitle().trim());

    if (!newTitle) {
      // Empty title not allowed, cancel editing
      this.isEditingTitle.set(false);
      return;
    }

    if (newTitle !== this.documentState().title) {
      // Call existing onTitleChange with the new title
      this.onTitleChange(newTitle);

      // Update the breadcrumbs signal to reflect the new title immediately
      this.breadcrumbs.update(crumbs => {
        if (crumbs.length === 0) return crumbs;
        // Update the last breadcrumb (current document) with the new title
        const updated = [...crumbs];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          title: newTitle
        };
        return updated;
      });
    }

    this.isEditingTitle.set(false);
  }

  /**
   * Cancel editing title
   */
  cancelEditTitle() {
    this.isEditingTitle.set(false);
  }

  /**
   * Update document title (called from title property input)
   * This syncs the title with both the document and the database row
   */
  onUpdateDocumentTitle(newTitle: string) {
    // Update document state locally
    this.documentState.update((state: DocumentState) => ({
      ...state,
      title: newTitle,
      isDirty: true
    }));

    // Find the title column ID and update the database property
    const metadata = this.databaseMetadata();
    const titleColumn = metadata?.config.columns.find((col: DatabaseColumn) => this.isTitleColumn(col.name));
    if (titleColumn) {
      this.onUpdateDatabaseProperty(titleColumn.id, newTitle);
    }
  }

  /**
   * Helper to convert string to number
   */
  toNumber(value: string): number {
    return Number(value);
  }

  async exportForPrint(): Promise<void> {
    const title = this.documentState().title || 'Sans titre';
    const html = this.editor.getHTML();
    await this.documentExportService.exportForPrint(title, html);
  }

  openAddToEventDialog(): void {
    const state = this.documentState();
    const item: LinkedItem = {
      type: 'document',
      id: state.id!,
      label: state.title || 'Sans titre',
    };
    this.dialog.open(AddToEventDialogComponent, {
      width: '560px',
      maxHeight: '80vh',
      data: { item } as AddToEventDialogData,
    });
  }

  saveDocument() {
    const state = this.documentState();

    // Skip if already saving
    if (state.isSaving) return;

    // For new documents (no ID), always save even if not dirty
    // For existing documents, only save if dirty
    if (state.id && !this.isDirty()) return;

    // Update state: saving started + set realtime cooldown to ignore self-origin events
    this.documentState.update(s => ({ ...s, isSaving: true }));
    this.realtimeCooldown.set();

    const payload = {
      title: state.title,
      content: state.content
    };

    const save$ = state.id
      ? this.documentService.updateDocument(state.id, payload)
      : this.documentService.createDocument(payload);

    save$.pipe(takeUntil(this.destroy$)).subscribe({
      next: (doc) => {

        // Capture current state before updating
        const currentState = this.documentState();

        // Update state: save complete (keep current local content)
        this.documentState.update((s: DocumentState) => ({
          ...s,
          id: doc.id,
          isSaving: false,
          lastSaved: new Date()
        }));

        // Update snapshot to match CURRENT local state (not server content)
        // This ensures isDirty becomes false
        this.originalSnapshot.set({
          title: currentState.title,
          content: currentState.content
        });

        // Update URL if new document
        if (!state.id) {
          window.history.replaceState({}, '', `/documents/${doc.id}`);
        }
      },
      error: (err) => {
        console.error('Error saving doc', err);
        this.documentState.update(s => ({ ...s, isSaving: false }));
      }
    });
  }

  /**
   * Immediate save without debounce - returns Observable for synchronization
   * Used by database creation to ensure databaseId is persisted before refresh
   */
  saveDocumentImmediate() {
    const state = this.documentState();

    // If no document ID yet, we can't save (document must be created first)
    if (!state.id) {
      console.warn('Cannot save immediately: document not yet created');
      return new Subject<void>().asObservable();
    }

    // Force update content from editor before saving
    const currentContent = this.editor.getJSON();

    this.documentState.update(s => ({
      ...s,
      content: currentContent,
      isSaving: true
    }));

    const payload = {
      title: state.title,
      content: currentContent
    };

    return this.documentService.updateDocument(state.id, payload).pipe(
      takeUntil(this.destroy$),
      map((doc) => {
        // Update state: save complete
        this.documentState.update(s => ({
          ...s,
          isSaving: false,
          lastSaved: new Date()
        }));

        // Update snapshot (no longer dirty)
        this.originalSnapshot.set({
          title: doc.title,
          content: doc.content
        });
      }),
      catchError((err) => {
        console.error('Failed to save document immediately:', err);
        this.documentState.update(s => ({ ...s, isSaving: false }));
        return throwError(() => err);
      })
    );
  }

  handleKeyDown(view: EditorView, event: KeyboardEvent): boolean {
    if (this.showSlashMenu()) {
      // Arrow Up
      if (event.key === 'ArrowUp') {
        this.slashMenuIndex.update((i: number) => Math.max(0, i - 1));
        return true;
      }

      // Arrow Down - utiliser le nombre d'items filtrés
      if (event.key === 'ArrowDown') {
        const filteredCount = this.getFilteredItemsCount();
        this.slashMenuIndex.update((i: number) => Math.min(filteredCount - 1, i + 1));
        return true;
      }

      // Enter - exécuter sur les items filtrés
      if (event.key === 'Enter') {
        const filteredItems = this.getFilteredItems();
        this.executeCommand(filteredItems[this.slashMenuIndex()]);
        return true;
      }

      // Escape - fermer et réinitialiser le filtre
      if (event.key === 'Escape') {
        this.showSlashMenu.set(false);
        this.slashFilterText.set('');
        return true;
      }

      // Backspace - mettre à jour le filtre après que l'éditeur ait traité la touche
      if (event.key === 'Backspace') {
        setTimeout(() => this.updateFilterFromEditor(), 10);
        return false; // Laisser l'éditeur gérer le backspace
      }

      // Caractère normal - mettre à jour le filtre
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        setTimeout(() => this.updateFilterFromEditor(), 10);
        return false; // Laisser l'éditeur gérer la saisie
      }
    }

    // Détecter le / pour ouvrir le menu
    if (event.key === '/') {
      setTimeout(() => this.checkForSlashCommand(), 50);
    }

    return false;
  }

  checkForSlashCommand() {
    const { from } = this.editor.state.selection;
    const { left, top } = this.editor.view.coordsAtPos(from);

    // Menu dimensions (updated for new wider layout)
    const menuWidth = 320;
    const menuHeight = 500;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Calculate position with smart adjustment
    let finalLeft = left + 15;
    let finalTop = top + 25; // Position below cursor

    // Adjust horizontal position if menu would go off-screen right
    if (finalLeft + menuWidth > viewportWidth) {
      finalLeft = left - menuWidth - 15; // Show on left side instead
    }

    // Adjust vertical position if menu would go off-screen bottom
    if (finalTop + menuHeight > viewportHeight) {
      finalTop = top - menuHeight - 10; // Show above cursor instead
    }

    // Ensure minimum margins
    finalLeft = Math.max(20, Math.min(finalLeft, viewportWidth - menuWidth - 20));
    finalTop = Math.max(20, Math.min(finalTop, viewportHeight - menuHeight - 20));

    this.slashMenuPosition.set({
      top: finalTop,
      left: finalLeft
    });
    this.showSlashMenu.set(true);
    this.slashMenuIndex.set(0);
    this.slashFilterText.set(''); // Réinitialiser le filtre à l'ouverture
  }

  private updateFilterFromEditor() {
    const { from } = this.editor.state.selection;
    const textBefore = this.editor.state.doc.textBetween(
      Math.max(0, from - 50),
      from,
      ' '
    );

    // Trouver le dernier '/'
    const slashIndex = textBefore.lastIndexOf('/');

    if (slashIndex !== -1) {
      // Extraire tout après le slash
      const filterText = textBefore.substring(slashIndex + 1).trim();
      this.slashFilterText.set(filterText);

      // Réinitialiser l'index de sélection quand le filtre change
      this.slashMenuIndex.set(0);
    } else {
      // Le slash a été supprimé, fermer le menu
      this.showSlashMenu.set(false);
      this.slashFilterText.set('');
    }
  }

  private getFilteredItems(): SlashCommand[] {
    const filter = this.slashFilterText().toLowerCase();
    if (!filter) {
      return this.menuItems;
    }

    return this.menuItems.filter(item =>
      item.label.toLowerCase().includes(filter)
    );
  }

  private getFilteredItemsCount(): number {
    return this.getFilteredItems().length;
  }

  executeCommand(item: SlashCommand) {
    // Calculer la longueur totale à supprimer : '/' + texte du filtre
    const filterLength = this.slashFilterText().length;
    const totalLength = 1 + filterLength; // 1 pour le '/', + longueur du filtre

    // Supprimer le '/' et tout le texte du filtre
    this.editor.chain().focus().deleteRange({
      from: this.editor.state.selection.from - totalLength,
      to: this.editor.state.selection.from
    }).run();

    item.action();
    this.showSlashMenu.set(false);
    this.slashFilterText.set(''); // Réinitialiser le filtre
  }

  closeSlashMenu() {
    this.showSlashMenu.set(false);
    this.slashFilterText.set('');
  }

  addTable() {
    this.editor.chain().focus().insertTable({
      rows: 3,
      cols: 3,
      withHeaderRow: true
    }).run();
  }

  addImage() {
    const dialogRef = this.dialog.open(ImageInsertDialogComponent, {
      width: '700px',
      maxWidth: '90vw',
      maxHeight: '90vh',
      data: { mode: 'insert' } as ImageInsertDialogData
    });

    dialogRef.afterClosed().subscribe((result: ImageInsertDialogResult | null) => {
      if (result) {
        this.editor.chain().focus().setImage({
          src: result.src,
          alt: result.alt,
          alignment: result.alignment,
          caption: result.caption || '',
        } as any).run();
      }
    });
  }

  addExternalLink() {
    const dialogRef = this.dialog.open(ExternalLinkDialogComponent, {
      width: '500px',
      maxWidth: '90vw',
      data: { mode: 'insert' } as ExternalLinkDialogData
    });

    dialogRef.afterClosed().subscribe((result: ExternalLinkDialogResult | null) => {
      if (result) {
        this.editor.chain().focus().insertContent([
          {
            type: 'text',
            marks: [{
              type: 'link',
              attrs: {
                href: result.url,
                target: '_blank',
                rel: 'noopener noreferrer',
                class: 'document-link'
              }
            }],
            text: result.label
          },
          { type: 'text', text: ' ' }
        ]).run();
      }
    });
  }

  addDocumentFile() {
    const currentDocId = this.documentState().id;
    if (!currentDocId) {
      alert('Sauvegardez le document d\'abord');
      return;
    }

    const dialogRef = this.dialog.open(DocumentUploadDialogComponent, {
      width: '500px',
      maxWidth: '90vw',
      data: {
        documentId: currentDocId,
        mode: 'insert'
      } as DocumentUploadDialogData
    });

    dialogRef.afterClosed().subscribe((result: DocumentUploadDialogResult | null) => {
      if (result) {
        // Prevent cleanup dialog during insertion
        this.isInsertingDocumentFile = true;

        this.editor.chain().focus().insertContent([
          {
            type: 'text',
            marks: [{
              type: 'link',
              attrs: {
                href: result.url,
                target: '_blank',
                rel: 'noopener noreferrer',
                class: 'document-link'
              }
            }],
            text: result.fileName
          },
          { type: 'text', text: ' ' }
        ]).run();

        // Add the new URL to tracking and re-enable cleanup
        this.previousDocumentFileUrls.add(result.url);
        this.isInsertingDocumentFile = false;
      }
    });
  }

  createLinkedDocument() {
    // Ouvrir le dialogue pour demander le titre
    const dialogRef = this.dialog.open(NewDocumentDialogComponent, {
      width: '500px',
      disableClose: false,
      autoFocus: true,
    });

    dialogRef.afterClosed().subscribe((result: NewDocumentDialogResult | undefined) => {
      if (!result) return;

      const title = result.title;
      const currentState = this.documentState();
      const currentDocId = currentState.id;

      // Créer le nouveau document avec parent_id et project_id hérité
      const newDoc: Omit<Document, 'id' | 'created_at' | 'updated_at'> = {
        title,
        content: {},
        parent_id: currentDocId, // Link to current document as parent
        project_id: currentState.project_id || null, // Inherit project_id from parent
        user_id: '' // Will be set by the service
      };

      // Sauvegarder d'abord le document actuel si nécessaire
      if (this.isDirty()) {
        this.saveDocument();
      }

      // Créer le nouveau document
      this.documentService.createDocument(newDoc).subscribe({
        next: (createdDoc: Document) => {
          // Insérer un lien vers le nouveau document dans l'éditeur actuel
          const linkText = title;
          const linkUrl = `/documents/${createdDoc.id}`;

          this.editor
            .chain()
            .focus()
            .insertContent([
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    marks: [
                      {
                        type: 'link',
                        attrs: {
                          href: linkUrl,
                          target: '_self',
                          class: 'document-link'
                        }
                      }
                    ],
                    text: linkText
                  }
                ]
              }
            ])
            .run();
        },
        error: (err: Error) => {
          console.error('Erreur lors de la création du document', err);
          alert('Impossible de créer le nouveau document');
        }
      });
    });
  }

  updateBubbleMenu(editor: Editor) {
    // Don't show bubble menu if disabled or while dragging
    if (this.bubbleMenuDisabled() || this.isDragging()) {
      this.showBubbleMenu.set(false);
      return;
    }

    const { from, to } = editor.state.selection;
    const hasSelection = from !== to;

    if (!hasSelection) {
      this.showBubbleMenu.set(false);
      return;
    }

    // Get coordinates of the selection
    const coords = editor.view.coordsAtPos(from);

    // Position bubble menu above selection
    this.bubbleMenuPosition.set({
      top: coords.top - 50, // 50px above selection
      left: coords.left
    });

    this.showBubbleMenu.set(true);
  }

  focusEditor(event?: Event) {
    // Only focus if clicking on the wrapper itself, not on editor content
    if (event) {
      const target = event.target as HTMLElement;
      // Don't interfere if clicking inside the editor content
      if (target.closest('.ProseMirror')) {
        return;
      }
    }
    // Focus the editor at the end only when clicking outside content
    this.editor.commands.focus('end');
  }

  navigateBack() {
    const backRoute = this.breadcrumbRoot().route;
    // Check if there are unsaved changes
    if (this.isDirty()) {
      const confirmLeave = window.confirm(
        'Vous avez des modifications non sauvegardées. Voulez-vous les sauvegarder avant de quitter ?'
      );
      if (confirmLeave) {
        this.saveDocument();
        // Wait a bit for save to complete before navigating
        setTimeout(() => {
          this.router.navigate([backRoute]);
        }, 500);
        return;
      }
    }
    this.router.navigate([backRoute]);
  }

  // Task integration methods
  openTaskSearchModal() {
    const currentDocId = this.documentState().id;
    if (!currentDocId) {
      alert('Sauvegardez le document d\'abord');
      return;
    }

    const dialogRef = this.dialog.open(TaskSearchModalComponent, {
      width: '600px',
      maxHeight: '80vh',
    });

    dialogRef.afterClosed().subscribe((selectedTask: TaskSearchResult | null) => {
      if (selectedTask) {
        // Link task to document
        this.documentService.linkTaskToDocument(currentDocId, selectedTask.id, 'linked').subscribe({
          next: () => {
            // Insert task section block if it doesn't exist yet
            this.ensureTaskSectionExists();
            this.showSlashMenu.set(false);
          },
          error: (err: unknown) => {
            console.error('Error linking task to document:', err);
            alert('Impossible de lier la tâche au document');
          }
        });
      }
    });
  }

  private insertTaskMention(taskId: string) {
    const currentDocId = this.documentState().id;
    if (!currentDocId) {
      alert('Sauvegardez le document d\'abord');
      return;
    }

    this.documentService.getTaskForMention(taskId).subscribe({
      next: (taskData: TaskMentionData) => {
        this.documentService.linkTaskToDocument(currentDocId, taskId, 'linked').subscribe({
          next: () => {
            const attrs: TaskMentionAttributes = {
              taskId: taskData.id,
              taskTitle: taskData.title,
              taskStatus: taskData.status,
              taskPriority: taskData.priority,
              taskType: taskData.type,
              taskNumber: taskData.task_number,
            };
            this.editor.chain().focus().insertTaskMention(attrs).run();
          },
          error: (err: unknown) => {
            console.error('Error linking task to document:', err);
            alert('Impossible de lier la tâche au document');
          }
        });
      },
      error: (err: unknown) => {
        console.error('Error fetching task:', err);
        alert('Impossible de récupérer les informations de la tâche');
      }
    });
  }

  private insertTaskMentionById(taskId: string) {
    // This method inserts a task mention for a task that was just created
    // The relation already exists in DB, we just need to insert the node
    this.documentService.getTaskForMention(taskId).subscribe({
      next: (taskData: TaskMentionData) => {
        const attrs: TaskMentionAttributes = {
          taskId: taskData.id,
          taskTitle: taskData.title,
          taskStatus: taskData.status,
          taskPriority: taskData.priority,
          taskType: taskData.type,
          taskNumber: taskData.task_number,
        };
        // Insert at the end of the document
        this.editor.chain().focus('end').insertTaskMention(attrs).run();
        // Save the document to persist the change
        setTimeout(() => this.saveDocument(), 500);
      },
      error: (err: unknown) => {
        console.error('Error fetching task for mention:', err);
      }
    });
  }

  insertTaskSection() {
    const currentDocId = this.documentState().id;
    if (!currentDocId) {
      alert('Sauvegardez le document d\'abord');
      return;
    }

    // Insert task section block
    this.editor.chain().focus().insertTaskSection().run();
    this.showSlashMenu.set(false);
  }

  private ensureTaskSectionExists() {
    // Check if a task section already exists in the document
    const doc = this.editor.state.doc;
    let taskSectionExists = false;

    doc.descendants((node) => {
      if (node.type.name === 'taskSection') {
        taskSectionExists = true;
        return false; // Stop iteration
      }
      return true; // Continue iteration
    });

    // If no task section exists, insert one at the current cursor position
    if (!taskSectionExists) {
      this.editor.chain().focus().insertTaskSection().run();
    }
  }

  createNewTaskFromDocument() {
    const currentDocId = this.documentState().id;
    if (!currentDocId) {
      alert('Sauvegardez le document d\'abord');
      return;
    }

    // Save document if dirty
    if (this.isDirty()) {
      this.saveDocument();
    }

    // Navigate to task form with query params
    this.router.navigate(['/tasks/new'], {
      queryParams: {
        returnTo: `/documents/${currentDocId}`,
        createFromDocument: currentDocId,
      },
    });
  }

  private navigateToTask(taskId: string) {
    this.router.navigate(['/tasks', taskId]);
  }

  private loadAndRefreshTaskMentions(documentId: string) {
    this.documentService.getTasksForDocument(documentId).subscribe({
      next: (tasks: TaskMentionData[]) => {
        tasks.forEach((task: TaskMentionData) => {
          this.editor.commands.updateTaskMention(task.id, {
            taskId: task.id,
            taskTitle: task.title,
            taskStatus: task.status,
            taskPriority: task.priority,
            taskType: task.type,
            taskNumber: task.task_number,
          });
        });
      },
      error: (err: unknown) => console.error('Error refreshing task mentions:', err)
    });
  }

  // Database methods
  insertDatabase() {
    const currentDocId = this.documentState().id;
    if (!currentDocId) {
      alert('Sauvegardez le document d\'abord');
      return;
    }

    // Step 1: Create the database in Supabase FIRST
    this.databaseService.createDatabase({
      documentId: currentDocId,
      config: DEFAULT_DATABASE_CONFIG,
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          // Step 2: Insert the block with the pre-generated databaseId
          this.editor.chain().focus().insertDatabaseTable(response.databaseId).run();

          // Step 3: Save immediately to persist the databaseId
          this.saveDocumentImmediate().pipe(take(1)).subscribe({
            next: () => { },
            error: (err) => {
              console.error('❌ Failed to save document after database creation:', err);
            }
          });

          this.showSlashMenu.set(false);
        },
        error: (err) => {
          console.error('❌ Failed to create database:', err);
          alert('Impossible de créer la base de données. Veuillez réessayer.');
        }
      });
  }

  /**
   * Insert a pre-configured task database with 14 task-specific columns
   * Creates a Notion-style task database with Status, Priority, Type, etc.
   */
  insertTaskDatabase() {
    const currentDocId = this.documentState().id;
    if (!currentDocId) {
      alert('Sauvegardez le document d\'abord');
      return;
    }

    // Create task database with pre-configured columns
    const taskConfig = createTaskDatabaseConfig('Tâches');

    // Step 1: Create the database in Supabase with task template
    this.databaseService.createDatabase({
      documentId: currentDocId,
      config: taskConfig,
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          // Step 2: Insert the block with the pre-generated databaseId
          this.editor.chain().focus().insertDatabaseTable(response.databaseId).run();

          // Step 3: Save immediately to persist the databaseId
          this.saveDocumentImmediate().pipe(take(1)).subscribe({
            next: () => {
              console.log('✅ Task database created successfully');
            },
            error: (err) => {
              console.error('❌ Failed to save document after task database creation:', err);
            }
          });

          this.showSlashMenu.set(false);
        },
        error: (err) => {
          console.error('❌ Failed to create task database:', err);
          alert('Impossible de créer la base de données de tâches. Veuillez réessayer.');
        }
      });
  }

  /**
   * Insert a mind map block
   */
  insertMindmap() {
    this.editor.chain().focus().insertMindmap().run();
    this.showSlashMenu.set(false);
  }

  /**
   * Insert a spreadsheet block
   */
  insertSpreadsheet() {
    this.editor.chain().focus().insertSpreadsheet().run();
    this.showSlashMenu.set(false);
  }

  /**
   * Start editing a property (Notion-style click-to-edit)
   */
  startEditingProperty(columnId: string, currentValue: CellValue) {
    this.editingPropertyId.set(columnId);
    this.tempPropertyValue.set(currentValue);
  }

  /**
   * Save property value
   */
  saveProperty(columnId: string) {
    const newValue = this.tempPropertyValue();
    const currentValue = this.databaseRow()?.cells[columnId];

    if (newValue !== currentValue) {
      this.onUpdateDatabaseProperty(columnId, newValue);
    }

    this.editingPropertyId.set(null);
    this.tempPropertyValue.set(null);
  }

  /**
   * Cancel property editing
   */
  cancelPropertyEdit() {
    this.editingPropertyId.set(null);
    this.tempPropertyValue.set(null);
  }

  /**
   * Check if a property is currently being edited
   */
  isEditingProperty(columnId: string): boolean {
    return this.editingPropertyId() === columnId;
  }

  /**
   * Get display value for a property
   */
  getPropertyDisplayValue(column: DatabaseColumn, value: CellValue): string {
    if (value === null || value === undefined || value === '') {
      return 'Vide';
    }

    switch (column.type) {
      case 'select':
        const choice = column.options?.choices?.find(c => c.id === value);
        return choice?.label || String(value);
      case 'checkbox':
        return value ? 'Oui' : 'Non';
      case 'multi-select':
        if (Array.isArray(value)) {
          const labels = value.map(id => {
            const choice = column.options?.choices?.find(c => c.id === id);
            return choice?.label || id;
          });
          return labels.join(', ') || 'Aucune sélection';
        }
        return 'Aucune sélection';
      default:
        return String(value);
    }
  }

  /**
   * Get task number from database row
   */
  getTaskNumber(): string | null {
    const row = this.databaseRow();
    const metadata = this.databaseMetadata();

    if (!row || !metadata) {
      return null;
    }

    // Find Task Number column
    const taskNumberColumn = metadata.config.columns.find(col => col.name === 'Task Number');
    if (!taskNumberColumn) {
      return null;
    }

    const taskNumber = row.cells[taskNumberColumn.id];
    return taskNumber ? String(taskNumber) : null;
  }

  /**
   * Get Material icon name based on property type
   */
  getPropertyIcon(type: string): string {
    const iconMap: Record<string, string> = {
      'text': 'subject',
      'number': 'tag',
      'select': 'arrow_drop_down_circle',
      'multi-select': 'library_add_check',
      'date': 'event',
      'checkbox': 'check_box',
      'url': 'link',
      'email': 'email',
    };
    return iconMap[type] || 'label';
  }

  /**
   * Get color values for a column (background, text, border)
   * Assigns color automatically based on column index if not specified
   */
  getColumnColor(column: DatabaseColumn): { bg: string; text: string; border: string } {
    // If column has a color, use it
    if (column.color) {
      return PROPERTY_COLORS[column.color];
    }

    // Otherwise, assign a color based on the column's position in the metadata
    const metadata = this.databaseMetadata();
    if (metadata) {
      const columnIndex = metadata.config.columns.findIndex((col: DatabaseColumn) => col.id === column.id);
      if (columnIndex >= 0) {
        const autoColor = getDefaultColumnColor(columnIndex);
        return PROPERTY_COLORS[autoColor];
      }
    }

    // Final fallback to gray
    return PROPERTY_COLORS.gray;
  }

  // =====================================================================
  // Block Comments Methods
  // =====================================================================

  /**
   * Open comment panel for a block
   * If block doesn't have an ID, one will be assigned
   */
  openCommentPanel(blockId: string | null): void {
    if (!blockId) {
      // Try to ensure the current block has an ID and get it
      const currentBlockId = this.ensureAndGetBlockId();

      if (currentBlockId) {
        this.selectedBlockId.set(currentBlockId);
        this.commentPanelOpen.set(true);
      }
    } else {
      this.selectedBlockId.set(blockId);
      this.commentPanelOpen.set(true);
    }
  }

  /**
   * Helper to ensure current block has a blockId and return it
   */
  private ensureAndGetBlockId(): string | null {
    const { selection } = this.editor.state;
    const { $from } = selection;

    const blockTypes = [
      'paragraph', 'heading', 'blockquote', 'codeBlock',
      'bulletList', 'orderedList', 'taskList', 'listItem', 'taskItem',
      'table', 'horizontalRule', 'image', 'columns', 'column',
      'databaseTable', 'taskSection'
    ];

    let depth = $from.depth;
    while (depth > 0) {
      const node = $from.node(depth);

      if (blockTypes.includes(node.type.name)) {
        let blockId = node.attrs['blockId'];

        if (!blockId) {
          // Generate and assign new blockId
          blockId = 'block-' + crypto.randomUUID();
          const pos = $from.before(depth);

          this.editor.view.dispatch(
            this.editor.state.tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              blockId: blockId,
            })
          );
        }

        return blockId;
      }
      depth--;
    }

    return null;
  }

  /**
   * Close comment panel
   */
  closeCommentPanel(): void {
    this.commentPanelOpen.set(false);
    this.selectedBlockId.set(null);
  }

  /**
   * Toggle comment panel for a specific block
   */
  toggleCommentPanel(blockId: string): void {
    if (this.commentPanelOpen() && this.selectedBlockId() === blockId) {
      this.closeCommentPanel();
    } else {
      this.openCommentPanel(blockId);
    }
  }

  /**
   * Handle comment added event
   */
  onCommentAdded(comment: BlockComment): void {
    // Update local state
    this.blockComments.update((map) => {
      const updated = { ...map };
      if (!updated[comment.block_id]) {
        updated[comment.block_id] = [];
      }
      updated[comment.block_id] = [...updated[comment.block_id], comment];
      return updated;
    });
    this.blocksWithComments.update((set) => new Set([...set, comment.block_id]));

    // Update editor decorations
    this.updateCommentDecorations();

    // Save document to persist the blockId in the document content
    // This ensures the blockId is stored for future comment indicator display
    this.saveDocument();
  }

  /**
   * Handle comment updated event
   */
  onCommentUpdated(comment: BlockComment): void {
    this.blockComments.update((map) => {
      const updated = { ...map };
      if (updated[comment.block_id]) {
        updated[comment.block_id] = updated[comment.block_id].map((c) =>
          c.id === comment.id ? comment : c
        );
      }
      return updated;
    });
  }

  /**
   * Handle comment deleted event
   */
  onCommentDeleted(commentId: string): void {
    const blockId = this.selectedBlockId();
    if (!blockId) return;

    this.blockComments.update((map) => {
      const updated = { ...map };
      if (updated[blockId]) {
        updated[blockId] = updated[blockId].filter((c) => c.id !== commentId);
        // Remove block from map if no comments left
        if (updated[blockId].length === 0) {
          delete updated[blockId];
        }
      }
      return updated;
    });

    // Update blocks with comments set
    const comments = this.blockComments();
    this.blocksWithComments.set(new Set(Object.keys(comments)));

    // Update editor decorations
    this.updateCommentDecorations();
  }

  /**
   * Get comment count for a block
   */
  getBlockCommentCount(blockId: string): number {
    const comments = this.blockComments();
    return comments[blockId]?.length || 0;
  }

  /**
   * Check if a block has comments
   */
  blockHasComments(blockId: string): boolean {
    return this.blocksWithComments().has(blockId);
  }

  /**
   * Handle click on editor to detect block selection for comments
   * Called via click event on editor wrapper
   */
  onEditorClick(event: MouseEvent): void {
    // Check if click was on a comment indicator button
    const target = event.target as HTMLElement;
    if (target.closest('.block-comment-indicator')) {
      event.preventDefault();
      event.stopPropagation();
      const blockId = target.closest('.block-comment-indicator')?.getAttribute('data-block-id');
      if (blockId) {
        this.toggleCommentPanel(blockId);
      }
    }
  }

  ngOnDestroy(): void {
    // Prevent document file cleanup dialog from showing when navigating away
    this.isComponentDestroying = true;

    this.fabStore.unregisterPage(this.pageId);
    this.editor.destroy();
    this.destroy$.next();
    this.destroy$.complete();
  }
}
