import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatBadgeModule } from '@angular/material/badge';

import { Task } from '../../../../core/services/task';
import { KanbanColumn } from '../../models/epic-board.model';

@Component({
  selector: 'app-kanban-column',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatBadgeModule
  ],
  templateUrl: './kanban-column.component.html',
  styleUrls: ['./kanban-column.component.scss']
})
export class KanbanColumnComponent {
  @Input() column!: KanbanColumn;
  @Input() features: Task[] = [];
  @Input() isLoading = false;

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

  trackFeature(index: number, feature: Task): string {
    return feature.id || index.toString();
  }
} 