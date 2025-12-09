import { Component, OnDestroy, OnInit, inject, signal, computed, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Editor } from '@tiptap/core';
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

  documentId = signal<string | null>(null);
  documentTitle = signal('Sans titre');
  isSaving = signal(false);
  lastSaved = signal<Date | null>(null);

  private destroy$ = new Subject<void>();
  private autoSaveSubject = new Subject<void>();

  // Navigation FAB
  fabContext = computed(() => this.navigationFabService.createContext({ 
    currentPage: 'document-editor',
    isDirty: this.isSaving(), 
    hasUnsavedChanges: false // Could track dirty state more precisely
  }));
  
  fabActions = this.navigationFabService.getCommonActions('document-editor');

  menuItems: SlashCommand[] = [
    { id: 'h1', label: 'Heading 1', icon: 'looks_one', action: () => this.editor.chain().focus().toggleHeading({ level: 1 }).run() },
    { id: 'h2', label: 'Heading 2', icon: 'looks_two', action: () => this.editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { id: 'h3', label: 'Heading 3', icon: 'looks_3', action: () => this.editor.chain().focus().toggleHeading({ level: 3 }).run() },
    { id: 'bulletList', label: 'Bullet List', icon: 'format_list_bulleted', action: () => this.editor.chain().focus().toggleBulletList().run() },
    { id: 'orderedList', label: 'Ordered List', icon: 'format_list_numbered', action: () => this.editor.chain().focus().toggleOrderedList().run() },
    { id: 'taskList', label: 'Todo List', icon: 'check_box', action: () => this.editor.chain().focus().toggleTaskList().run() },
    { id: 'table', label: 'Table', icon: 'table_chart', action: () => this.editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { id: 'codeBlock', label: 'Code Block', icon: 'code', action: () => this.editor.chain().focus().toggleCodeBlock().run() },
    { id: 'image', label: 'Image', icon: 'image', action: () => this.addImage() },
  ];

  constructor() {
    this.editor = new Editor({
      element: document.createElement('div'),
      extensions: [
        StarterKit,
        Placeholder.configure({ placeholder: 'Type \'/\' for commands...' }),
        Image,
        TaskList,
        TaskItem.configure({ nested: true }),
        Table.configure({ resizable: true }),
        TableRow,
        TableHeader,
        TableCell,
        CodeBlockLowlight.configure({ lowlight }),
      ],
      editorProps: {
        attributes: {
          class: 'prose dark:prose-invert max-w-none focus:outline-none min-h-[300px]',
        },
        handleKeyDown: (view: any, event: KeyboardEvent) => this.handleKeyDown(view, event)
      },
      onUpdate: () => {
        this.autoSaveSubject.next();
      }
    });

    // Auto-save setup
    this.autoSaveSubject.pipe(
      debounceTime(2000),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.saveDocument();
    });
  }

  ngOnInit() {
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
      if (params['id']) {
        this.documentId.set(params['id']);
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
          this.documentTitle.set(doc.title);
          if (doc.content && Object.keys(doc.content).length > 0) {
            this.editor.commands.setContent(doc.content);
          }
        }
      },
      error: (err) => console.error('Error loading doc', err)
    });
  }

  saveDocument() {
    if (this.isSaving()) return;
    
    this.isSaving.set(true);
    const content = this.editor.getJSON();
    const title = this.documentTitle();
    const id = this.documentId();

    if (id) {
      this.documentService.updateDocument(id, { title, content }).subscribe({
        next: (doc) => {
          this.isSaving.set(false);
          this.lastSaved.set(new Date());
        },
        error: (err) => {
          console.error('Error updating doc', err);
          this.isSaving.set(false);
        }
      });
    } else {
      this.documentService.createDocument({ title, content }).subscribe({
        next: (doc) => {
          this.documentId.set(doc.id);
          this.isSaving.set(false);
          this.lastSaved.set(new Date());
          // Update URL without reload
          window.history.replaceState({}, '', `/documents/${doc.id}`);
        },
        error: (err) => {
          console.error('Error creating doc', err);
          this.isSaving.set(false);
        }
      });
    }
  }

  handleKeyDown(view: any, event: KeyboardEvent): boolean {
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

  ngOnDestroy(): void {
    this.editor.destroy();
    this.destroy$.next();
    this.destroy$.complete();
  }
}
