import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { DragDropModule, CdkDropListGroup, CdkDragDrop } from '@angular/cdk/drag-drop';
import { KanbanColumnComponent } from '../kanban-column/kanban-column.component';
import { KanbanItem } from '../../../features/epic-kanban/models/kanban-item.model';
import { KanbanColumn } from '../../../features/epic-kanban/models/epic-board.model';
import { NgIf, NgFor } from '@angular/common';

@Component({
  selector: 'app-generic-kanban',
  standalone: true,
  imports: [
    NgIf,
    NgFor,
    DragDropModule,
    MatIconModule,
    MatButtonModule,
    KanbanColumnComponent,
  ],
  templateUrl: './generic-kanban.component.html',
  styleUrls: ['./generic-kanban.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenericKanbanComponent {
  @Input() title: string = 'Kanban Board';
  @Input() items: KanbanItem[] = [];
  @Input() columns: KanbanColumn[] = [];
  @Input() loading: boolean = false;
  @Input() error: string | null = null;

  @Output() itemDropped = new EventEmitter<{ item: KanbanItem; newStatus: string }>();
  @Output() itemEdited = new EventEmitter<KanbanItem>();
  @Output() itemDeleted = new EventEmitter<KanbanItem>();
  @Output() retryLoad = new EventEmitter<void>();

  get itemsByColumn(): { [key: string]: KanbanItem[] } {
    const grouped: { [key: string]: KanbanItem[] } = {};
    if (this.items && this.columns) {
      this.columns.forEach(col => grouped[col.id] = []);
      this.items.forEach(item => {
        if (grouped[item.status]) {
          grouped[item.status].push(item);
        }
      });
    }
    return grouped;
  }

  onItemDrop(event: CdkDragDrop<KanbanItem[]>) {
    const item = event.item.data;
    const newStatus = event.container.id;
    this.itemDropped.emit({ item, newStatus });
  }

  onItemEdit(item: KanbanItem) {
    this.itemEdited.emit(item);
  }

  onItemDelete(item: KanbanItem) {
    this.itemDeleted.emit(item);
  }

  trackColumn(index: number, column: KanbanColumn): string {
    return column.id;
  }

  trackItem(index: number, item: KanbanItem): string | number {
    return item.id;
  }
}
