import { Component, Input, Output, EventEmitter, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CdkDrag, CdkDragHandle } from '@angular/cdk/drag-drop';
import { DocumentSection, UpdateDocumentSection } from '../../models/document-tabs.model';

@Component({
  selector: 'app-document-section-header',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    CdkDragHandle,
  ],
  templateUrl: './document-section-header.component.html',
  styleUrls: ['./document-section-header.component.scss'],
})
export class DocumentSectionHeaderComponent {
  @Input({ required: true }) section!: DocumentSection;
  @Input() itemCount = 0;

  @Output() titleChange = new EventEmitter<string>();
  @Output() toggleCollapse = new EventEmitter<void>();
  @Output() delete = new EventEmitter<void>();

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
}
