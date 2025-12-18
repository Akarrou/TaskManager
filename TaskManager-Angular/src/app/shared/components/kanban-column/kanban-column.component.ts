import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatBadgeModule } from '@angular/material/badge';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CdkDropList, CdkDrag, CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { MatMenuModule } from '@angular/material/menu';

import { KanbanItem } from '../../../core/models/task.model';
import { KanbanColumn } from '../../models/kanban.model';
import { KanbanCardComponent } from '../kanban-card/kanban-card.component';

@Component({
  selector: 'app-kanban-column',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatBadgeModule,
    DragDropModule,
    KanbanCardComponent,
    MatTooltipModule,
    MatMenuModule
  ],
  templateUrl: './kanban-column.component.html',
  styleUrls: ['./kanban-column.component.scss']
})
export class KanbanColumnComponent {
  @Input() column!: KanbanColumn;
  @Input() items: KanbanItem[] = [];
  @Input() isLoading = false;
  @Input() connectedDropLists: string[] = [];

  @Output() itemEdit = new EventEmitter<KanbanItem>();
  @Output() itemDelete = new EventEmitter<KanbanItem>();
  @Output() itemDrop = new EventEmitter<CdkDragDrop<KanbanItem[]>>();
  @Output() itemClick = new EventEmitter<KanbanItem>();

  constructor() { }

  onToggleCollapse(): void {
    this.column.isCollapsed = !this.column.isCollapsed;
  }

  getColumnIcon(): string {
    switch (this.column.statusValue) {
      case 'pending': return 'schedule';
      case 'in_progress': return 'hourglass_empty';
      case 'review': return 'rate_review';
      case 'completed': return 'check_circle';
      case 'cancelled': return 'cancel';
      default: return 'schedule';
    }
  }

  getBadgeColor(): 'primary' | 'accent' | 'warn' {
    switch (this.column.statusValue) {
      case 'pending': return 'accent';
      case 'in_progress': return 'warn';
      case 'review': return 'primary';
      case 'completed': return 'primary';
      default: return 'primary';
    }
  }

  trackItem(index: number, item: KanbanItem): string | number {
    return item.id;
  }

  onItemEdit(item: KanbanItem): void {
    this.itemEdit.emit(item);
  }

  onItemDelete(item: KanbanItem): void {
    this.itemDelete.emit(item);
  }

  onItemClick(item: KanbanItem): void {
    this.itemClick.emit(item);
  }

  onDrop(event: CdkDragDrop<KanbanItem[]>): void {
    this.itemDrop.emit(event);
  }
}
