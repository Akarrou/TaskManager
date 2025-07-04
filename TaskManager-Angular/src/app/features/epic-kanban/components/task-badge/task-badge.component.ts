import { Component, Input, Output, EventEmitter, OnInit, ChangeDetectionStrategy, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { ISubtask, Task } from '../../../../core/services/task';

type TaskStatus = Task['status'];
type TaskPriority = 'low' | 'medium' | 'high' | 'urgent' | 'None';

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
  styleUrls: ['./task-badge.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskBadgeComponent implements OnInit, OnChanges {
  @Input({ required: true }) task!: ISubtask | Task;
  @Input() showQuickActions = true;
  @Input() enableNavigation = false;
  @Output() taskClick = new EventEmitter<Task | ISubtask>();
  @Output() taskUpdate = new EventEmitter<Partial<ISubtask | Task>>();
  @Output() taskDelete = new EventEmitter<string>();
  @Output() statusChange = new EventEmitter<TaskStatus>();
  @Output() priorityChange = new EventEmitter<string>();
  @Output() taskEdit = new EventEmitter<Task | ISubtask>();

  priorityConfig: { icon: string; label: TaskPriority } = { icon: 'horizontal_rule', label: 'None' };
  nextPriority: TaskPriority = 'low';
  priorityClass = 'is-priority-none';

  statusIcon = 'radio_button_unchecked';
  nextStatus: TaskStatus = 'in_progress';
  statusClass = 'is-status-pending';

  isOverdue = false;
  truncatedTitle = '';

  private readonly statusCycle: TaskStatus[] = ['pending', 'in_progress', 'review', 'completed'];
  private readonly priorityCycle: TaskPriority[] = ['None', 'low', 'medium', 'high', 'urgent'];

  ngOnInit(): void {
    this.updateVisuals();
  }

  ngOnChanges(): void {
    this.updateVisuals();
  }

  private updateVisuals(): void {
    if (!this.task) return;
    this.updateStatusVisuals();
    this.updatePriorityVisuals();
    this.isOverdue = false; // Simplified for now, as ISubtask doesn't have due_date
    this.truncatedTitle = this.task.title.length > 50 ? this.task.title.slice(0, 50) + '...' : this.task.title;
  }

  private updateStatusVisuals(): void {
    const currentStatus = (this.task.status as TaskStatus) || 'pending';
    const currentIndex = this.statusCycle.indexOf(currentStatus);
    this.nextStatus = this.statusCycle[(currentIndex + 1) % this.statusCycle.length];

    switch (currentStatus) {
      case 'completed':
        this.statusIcon = 'check_circle';
        this.statusClass = 'is-status-completed';
        break;
      case 'in_progress':
        this.statusIcon = 'hourglass_empty';
        this.statusClass = 'is-status-in_progress';
        break;
      case 'review':
        this.statusIcon = 'rate_review';
        this.statusClass = 'is-status-review';
        break;
      default:
        this.statusIcon = 'radio_button_unchecked';
        this.statusClass = 'is-status-pending';
        break;
    }
  }

  private updatePriorityVisuals(): void {
    const currentPriority = this.task.priority || 'None';
    const currentIndex = this.priorityCycle.indexOf(currentPriority as TaskPriority);
    this.nextPriority = this.priorityCycle[(currentIndex + 1) % this.priorityCycle.length];

    switch (currentPriority) {
      case 'high':
        this.priorityConfig = { icon: 'keyboard_arrow_up', label: 'high' };
        this.priorityClass = 'is-priority-high';
        break;
      case 'medium':
        this.priorityConfig = { icon: 'drag_handle', label: 'medium' };
        this.priorityClass = 'is-priority-medium';
        break;
      case 'low':
        this.priorityConfig = { icon: 'keyboard_arrow_down', label: 'low' };
        this.priorityClass = 'is-priority-low';
        break;
      default:
        this.priorityConfig = { icon: 'horizontal_rule', label: 'None' };
        this.priorityClass = 'is-priority-none';
        break;
    }
  }

  onClick(): void {
    this.taskClick.emit(this.task);
  }

  onStatusToggle(event: Event): void {
    event.stopPropagation();
    this.statusChange.emit(this.nextStatus);
  }

  onPriorityToggle(event: Event): void {
    event.stopPropagation();
    this.priorityChange.emit(this.nextPriority);
  }

  onQuickEdit(event: Event): void {
    event.stopPropagation();
    this.taskEdit.emit(this.task);
  }

  onQuickDelete(event: Event): void {
    event.stopPropagation();
    if (this.task.id)
      this.taskDelete.emit(this.task.id);
  }

  onContextMenu(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
  }

  get detailedTooltip(): string {
    return `Tâche: ${this.task.title}\nStatut: ${this.task.status}`;
  }

  changeStatus(newStatus: TaskStatus): void {
    if (this.task.status !== newStatus) {
      this.statusChange.emit(newStatus);
    }
  }
}
