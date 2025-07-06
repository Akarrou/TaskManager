import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { Router } from '@angular/router';

import { ISubtask } from '../../../features/tasks/subtask.model';
import { Task } from '../../../core/services/task';
import { KanbanItem } from '../../../features/epic-kanban/models/kanban-item.model';

type TaskStatus = Task['status'];

@Component({
  selector: 'app-kanban-card',
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
  ],
  templateUrl: './kanban-card.component.html',
  styleUrls: ['./kanban-card.component.scss'],
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
export class KanbanCardComponent {
  private router = inject(Router);

  @Input() item!: KanbanItem;
  @Input() showProgress = true;
  @Input() isExpanded = false;
  @Input() isDragging = false;
  @Input() tasks: (Task | ISubtask)[] = [];
  @Input() highlightedTaskIds: string[] = [];

  @Output() itemClick = new EventEmitter<KanbanItem>();
  @Output() itemEdit = new EventEmitter<KanbanItem>();
  @Output() itemDelete = new EventEmitter<KanbanItem>();
  @Output() addTaskToItem = new EventEmitter<KanbanItem>();
  @Output() toggleExpansion = new EventEmitter<string>();
  @Output() taskStatusChange = new EventEmitter<{ task: Task | ISubtask; newStatus: TaskStatus }>();
  @Output() taskPriorityChange = new EventEmitter<{ task: Task | ISubtask; newPriority: string }>();
  @Output() taskEdit = new EventEmitter<Task | ISubtask>();
  @Output() taskDelete = new EventEmitter<string>();
  @Output() itemToggleExpanded = new EventEmitter<KanbanItem>();

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
    return this.getTaskStatusConfig(this.item);
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
  getTaskStatusConfig(task: KanbanItem): { icon: string; color: string; label: string } {
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
    this.itemClick.emit(this.item);
  }

  onEditClick(event: Event): void {
    event.stopPropagation();
    this.itemEdit.emit(this.item);
  }

  onDeleteClick(event: Event): void {
    event.stopPropagation();
    this.itemDelete.emit(this.item);
  }

  onAddTaskClick(event: Event): void {
    event.stopPropagation();
    this.addTaskToItem.emit(this.item);
  }

  onToggleExpansion(event: Event): void {
    event.stopPropagation();
    if (typeof this.item.id === 'string') {
      this.toggleExpansion.emit(this.item.id);
    }
  }

  onNavigateToTasksKanban(event: Event): void {
    event.stopPropagation();
    this.router.navigate(['/features', this.item.id, 'tasks-kanban']);
  }

  onTaskClick(task: Task | ISubtask): void {
    // This might need further refactoring if sub-items are also KanbanItems
    console.log('Task clicked:', task);
  }

  /**
   * T018 - Méthode pour changer le statut d'une tâche depuis TaskBadge
   */
  onStatusChange(task: Task | ISubtask, newStatus: TaskStatus): void {
    this.taskStatusChange.emit({ task, newStatus });
  }

  formatDate(dateString: string | undefined): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  /**
   * T011 - Format d'affichage amélioré pour les assignations
   */
  formatAssignee(assigneeId: string | undefined): string {
    if (!assigneeId) return 'Non assignée';
    // This is a placeholder. In a real app, you'd resolve the user's name from their ID.
    // For now, we'll just show the last 4 chars of the UUID.
    return `User...${assigneeId.slice(-4)}`;
  }

  trackTask(index: number, task: Task | ISubtask): string {
    return task.id as string;
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
    return tag;
  }

  // T018 - Handle task priority change
  onPriorityChange(task: Task | ISubtask, newPriority: string): void {
    this.taskPriorityChange.emit({ task, newPriority });
  }

  // T018 - Handle task edit
  onTaskEdit(task: Task | ISubtask): void {
    this.taskEdit.emit(task);
  }

  // T018 - Handle task delete
  onTaskDelete(taskId: string): void {
    this.taskDelete.emit(taskId);
  }

  onDelete(taskId: string): void {
    this.itemDelete.emit(this.item);
  }
}
