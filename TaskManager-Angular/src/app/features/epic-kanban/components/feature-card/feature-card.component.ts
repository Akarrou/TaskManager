import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';

import { Task } from '../../../../core/services/task';

@Component({
  selector: 'app-feature-card',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatChipsModule,
    MatMenuModule,
    MatProgressBarModule,
    MatTooltipModule,
    MatDividerModule
  ],
  templateUrl: './feature-card.component.html',
  styleUrls: ['./feature-card.component.scss']
})
export class FeatureCardComponent {
  @Input() feature!: Task;
  @Input() showProgress = true;
  @Input() isExpanded = false;
  @Input() isDragging = false;
  @Input() tasks: Task[] = [];

  @Output() featureClick = new EventEmitter<Task>();
  @Output() featureEdit = new EventEmitter<Task>();
  @Output() featureDelete = new EventEmitter<Task>();
  @Output() toggleExpansion = new EventEmitter<string>();
  @Output() taskStatusChange = new EventEmitter<{ task: Task; newStatus: string }>();

  get featureProgress(): { completed: number; total: number; percentage: number } {
    const total = this.tasks.length;
    const completed = this.tasks.filter(task => task.status === 'completed').length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    return { completed, total, percentage };
  }

  get priorityConfig(): { icon: string; color: string; label: string } {
    switch (this.feature.priority) {
      case 'high':
        return { icon: 'priority_high', color: 'text-red-600', label: 'Haute' };
      case 'medium':
        return { icon: 'remove', color: 'text-orange-500', label: 'Moyenne' };
      case 'low':
        return { icon: 'keyboard_arrow_down', color: 'text-green-600', label: 'Basse' };
      default:
        return { icon: 'remove', color: 'text-gray-500', label: 'Non définie' };
    }
  }

  get statusConfig(): { icon: string; color: string; label: string } {
    switch (this.feature.status) {
      case 'pending':
        return { icon: 'schedule', color: 'text-gray-500', label: 'En attente' };
      case 'in_progress':
        return { icon: 'hourglass_empty', color: 'text-orange-500', label: 'En cours' };
      case 'completed':
        return { icon: 'check_circle', color: 'text-green-600', label: 'Terminé' };
      case 'cancelled':
        return { icon: 'cancel', color: 'text-red-500', label: 'Annulé' };
      default:
        return { icon: 'help', color: 'text-gray-500', label: 'Inconnu' };
    }
  }

  get typeConfig(): { color: string; label: string } {
    switch (this.feature.type) {
      case 'epic':
        return { color: 'text-red-600 bg-red-50 border-red-200', label: 'Epic' };
      case 'feature':
        return { color: 'text-blue-600 bg-blue-50 border-blue-200', label: 'Feature' };
      case 'task':
        return { color: 'text-green-600 bg-green-50 border-green-200', label: 'Task' };
      default:
        return { color: 'text-gray-600 bg-gray-50 border-gray-200', label: 'Unknown' };
    }
  }

  get isOverdue(): boolean {
    if (!this.feature.due_date) return false;
    const dueDate = new Date(this.feature.due_date);
    const today = new Date();
    return dueDate < today && this.feature.status !== 'completed';
  }

  onCardClick(): void {
    this.featureClick.emit(this.feature);
  }

  onEditClick(event: Event): void {
    event.stopPropagation();
    this.featureEdit.emit(this.feature);
  }

  onDeleteClick(event: Event): void {
    event.stopPropagation();
    this.featureDelete.emit(this.feature);
  }

  onToggleExpansion(event: Event): void {
    event.stopPropagation();
    if (this.feature.id) {
      this.toggleExpansion.emit(this.feature.id);
    }
  }

  onTaskClick(task: Task, event: Event): void {
    event.stopPropagation();
    this.featureClick.emit(task);
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { 
      day: '2-digit', 
      month: '2-digit',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    });
  }

  trackTask(index: number, task: Task): string {
    return task.id || index.toString();
  }
} 