import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { Task } from '../../../../core/services/task';
import { TaskBadgeComponent } from '../task-badge/task-badge.component';

@Component({
  selector: 'app-feature-card',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatMenuModule,
    MatProgressBarModule,
    TaskBadgeComponent
  ],
  templateUrl: './feature-card.component.html',
  styleUrls: ['./feature-card.component.scss']
})
export class FeatureCardComponent {

  @Input({ required: true }) feature!: Task;
  @Input() tasks: Task[] = [];
  @Input() isExpanded = false;
  @Input() showTasks = true;

  @Output() expand = new EventEmitter<string>();
  @Output() edit = new EventEmitter<Task>();
  @Output() delete = new EventEmitter<Task>();
  @Output() taskStatusChange = new EventEmitter<{ task: Task; newStatus: string }>();
  @Output() taskClick = new EventEmitter<Task>();

  onToggleExpansion(): void {
    if (this.feature.id) {
      this.expand.emit(this.feature.id);
    }
  }

  onEditFeature(): void {
    this.edit.emit(this.feature);
  }

  onDeleteFeature(): void {
    this.delete.emit(this.feature);
  }

  onTaskStatusChanged(task: Task, newStatus: string): void {
    this.taskStatusChange.emit({ task, newStatus });
  }

  onTaskClicked(task: Task): void {
    this.taskClick.emit(task);
  }

  getProgressPercentage(): number {
    if (!this.tasks || this.tasks.length === 0) return 0;
    
    const completedTasks = this.tasks.filter(task => task.status === 'completed').length;
    return Math.round((completedTasks / this.tasks.length) * 100);
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'completed': return 'green';
      case 'in_progress': return 'orange';
      case 'pending': return 'blue';
      case 'cancelled': return 'red';
      default: return 'gray';
    }
  }

  getPriorityIcon(priority: string): string {
    switch (priority) {
      case 'high': return 'keyboard_arrow_up';
      case 'medium': return 'remove';
      case 'low': return 'keyboard_arrow_down';
      default: return 'remove';
    }
  }

  getPriorityColor(priority: string): string {
    switch (priority) {
      case 'high': return 'red';
      case 'medium': return 'orange';
      case 'low': return 'green';
      default: return 'gray';
    }
  }

  trackTask(index: number, task: Task): string {
    return task.id || index.toString();
  }
} 