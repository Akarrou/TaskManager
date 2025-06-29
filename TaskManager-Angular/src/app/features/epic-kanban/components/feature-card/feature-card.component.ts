import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
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
    MatTooltipModule,
    MatMenuModule,
    TaskBadgeComponent
  ],
  templateUrl: './feature-card.component.html',
  styleUrls: ['./feature-card.component.scss']
})
export class FeatureCardComponent {
  @Input({ required: true }) feature!: Task;
  @Input() tasks: Task[] = [];
  @Input() isExpanded = false;
  
  @Output() expand = new EventEmitter<void>();
  @Output() collapse = new EventEmitter<void>();
  @Output() editFeature = new EventEmitter<Task>();
  @Output() deleteFeature = new EventEmitter<Task>();
  @Output() taskClick = new EventEmitter<Task>();

  get completedTasks(): Task[] {
    return this.tasks.filter(task => task.status === 'completed');
  }

  get totalTasks(): number {
    return this.tasks.length;
  }

  get progressPercentage(): number {
    if (this.totalTasks === 0) return 0;
    return Math.round((this.completedTasks.length / this.totalTasks) * 100);
  }

  get priorityColor(): string {
    switch (this.feature.priority) {
      case 'low': return 'success';
      case 'medium': return 'warn';  
      case 'high': return 'accent';
      case 'urgent': return 'primary';
      default: return 'basic';
    }
  }

  onToggleExpand(): void {
    if (this.isExpanded) {
      this.collapse.emit();
    } else {
      this.expand.emit();
    }
  }

  onEditFeature(): void {
    this.editFeature.emit(this.feature);
  }

  onDeleteFeature(): void {
    this.deleteFeature.emit(this.feature);
  }

  onTaskClick(task: Task): void {
    this.taskClick.emit(task);
  }
} 