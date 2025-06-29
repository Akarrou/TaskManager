import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatListModule } from '@angular/material/list';

import { Task } from '../../../../core/services/task';
import { EpicMetrics } from '../../models/epic-board.model';

@Component({
  selector: 'app-epic-metrics',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatDividerModule,
    MatListModule
  ],
  templateUrl: './epic-metrics.component.html',
  styleUrls: ['./epic-metrics.component.scss']
})
export class EpicMetricsComponent {
  @Input() metrics!: EpicMetrics;
  @Input() epic!: Task;

  getProgressColor(): string {
    const progress = this.metrics?.progressPercentage || 0;
    if (progress >= 80) return 'primary';
    if (progress >= 50) return 'accent';
    return 'warn';
  }

  getVelocityIcon(): string {
    const velocity = this.metrics?.velocity || 0;
    if (velocity > 5) return 'trending_up';
    if (velocity > 2) return 'trending_flat';
    return 'trending_down';
  }

  getVelocityColor(): string {
    const velocity = this.metrics?.velocity || 0;
    if (velocity > 5) return 'text-green-600';
    if (velocity > 2) return 'text-orange-600';
    return 'text-red-600';
  }
} 