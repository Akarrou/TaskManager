import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import {
  CdkDragDrop,
  CdkDropList,
  CdkDrag,
  CdkDragHandle,
  CdkDragPreview,
  CdkDragPlaceholder,
  DragDropModule,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import {
  TabWithItems,
  SectionWithItems,
  DocumentTabItem,
  DocumentDropTarget,
  UpdateDocumentSection,
  DocumentSection,
} from '../../models/document-tabs.model';
import { Document, DocumentStorageFile } from '../../services/document.service';
import { DocumentDatabase } from '../../models/database.model';
import { DocumentSectionCardComponent } from '../document-section-card/document-section-card.component';
import { DeleteSectionDialogComponent } from '../delete-section-dialog/delete-section-dialog.component';

@Component({
  selector: 'app-document-tab-content',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatCardModule,
    MatTooltipModule,
    DragDropModule,
    CdkDragHandle,
    DocumentSectionCardComponent,
  ],
  templateUrl: './document-tab-content.component.html',
  styleUrls: ['./document-tab-content.component.scss'],
})
export class DocumentTabContentComponent {
  private dialog = inject(MatDialog);

  @Input() tab: TabWithItems | null = null;
  @Input() documents: Map<string, Document> = new Map();
  @Input() storageFiles: Map<string, DocumentStorageFile[]> = new Map();
  @Input() databases: Map<string, DocumentDatabase[]> = new Map();
  @Input() allDropListIds: string[] = [];
  @Input() availableDocuments: Document[] = [];
  @Input() tabDocumentIds: Set<string> = new Set();

  @Output() documentClick = new EventEmitter<string>();
  @Output() documentDelete = new EventEmitter<{ event: Event; documentId: string }>();
  @Output() databaseClick = new EventEmitter<string>();
  @Output() sectionCreate = new EventEmitter<string>(); // tabId
  @Output() sectionUpdate = new EventEmitter<{ sectionId: string; updates: UpdateDocumentSection }>();
  @Output() sectionDelete = new EventEmitter<string>();
  @Output() sectionToggleCollapse = new EventEmitter<string>();
  @Output() sectionsReorder = new EventEmitter<{ tabId: string; sectionIds: string[] }>();
  @Output() documentMove = new EventEmitter<{ documentId: string; target: DocumentDropTarget }>();
  @Output() documentsReorder = new EventEmitter<{
    tabId: string;
    sectionId: string | null;
    documentIds: string[];
  }>();
  @Output() documentAdd = new EventEmitter<{
    documentId: string;
    tabId: string;
    sectionId: string | null;
    position: number;
  }>();
  @Output() documentAddToSection = new EventEmitter<{
    documentId: string;
    sectionId: string;
  }>();

  getDropListId(sectionId: string | null): string {
    if (!this.tab) return '';
    return sectionId ? `section-${sectionId}` : `tab-${this.tab.id}-unsectioned`;
  }

  getDocumentForItem(item: DocumentTabItem): Document | undefined {
    return this.documents.get(item.document_id);
  }

  getChildDocuments(parentId: string): Document[] {
    const children: Document[] = [];
    this.documents.forEach((doc) => {
      if (doc.parent_id === parentId) {
        children.push(doc);
      }
    });
    return children;
  }

  getStorageFilesForDocument(documentId: string): DocumentStorageFile[] {
    return this.storageFiles.get(documentId) || [];
  }

  onDrop(event: CdkDragDrop<DocumentTabItem[]>, targetSectionId: string | null): void {
    if (!this.tab) return;

    const dragData = event.item.data;

    // Check if the drag comes from unorganized documents
    if (dragData && dragData.isUnorganized) {
      // Add the unorganized document to this tab
      this.documentAdd.emit({
        documentId: dragData.document_id,
        tabId: this.tab.id,
        sectionId: targetSectionId,
        position: event.currentIndex,
      });
      return;
    }

    const item = event.previousContainer.data[event.previousIndex];

    if (event.previousContainer === event.container) {
      // Reorder within same section
      const items = [...event.container.data];
      moveItemInArray(items, event.previousIndex, event.currentIndex);

      this.documentsReorder.emit({
        tabId: this.tab.id,
        sectionId: targetSectionId,
        documentIds: items.map((i) => i.document_id),
      });
    } else {
      // Move to different section (or from unsectioned to section)
      const target: DocumentDropTarget = {
        tabId: this.tab.id,
        sectionId: targetSectionId,
        position: event.currentIndex,
      };

      // Optimistic UI update
      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex
      );

      this.documentMove.emit({
        documentId: item.document_id,
        target,
      });
    }
  }

  onSectionTitleChange(sectionId: string, title: string): void {
    this.sectionUpdate.emit({ sectionId, updates: { title } });
  }

  onSectionFullUpdate(sectionId: string, updates: UpdateDocumentSection): void {
    this.sectionUpdate.emit({ sectionId, updates });
  }

  onSectionDrop(event: CdkDragDrop<SectionWithItems[]>): void {
    if (!this.tab || event.previousIndex === event.currentIndex) return;

    // Create a mutable copy of sections
    const sections = [...this.tab.sections];
    moveItemInArray(sections, event.previousIndex, event.currentIndex);

    // Emit the new order
    this.sectionsReorder.emit({
      tabId: this.tab.id,
      sectionIds: sections.map(s => s.id),
    });
  }

  onSectionToggleCollapse(sectionId: string): void {
    this.sectionToggleCollapse.emit(sectionId);
  }

  onSectionDelete(sectionId: string, sectionTitle: string): void {
    const dialogRef = this.dialog.open(DeleteSectionDialogComponent, {
      width: '450px',
      data: { sectionTitle }
    });

    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.sectionDelete.emit(sectionId);
      }
    });
  }

  onAddSection(): void {
    if (this.tab) {
      this.sectionCreate.emit(this.tab.id);
    }
  }

  onDocumentClick(documentId: string): void {
    this.documentClick.emit(documentId);
  }

  onDocumentDelete(data: { event: Event; documentId: string }): void {
    data.event.stopPropagation();
    this.documentDelete.emit(data);
  }

  onOpenStorageFile(event: Event, url: string): void {
    event.stopPropagation();
    window.open(url, '_blank');
  }

  onDocumentAddToSection(sectionId: string, documentId: string): void {
    this.documentAddToSection.emit({ documentId, sectionId });
  }

  trackSection(index: number, section: SectionWithItems): string {
    return section.id;
  }

  trackItem(index: number, item: DocumentTabItem): string {
    return item.id;
  }
}
