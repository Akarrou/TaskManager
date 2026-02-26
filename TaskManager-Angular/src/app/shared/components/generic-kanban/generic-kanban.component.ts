import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop';
import { KanbanColumnComponent } from '../kanban-column/kanban-column.component';
import { KanbanItem } from '../../../core/models/task.model';
import { KanbanColumn } from '../../models/kanban.model';
import { Task } from '../../../core/models/task.model';

@Component({
  selector: 'app-generic-kanban',
  standalone: true,
  imports: [
    CommonModule,
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
  @Input() title = 'Kanban Board';
  @Input() items: KanbanItem[] = [];
  @Input() columns: KanbanColumn[] = [];
  @Input() loading = false;
  @Input() error: string | null = null;

  @Output() itemDropped = new EventEmitter<{ item: KanbanItem; newStatus: Task['status'] }>();
  @Output() itemEdited = new EventEmitter<KanbanItem>();
  @Output() itemDeleted = new EventEmitter<KanbanItem>();
  @Output() retryLoad = new EventEmitter<void>();

  get itemsByColumn(): Record<string, KanbanItem[]> {
    const grouped: Record<string, KanbanItem[]> = {};
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
    const newStatus = event.container.id as Task['status'];
    this.itemDropped.emit({ item, newStatus });
  }

  onItemEdit(item: KanbanItem) {
    this.itemEdited.emit(item);
  }

  onItemDelete(item: KanbanItem) {
    this.itemDeleted.emit(item);
  }

  trackColumn(_index: number, column: KanbanColumn): string {
    return column.id;
  }

  trackItem(_index: number, item: KanbanItem): string | number {
    return item.id;
  }
}
