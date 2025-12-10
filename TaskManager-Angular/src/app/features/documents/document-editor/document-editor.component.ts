import { Component, OnDestroy, OnInit, inject, signal, computed, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Editor, JSONContent } from '@tiptap/core';
import { EditorView } from '@tiptap/pm/view';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Image } from '@tiptap/extension-image';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { TiptapEditorDirective } from 'ngx-tiptap';
import { all, createLowlight } from 'lowlight';
import { SlashMenuComponent, SlashCommand } from '../slash-menu/slash-menu.component';
import { DocumentService, Document } from '../services/document.service';
import { NavigationFabComponent, NavigationContext } from '../../../shared/components/navigation-fab/navigation-fab.component';
import { NavigationFabService } from '../../../shared/components/navigation-fab/navigation-fab.service';
import { debounceTime, Subject, takeUntil } from 'rxjs';
import { DocumentState, DocumentSnapshot, createSnapshot, hasChanges } from '../models/document-content.types';

const lowlight = createLowlight(all);

@Component({
  selector: 'app-document-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, TiptapEditorDirective, SlashMenuComponent, NavigationFabComponent],
  templateUrl: './document-editor.component.html',
  styleUrl: './document-editor.component.scss',
  encapsulation: ViewEncapsulation.None
})
export class DocumentEditorComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private documentService = inject(DocumentService);
  private navigationFabService = inject(NavigationFabService);

  editor: Editor;
  showSlashMenu = signal(false);
  slashMenuPosition = signal({ top: 0, left: 0 });
  slashMenuIndex = signal(0);

  // Unified document state (single source of truth)
  documentState = signal<DocumentState>({
    id: null,
    title: 'Sans titre',
    content: {},
    isDirty: false,
    isSaving: false,
    lastSaved: null
  });

  // Snapshot for dirty tracking
  private originalSnapshot = signal<DocumentSnapshot | null>(null);

  // Computed dirty state
  isDirty = computed(() => {
    const current = this.documentState();
    const original = this.originalSnapshot();
    return hasChanges(createSnapshot(current), original);
  });

  private destroy$ = new Subject<void>();
  private changeSubject = new Subject<void>();

  // Navigation FAB
  fabContext = computed(() => this.navigationFabService.createContext({
    currentPage: 'document-editor',
    isDirty: this.documentState().isSaving,
    hasUnsavedChanges: this.isDirty()
  }));

  fabActions = this.navigationFabService.getCommonActions('document-editor');

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
    { id: 'codeBlock', label: 'Bloc de code', icon: 'code', action: () => this.editor.chain().focus().toggleCodeBlock().run() },
    { id: 'code', label: 'Code inline', icon: 'code_blocks', action: () => this.editor.chain().focus().toggleCode().run() },

    // Formatage texte
    { id: 'bold', label: 'Gras', icon: 'format_bold', action: () => this.editor.chain().focus().toggleBold().run() },
    { id: 'italic', label: 'Italique', icon: 'format_italic', action: () => this.editor.chain().focus().toggleItalic().run() },
    { id: 'strike', label: 'Barré', icon: 'strikethrough_s', action: () => this.editor.chain().focus().toggleStrike().run() },

    // Éléments structurels
    { id: 'table', label: 'Tableau', icon: 'table_chart', action: () => this.editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { id: 'image', label: 'Image', icon: 'image', action: () => this.addImage() },

    // Utilitaires
    { id: 'break', label: 'Saut de ligne', icon: 'keyboard_return', action: () => this.editor.chain().focus().setHardBreak().run() },
    { id: 'clear', label: 'Effacer format', icon: 'format_clear', action: () => this.editor.chain().focus().clearNodes().unsetAllMarks().run() },
  ];

  constructor() {
    this.editor = new Editor({
      // No element here - ngx-tiptap directive handles DOM binding
      extensions: [
        StarterKit,
        Placeholder.configure({
          placeholder: 'Tapez \'/\' pour afficher les commandes...',
          emptyEditorClass: 'is-editor-empty',
        }),
        Image,
        TaskList,
        TaskItem.configure({
          nested: true, // Enable nested task lists
        }),
        Table.configure({ resizable: true }),
        TableRow,
        TableHeader,
        TableCell,
        CodeBlockLowlight.configure({ lowlight }),
      ],
      editorProps: {
        attributes: {
          class: 'focus:outline-none',
        },
        handleKeyDown: (view: EditorView, event: KeyboardEvent) => this.handleKeyDown(view, event),
        handleClick: (_view: EditorView, _pos: number, _event: MouseEvent) => {
          // Allow default click behavior - don't prevent it
          return false;
        }
      },
      onUpdate: ({ editor }) => {
        this.handleContentChange(editor.getJSON());
      }
    });

    // Unified auto-save (handles both title and content changes)
    this.changeSubject.pipe(
      debounceTime(2000),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.saveDocument();
    });
  }

  // Handle content changes from editor
  private handleContentChange(content: JSONContent) {
    this.documentState.update(state => ({
      ...state,
      content
    }));
    this.changeSubject.next();
  }

  // Handle title changes from input
  onTitleChange(newTitle: string) {
    this.documentState.update(state => ({
      ...state,
      title: newTitle
    }));
    this.changeSubject.next();
  }

  ngOnInit() {
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
      if (params['id']) {
        this.loadDocument(params['id']);
      }
    });

    // Add Save action to custom actions
    this.fabActions = [
      {
        id: 'save',
        icon: 'save',
        label: 'Sauvegarder',
        tooltip: 'Sauvegarder maintenant',
        action: () => this.saveDocument(),
        color: 'primary'
      },
      ...this.fabActions
    ];
  }

  loadDocument(id: string) {
    this.documentService.getDocument(id).subscribe({
      next: (doc) => {
        if (doc) {
          // Update unified state
          this.documentState.set({
            id: doc.id,
            title: doc.title,
            content: doc.content,
            isDirty: false,
            isSaving: false,
            lastSaved: doc.updated_at ? new Date(doc.updated_at) : null
          });

          // Set original snapshot for dirty tracking
          this.originalSnapshot.set({
            title: doc.title,
            content: doc.content
          });

          // Update editor content
          if (doc.content && Object.keys(doc.content).length > 0) {
            this.editor.commands.setContent(doc.content);
          }
        }
      },
      error: (err) => console.error('Error loading doc', err)
    });
  }

  saveDocument() {
    const state = this.documentState();

    // Skip if already saving or not dirty
    if (state.isSaving || !this.isDirty()) return;

    // Update state: saving started
    this.documentState.update(s => ({ ...s, isSaving: true }));

    const payload = {
      title: state.title,
      content: state.content
    };

    const save$ = state.id
      ? this.documentService.updateDocument(state.id, payload)
      : this.documentService.createDocument(payload);

    save$.pipe(takeUntil(this.destroy$)).subscribe({
      next: (doc) => {
        // Update state: save complete
        this.documentState.update(s => ({
          ...s,
          id: doc.id,
          isSaving: false,
          lastSaved: new Date()
        }));

        // Update snapshot (no longer dirty)
        this.originalSnapshot.set({
          title: doc.title,
          content: doc.content
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

  handleKeyDown(view: EditorView, event: KeyboardEvent): boolean {
    if (this.showSlashMenu()) {
      if (event.key === 'ArrowUp') {
        this.slashMenuIndex.update((i: number) => Math.max(0, i - 1));
        return true;
      }
      if (event.key === 'ArrowDown') {
        this.slashMenuIndex.update((i: number) => Math.min(this.menuItems.length - 1, i + 1));
        return true;
      }
      if (event.key === 'Enter') {
        this.executeCommand(this.menuItems[this.slashMenuIndex()]);
        return true;
      }
      if (event.key === 'Escape') {
        this.showSlashMenu.set(false);
        return true;
      }
    }
    if (event.key === '/') {
      setTimeout(() => this.checkForSlashCommand(), 50);
    }
    return false;
  }

  checkForSlashCommand() {
      const { from } = this.editor.state.selection;
      const { left, top } = this.editor.view.coordsAtPos(from);
      this.slashMenuPosition.set({ 
          top: top - 5, 
          left: left + 15
      });this.showSlashMenu.set(true);
      this.slashMenuIndex.set(0);
  }

  executeCommand(item: SlashCommand) {
    this.editor.chain().focus().deleteRange({ from: this.editor.state.selection.from - 1, to: this.editor.state.selection.from }).run();
    item.action();
    this.showSlashMenu.set(false);
  }

  addImage() {
    const url = window.prompt('URL');
    if (url) {
      this.editor.chain().focus().setImage({ src: url }).run();
    }
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

  ngOnDestroy(): void {
    this.editor.destroy();
    this.destroy$.next();
    this.destroy$.complete();
  }
}
