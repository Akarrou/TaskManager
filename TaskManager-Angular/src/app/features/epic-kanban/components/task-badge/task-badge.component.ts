import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { Router } from '@angular/router';
import { Task } from '../../../../core/services/task';

@Component({
  selector: 'app-task-badge',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatChipsModule,
    MatMenuModule,
    MatDividerModule
  ],
  templateUrl: './task-badge.component.html',
  styleUrls: ['./task-badge.component.scss']
})
export class TaskBadgeComponent {
  @Input({ required: true }) task!: Task;
  @Input() showActions = false;
  @Input() showQuickActions = true;
  @Input() compact = true;
  @Input() enableNavigation = true;
  
  @Output() taskClick = new EventEmitter<Task>();
  @Output() statusChange = new EventEmitter<{ task: Task, newStatus: string }>();
  @Output() priorityChange = new EventEmitter<{ task: Task, newPriority: string }>();
  @Output() taskEdit = new EventEmitter<Task>();
  @Output() taskDelete = new EventEmitter<Task>();

  private router = inject(Router);

  private readonly statusCycle = ['pending', 'in_progress', 'review', 'completed'];
  
  private readonly priorityCycle = ['low', 'medium', 'high', 'urgent'];

  get statusIcon(): string {
    switch (this.task.status) {
      case 'completed': return 'check_circle';
      case 'in_progress': return 'schedule';
      case 'review': return 'rate_review';
      case 'pending': return 'radio_button_unchecked';
      case 'cancelled': return 'cancel';
      default: return 'radio_button_unchecked';
    }
  }

  get statusColor(): string {
    switch (this.task.status) {
      case 'completed': return 'text-green-500';
      case 'in_progress': return 'text-orange-500';
      case 'review': return 'text-blue-500';
      case 'pending': return 'text-gray-400';
      case 'cancelled': return 'text-red-500';
      default: return 'text-gray-400';
    }
  }

  get priorityConfig(): { icon: string; color: string; label: string } {
    switch (this.task.priority) {
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

  get priorityColor(): string {
    switch (this.task.priority) {
      case 'low': return 'border-green-200 bg-green-50';
      case 'medium': return 'border-yellow-200 bg-yellow-50';
      case 'high': return 'border-orange-200 bg-orange-50';
      case 'urgent': return 'border-red-200 bg-red-50';
      default: return 'border-gray-200 bg-gray-50';
    }
  }

  get truncatedTitle(): string {
    if (this.compact && this.task.title.length > 30) {
      return this.task.title.substring(0, 30) + '...';
    }
    return this.task.title;
  }

  get detailedTooltip(): string {
    const lines: string[] = [];
    
    lines.push(`📝 ${this.task.title}`);
    
    if (this.task.task_number) {
      lines.push(`🔢 #${this.task.task_number}`);
    }
    
    if (this.task.description) {
      const desc = this.task.description.length > 100 
        ? this.task.description.substring(0, 100) + '...'
        : this.task.description;
      lines.push(`📄 ${desc}`);
    }
    
    lines.push(`📊 Statut: ${this.getStatusLabel()}`);
    lines.push(`⚡ Priorité: ${this.priorityConfig.label}`);
    
    if (this.task.assigned_to) {
      lines.push(`👤 Assigné: ${this.task.assigned_to}`);
    }
    
    if (this.task.due_date) {
      const dueDate = new Date(this.task.due_date).toLocaleDateString('fr-FR');
      lines.push(`📅 Échéance: ${dueDate}`);
    }
    
    if (this.task.tags && this.task.tags.length > 0) {
      lines.push(`🏷️ Tags: ${this.task.tags.join(', ')}`);
    }
    
    lines.push('');
    lines.push('💡 Clic: Voir détails');
    lines.push('🔄 Clic status: Changer statut');
    
    return lines.join('\n');
  }

  get nextStatus(): string {
    const currentIndex = this.statusCycle.indexOf(this.task.status);
    const nextIndex = (currentIndex + 1) % this.statusCycle.length;
    return this.statusCycle[nextIndex];
  }

  get nextPriority(): string {
    const currentIndex = this.priorityCycle.indexOf(this.task.priority || 'medium');
    const nextIndex = (currentIndex + 1) % this.priorityCycle.length;
    return this.priorityCycle[nextIndex];
  }

  getStatusLabel(): string {
    switch (this.task.status) {
      case 'pending': return 'En attente';
      case 'in_progress': return 'En cours';
      case 'review': return 'En révision';
      case 'completed': return 'Terminé';
      case 'cancelled': return 'Annulé';
      default: return 'Inconnu';
    }
  }

  get isOverdue(): boolean {
    if (!this.task.due_date) return false;
    const dueDate = new Date(this.task.due_date);
    const today = new Date();
    return dueDate < today && this.task.status !== 'completed';
  }

  onClick(): void {
    if (this.enableNavigation) {
      this.router.navigate(['/tasks', this.task.id]);
    }
    this.taskClick.emit(this.task);
  }

  onStatusToggle(event: Event): void {
    event.stopPropagation();
    this.statusChange.emit({ task: this.task, newStatus: this.nextStatus });
  }

  onPriorityToggle(event: Event): void {
    event.stopPropagation();
    this.priorityChange.emit({ task: this.task, newPriority: this.nextPriority });
  }

  onQuickEdit(event: Event): void {
    event.stopPropagation();
    this.taskEdit.emit(this.task);
  }

  onQuickDelete(event: Event): void {
    event.stopPropagation();
    this.taskDelete.emit(this.task);
  }

  onContextMenu(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
  }
} 