import { Component, Input, Output, EventEmitter, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import {
  CdkDragDrop,
  CdkDrag,
  CdkDragHandle,
  CdkDragPreview,
  CdkDragPlaceholder,
  CdkDropList,
  DragDropModule,
} from '@angular/cdk/drag-drop';
import { DocumentSection, UpdateDocumentSection, DocumentTabItem } from '../../models/document-tabs.model';
import { Document, DocumentStorageFile } from '../../services/document.service';
import { SectionEditDialogComponent, SectionEditDialogResult } from '../section-edit-dialog/section-edit-dialog.component';
import { DocumentCardComponent } from '../document-card/document-card.component';

@Component({
  selector: 'app-document-section-card',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    DragDropModule,
    DocumentCardComponent,
  ],
  templateUrl: './document-section-card.component.html',
  styleUrls: ['./document-section-card.component.scss'],
})
export class DocumentSectionCardComponent {
  private dialog = inject(MatDialog);

  @Input({ required: true }) section!: DocumentSection;
  @Input() items: DocumentTabItem[] = [];
  @Input() documents: Map<string, Document> = new Map();
  @Input() storageFiles: Map<string, DocumentStorageFile[]> = new Map();
  @Input() dropListId = '';
  @Input() connectedDropListIds: string[] = [];

  @Output() titleChange = new EventEmitter<string>();
  @Output() sectionUpdate = new EventEmitter<UpdateDocumentSection>();
  @Output() toggleCollapse = new EventEmitter<void>();
  @Output() delete = new EventEmitter<void>();
  @Output() documentClick = new EventEmitter<string>();
  @Output() documentDelete = new EventEmitter<{ event: Event; documentId: string }>();
  @Output() drop = new EventEmitter<CdkDragDrop<DocumentTabItem[]>>();

  get itemCount(): number {
    return this.items.length;
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

  onDrop(event: CdkDragDrop<DocumentTabItem[]>): void {
    this.drop.emit(event);
  }

  trackItem(index: number, item: DocumentTabItem): string {
    return item.id;
  }

  isEditing = signal(false);
  editTitle = signal('');

  onDoubleClick(): void {
    this.editTitle.set(this.section.title);
    this.isEditing.set(true);
  }

  onTitleBlur(): void {
    this.saveTitle();
  }

  onTitleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.saveTitle();
    } else if (event.key === 'Escape') {
      this.cancelEdit();
    }
  }

  private saveTitle(): void {
    const newTitle = this.editTitle().trim();
    if (newTitle && newTitle !== this.section.title) {
      this.titleChange.emit(newTitle);
    }
    this.isEditing.set(false);
  }

  private cancelEdit(): void {
    this.isEditing.set(false);
  }

  onToggleCollapse(): void {
    this.toggleCollapse.emit();
  }

  onDelete(): void {
    this.delete.emit();
  }

  onEdit(): void {
    const dialogRef = this.dialog.open(SectionEditDialogComponent, {
      width: '500px',
      data: {
        section: this.section,
        mode: 'edit',
      },
    });

    dialogRef.afterClosed().subscribe((result: SectionEditDialogResult | undefined) => {
      if (result) {
        const updates: UpdateDocumentSection = {};
        if (result.title !== this.section.title) {
          updates.title = result.title;
        }
        if (result.icon !== this.section.icon) {
          updates.icon = result.icon;
        }
        if (result.color !== this.section.color) {
          updates.color = result.color;
        }

        if (Object.keys(updates).length > 0) {
          this.sectionUpdate.emit(updates);
        }
      }
    });
  }
}
