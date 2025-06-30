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
import { trigger, state, style, transition, animate } from '@angular/animations';

import { Task } from '../../../../core/services/task';
import { TaskBadgeComponent } from '../task-badge/task-badge.component';

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
    MatDividerModule,
    TaskBadgeComponent
  ],
  templateUrl: './feature-card.component.html',
  styleUrls: ['./feature-card.component.scss'],
  animations: [
    trigger('expandCollapse', [
      state('collapsed', style({
        height: '0px',
        opacity: 0,
        overflow: 'hidden',
        paddingTop: '0px',
        paddingBottom: '0px'
      })),
      state('expanded', style({
        height: '*',
        opacity: 1,
        overflow: 'visible',
        paddingTop: '*',
        paddingBottom: '*'
      })),
      transition('collapsed <=> expanded', [
        animate('300ms cubic-bezier(0.4, 0.0, 0.2, 1)')
      ])
    ])
  ]
})
export class FeatureCardComponent {
  @Input() feature!: Task;
  @Input() showProgress = true;
  @Input() isExpanded = false;
  @Input() isDragging = false;
  @Input() tasks: Task[] = [];
  @Input() highlightedTaskIds: string[] = [];

  @Output() featureClick = new EventEmitter<Task>();
  @Output() featureEdit = new EventEmitter<Task>();
  @Output() featureDelete = new EventEmitter<Task>();
  @Output() addTaskToFeature = new EventEmitter<Task>();
  @Output() toggleExpansion = new EventEmitter<string>();
  @Output() taskStatusChange = new EventEmitter<{ task: Task; newStatus: string }>();
  @Output() taskPriorityChange = new EventEmitter<{ task: Task; newPriority: string }>();
  @Output() taskEdit = new EventEmitter<Task>();
  @Output() taskDelete = new EventEmitter<Task>();
  @Output() featureToggleExpanded = new EventEmitter<Task>();

  get featureProgress(): { completed: number; total: number; percentage: number } {
    const total = this.tasks.length;
    const completed = this.tasks.filter(task => task.status === 'completed').length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    return { completed, total, percentage };
  }

  get priorityConfig(): { icon: string; color: string; label: string } {
    switch (this.feature.priority) {
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
    return this.getTaskStatusConfig(this.feature);
  }

  get typeConfig(): { color: string; bgColor: string; borderColor: string; label: string } {
    switch (this.feature.type) {
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
    if (!this.feature.due_date) return false;
    const dueDate = new Date(this.feature.due_date);
    const today = new Date();
    return dueDate < today && this.feature.status !== 'completed';
  }

  get hasActiveTasks(): boolean {
    return this.tasks.some(task => task.status === 'in_progress');
  }

  get completionRate(): string {
    if (this.tasks.length === 0) return 'Aucune tâche';
    const completed = this.tasks.filter(task => task.status === 'completed').length;
    return `${completed}/${this.tasks.length} terminées`;
  }

  /**
   * T011 - Méthode pour obtenir la config de statut d'une tâche spécifique
   */
  getTaskStatusConfig(task: Task): { icon: string; color: string; label: string } {
    switch (task.status) {
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

  /**
   * T011 - Méthode pour obtenir la config de priorité d'une tâche spécifique
   */
  getTaskPriorityConfig(task: Task): { icon: string; color: string; label: string } {
    switch (task.priority) {
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

  onAddTaskClick(event: Event): void {
    event.stopPropagation();
    this.addTaskToFeature.emit(this.feature);
  }

  onToggleExpansion(event: Event): void {
    event.stopPropagation();
    if (this.feature.id) {
      this.toggleExpansion.emit(this.feature.id);
    }
  }

  onTaskClick(task: Task): void {
    this.featureClick.emit(task);
  }

  /**
   * T018 - Méthode pour changer le statut d'une tâche depuis TaskBadge
   */
  onTaskStatusChange(event: { task: Task, newStatus: string }): void {
    this.taskStatusChange.emit(event);
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffInDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffInDays === 0) return 'Aujourd\'hui';
    if (diffInDays === 1) return 'Demain';
    if (diffInDays === -1) return 'Hier';
    if (diffInDays > 0 && diffInDays <= 7) return `Dans ${diffInDays}j`;
    if (diffInDays < 0 && diffInDays >= -7) return `Il y a ${Math.abs(diffInDays)}j`;
    
    return date.toLocaleDateString('fr-FR', { 
      day: '2-digit', 
      month: '2-digit',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  }

  /**
   * T011 - Format d'affichage amélioré pour les assignations
   */
  formatAssignee(assignee: string): string {
    if (!assignee) return '';
    
    // Si c'est un email, ne prendre que la partie avant @
    if (assignee.includes('@')) {
      return assignee.split('@')[0];
    }
    
    // Sinon, limiter à 10 caractères
    return assignee.length > 10 ? assignee.substring(0, 10) + '...' : assignee;
  }

  trackTask(index: number, task: Task): string {
    return task.id || index.toString();
  }

  /**
   * T011 - Vérifier si une tâche est en retard
   */
  isTaskOverdue(task: Task): boolean {
    if (!task.due_date) return false;
    const dueDate = new Date(task.due_date);
    const today = new Date();
    return dueDate < today && task.status !== 'completed';
  }

  /**
   * T011 - TrackBy function pour les tags
   */
  trackTag(index: number, tag: string): string {
    return tag || index.toString();
  }

  // T018 - Handle task priority change
  onTaskPriorityChange(event: { task: Task, newPriority: string }): void {
    this.taskPriorityChange.emit(event);
  }

  // T018 - Handle task edit
  onTaskEdit(task: Task): void {
    this.taskEdit.emit(task);
  }

  // T018 - Handle task delete
  onTaskDelete(task: Task): void {
    this.taskDelete.emit(task);
  }
} 