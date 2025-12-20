import { Component, Input, Output, EventEmitter, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  CdkDragDrop,
  CdkDropList,
  CdkDrag,
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
} from '../../models/document-tabs.model';
import { Document, DocumentStorageFile } from '../../services/document.service';
import { DocumentSectionHeaderComponent } from '../document-section-header/document-section-header.component';

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
    DocumentSectionHeaderComponent,
  ],
  templateUrl: './document-tab-content.component.html',
  styleUrls: ['./document-tab-content.component.scss'],
})
export class DocumentTabContentComponent {
  @Input() tab: TabWithItems | null = null;
  @Input() documents: Map<string, Document> = new Map();
  @Input() storageFiles: Map<string, DocumentStorageFile[]> = new Map();
  @Input() allDropListIds: string[] = [];

  @Output() documentClick = new EventEmitter<string>();
  @Output() documentDelete = new EventEmitter<{ event: Event; documentId: string }>();
  @Output() sectionCreate = new EventEmitter<string>(); // tabId
  @Output() sectionUpdate = new EventEmitter<{ sectionId: string; title: string }>();
  @Output() sectionDelete = new EventEmitter<string>();
  @Output() sectionToggleCollapse = new EventEmitter<string>();
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
    this.sectionUpdate.emit({ sectionId, title });
  }

  onSectionToggleCollapse(sectionId: string): void {
    this.sectionToggleCollapse.emit(sectionId);
  }

  onSectionDelete(sectionId: string): void {
    if (confirm('Supprimer cette section ? Les documents seront déplacés vers la zone non-sectionnée.')) {
      this.sectionDelete.emit(sectionId);
    }
  }

  onAddSection(): void {
    if (this.tab) {
      this.sectionCreate.emit(this.tab.id);
    }
  }

  onDocumentClick(documentId: string): void {
    this.documentClick.emit(documentId);
  }

  onDocumentDelete(event: Event, documentId: string): void {
    event.stopPropagation();
    this.documentDelete.emit({ event, documentId });
  }

  onOpenStorageFile(event: Event, url: string): void {
    event.stopPropagation();
    window.open(url, '_blank');
  }

  trackSection(index: number, section: SectionWithItems): string {
    return section.id;
  }

  trackItem(index: number, item: DocumentTabItem): string {
    return item.id;
  }
}
