import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { Task } from '../../../../core/services/task';

@Component({
  selector: 'app-task-badge',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatChipsModule
  ],
  templateUrl: './task-badge.component.html',
  styleUrls: ['./task-badge.component.scss']
})
export class TaskBadgeComponent {
  @Input({ required: true }) task!: Task;
  @Input() showActions = false;
  @Input() compact = true;
  
  @Output() taskClick = new EventEmitter<Task>();
  @Output() statusChange = new EventEmitter<{ task: Task, newStatus: string }>();

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

  onClick(): void {
    this.taskClick.emit(this.task);
  }

  onStatusToggle(): void {
    const newStatus = this.task.status === 'completed' ? 'pending' : 'completed';
    this.statusChange.emit({ task: this.task, newStatus });
  }
} 