import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router } from '@angular/router';

import { KanbanItem } from '../../../features/epic-kanban/models/kanban-item.model';
import { Task } from '../../../core/services/task';
import { ISubtask } from '../../../features/tasks/subtask.model';

@Component({
  selector: 'app-item-detail-popup',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatChipsModule,
    MatProgressBarModule,
  ],
  templateUrl: './item-detail-popup.component.html',
  styleUrls: ['./item-detail-popup.component.scss']
})
export class ItemDetailPopupComponent {
  private router = inject(Router);

  @Input() item!: KanbanItem;
  @Input() showProgress = true;
  @Input() tasks: (Task | ISubtask)[] = [];

  @Output() close = new EventEmitter<void>();
  @Output() edit = new EventEmitter<KanbanItem>();
  @Output() addTask = new EventEmitter<KanbanItem>();
  @Output() navigateToKanban = new EventEmitter<KanbanItem>();

  get itemProgress(): { completed: number; total: number; percentage: number } {
    const total = this.tasks.length;
    const completed = this.tasks.filter(task => task.status === 'completed').length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { completed, total, percentage };
  }

  get itemNumberConfig(): { color: string; bgColor: string; label: string; icon: string } {
    switch (this.item?.type) {
      case 'epic':
        return {
          color: 'text-red-700',
          bgColor: 'bg-red-100 border-red-300',
          label: 'Epic',
          icon: 'E'
        };
      case 'feature':
        return {
          color: 'text-blue-700',
          bgColor: 'bg-blue-100 border-blue-300',
          label: 'Feature',
          icon: 'F'
        };
      case 'task':
        return {
          color: 'text-green-700',
          bgColor: 'bg-green-100 border-green-300',
          label: 'Tâche',
          icon: 'T'
        };
      default:
        return {
          color: 'text-gray-700',
          bgColor: 'bg-gray-100 border-gray-300',
          label: 'Item',
          icon: ''
        };
    }
  }

  get priorityConfig(): { icon: string; color: string; label: string } {
    switch (this.item.priority) {
      case 'urgent':
        return { icon: 'priority_high', color: 'text-purple-600', label: 'Urgent' };
      case 'high':
        return { icon: 'arrow_upward', color: 'text-red-600', label: 'Haute' };
      case 'medium':
        return { icon: 'remove', color: 'text-orange-500', label: 'Moyenne' };
      case 'low':
        return { icon: 'keyboard_arrow_down', color: 'text-green-600', label: 'Basse' };
      default:
        return { icon: 'remove', color: 'text-gray-500', label: 'Non définie' };
    }
  }

  get statusConfig(): { icon: string; color: string; label: string } {
    switch (this.item.status) {
      case 'pending':
        return { icon: 'schedule', color: 'text-gray-500', label: 'En attente' };
      case 'in_progress':
        return { icon: 'hourglass_empty', color: 'text-orange-500', label: 'En cours' };
      case 'review':
        return { icon: 'rate_review', color: 'text-blue-500', label: 'En révision' };
      case 'completed':
        return { icon: 'check_circle', color: 'text-green-600', label: 'Terminé' };
      case 'cancelled':
        return { icon: 'cancel', color: 'text-red-500', label: 'Annulé' };
      default:
        return { icon: 'help', color: 'text-gray-500', label: 'Inconnu' };
    }
  }

  get typeConfig(): { color: string; bgColor: string; borderColor: string; label: string } {
    switch (this.item.type) {
      case 'epic':
        return {
          color: 'text-red-700',
          bgColor: 'bg-red-100',
          borderColor: 'border-red-300',
          label: 'Epic'
        };
      case 'feature':
        return {
          color: 'text-blue-700',
          bgColor: 'bg-blue-100',
          borderColor: 'border-blue-300',
          label: 'Feature'
        };
      case 'task':
        return {
          color: 'text-green-700',
          bgColor: 'bg-green-100',
          borderColor: 'border-green-300',
          label: 'Task'
        };
      default:
        return {
          color: 'text-gray-700',
          bgColor: 'bg-gray-100',
          borderColor: 'border-gray-300',
          label: 'Unknown'
        };
    }
  }

  get isOverdue(): boolean {
    if (!this.item.dueDate) return false;
    const dueDate = new Date(this.item.dueDate);
    const today = new Date();
    return dueDate < today && this.item.status !== 'completed';
  }

  onOverlayClick(): void {
    this.close.emit();
  }

  onClose(): void {
    this.close.emit();
  }

  onEdit(): void {
    this.edit.emit(this.item);
    this.close.emit();
  }

  onAddTask(): void {
    this.addTask.emit(this.item);
    this.close.emit();
  }

  onNavigateToKanban(): void {
    this.router.navigate(['/features', this.item.id, 'tasks-kanban']);
    this.close.emit();
  }

  formatDate(dateString: string | undefined): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }
}