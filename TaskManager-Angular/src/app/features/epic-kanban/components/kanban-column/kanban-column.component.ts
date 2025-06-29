import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatBadgeModule } from '@angular/material/badge';

import { Task } from '../../../../core/services/task';
import { KanbanColumn } from '../../models/epic-board.model';
import { FeatureCardComponent } from '../feature-card/feature-card.component';

@Component({
  selector: 'app-kanban-column',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatBadgeModule,
    FeatureCardComponent
  ],
  templateUrl: './kanban-column.component.html',
  styleUrls: ['./kanban-column.component.scss']
})
export class KanbanColumnComponent {
  @Input() column!: KanbanColumn;
  @Input() features: Task[] = [];
  @Input() isLoading = false;
  @Input() expandedFeatures: Set<string> = new Set();
  @Input() featureTasks: { [featureId: string]: Task[] } = {};

  @Output() featureClick = new EventEmitter<Task>();
  @Output() featureEdit = new EventEmitter<Task>();
  @Output() featureDelete = new EventEmitter<Task>();
  @Output() toggleExpansion = new EventEmitter<string>();
  @Output() taskStatusChange = new EventEmitter<{ task: Task; newStatus: string }>();

  onToggleCollapse(): void {
    this.column.isCollapsed = !this.column.isCollapsed;
  }

  getColumnIcon(): string {
    switch (this.column.statusValue) {
      case 'pending': return 'schedule';
      case 'in_progress': return 'hourglass_empty';
      case 'review': return 'rate_review';
      case 'completed': return 'check_circle';
      case 'cancelled': return 'cancel';
      default: return 'schedule';
    }
  }

  getBadgeColor(): 'primary' | 'accent' | 'warn' {
    switch (this.column.statusValue) {
      case 'pending': return 'accent';
      case 'in_progress': return 'warn';
      case 'review': return 'primary';
      case 'completed': return 'primary';
      default: return 'primary';
    }
  }

  trackFeature(index: number, feature: Task): string {
    return feature.id || index.toString();
  }

  getFeatureTasks(featureId: string): Task[] {
    return this.featureTasks[featureId] || [];
  }

  isFeatureExpanded(featureId: string): boolean {
    return this.expandedFeatures.has(featureId);
  }

  onFeatureClick(feature: Task): void {
    this.featureClick.emit(feature);
  }

  onFeatureEdit(feature: Task): void {
    this.featureEdit.emit(feature);
  }

  onFeatureDelete(feature: Task): void {
    this.featureDelete.emit(feature);
  }

  onToggleFeatureExpansion(featureId: string): void {
    this.toggleExpansion.emit(featureId);
  }

  onTaskStatusChanged(event: { task: Task; newStatus: string }): void {
    this.taskStatusChange.emit(event);
  }
} 