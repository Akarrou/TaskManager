import { Component, input, output, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CdkDragDrop, CdkDrag, CdkDropList, CdkDropListGroup, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Task } from '../../../core/services/task';

export type KanbanGroupBy = 'status' | 'priority';

export interface KanbanColumn {
  id: string;
  title: string;
  color: string;
  bgColor: string;
  tasks: Task[];
}

@Component({
  selector: 'app-kanban-board',
  standalone: true,
  imports: [
    CommonModule,
    CdkDropListGroup,
    CdkDropList,
    CdkDrag,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule
  ],
  templateUrl: './kanban-board.component.html',
  styleUrls: ['./kanban-board.component.scss']
})
export class KanbanBoardComponent {
  tasks = input.required<Task[]>();
  groupBy = input<KanbanGroupBy>('status');

  taskMoved = output<{ task: Task; newStatus?: string; newPriority?: string }>();
  taskEdit = output<Task>();
  taskDelete = output<string>();

  statusColumns: { id: string; title: string; color: string; bgColor: string }[] = [
    { id: 'pending', title: 'À faire', color: '#f59e0b', bgColor: '#fef9c3' },
    { id: 'in_progress', title: 'En cours', color: '#0ea5e9', bgColor: '#e0f2fe' },
    { id: 'completed', title: 'Terminées', color: '#22c55e', bgColor: '#dcfce7' },
    { id: 'cancelled', title: 'Annulées', color: '#6b7280', bgColor: '#f3f4f6' }
  ];

  priorityColumns: { id: string; title: string; color: string; bgColor: string }[] = [
    { id: 'urgent', title: 'Urgente', color: '#dc2626', bgColor: '#fee2e2' },
    { id: 'high', title: 'Haute', color: '#ef4444', bgColor: '#fee2e2' },
    { id: 'medium', title: 'Moyenne', color: '#f97316', bgColor: '#ffedd5' },
    { id: 'low', title: 'Basse', color: '#818cf8', bgColor: '#e0e7ff' }
  ];

  columns = computed<KanbanColumn[]>(() => {
    const taskList = this.tasks();
    const group = this.groupBy();

    if (group === 'status') {
      return this.statusColumns.map(col => ({
        ...col,
        tasks: taskList.filter(t => t.status === col.id)
      }));
    } else {
      return this.priorityColumns.map(col => ({
        ...col,
        tasks: taskList.filter(t => t.priority === col.id)
      }));
    }
  });

  drop(event: CdkDragDrop<Task[]>, columnId: string) {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      const task = event.previousContainer.data[event.previousIndex];

      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex
      );

      // Emit the change
      if (this.groupBy() === 'status') {
        this.taskMoved.emit({ task, newStatus: columnId });
      } else {
        this.taskMoved.emit({ task, newPriority: columnId });
      }
    }
  }

  onEditTask(task: Task) {
    this.taskEdit.emit(task);
  }

  onDeleteTask(taskId: string) {
    this.taskDelete.emit(taskId);
  }

  getEnvironmentBadge(env: string[] | undefined): string {
    if (!env || env.length === 0) return '';
    if (env.length === 2 && env.includes('frontend') && env.includes('backend')) return 'F&B';
    if (env.length === 1) {
      if (env[0] === 'frontend') return 'FE';
      if (env[0] === 'backend') return 'BE';
      if (env[0] === 'OPS') return 'OPS';
    }
    return '';
  }

  getEnvironmentClass(env: string[] | undefined): string {
    if (!env || env.length === 0) return '';
    if (env.length === 2 && env.includes('frontend') && env.includes('backend')) return 'env-badge--all';
    if (env.length === 1) {
      if (env[0] === 'frontend') return 'env-badge--fe';
      if (env[0] === 'backend') return 'env-badge--be';
      if (env[0] === 'OPS') return 'env-badge--ops';
    }
    return '';
  }

  getPriorityIcon(priority: string): string {
    switch (priority) {
      case 'urgent': return 'priority_high';
      case 'high': return 'arrow_upward';
      case 'medium': return 'remove';
      case 'low': return 'arrow_downward';
      default: return 'remove';
    }
  }

  getPriorityClass(priority: string): string {
    return `priority-${priority}`;
  }

  formatDate(date: string | undefined): string {
    if (!date) return '';
    return new Date(date).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short'
    });
  }

  isOverdue(dueDate: string | undefined): boolean {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  }
}
