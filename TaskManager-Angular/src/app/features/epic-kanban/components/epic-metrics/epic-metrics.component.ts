import { Component, Input, OnInit, OnDestroy, OnChanges, computed, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatListModule } from '@angular/material/list';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonModule } from '@angular/material/button';

import { Task } from '../../../../core/services/task';
import { EpicMetrics } from '../../models/epic-board.model';

interface TaskMetrics {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  cancelled: number;
  percentage: number;
  remaining: number;
}

interface FeatureMetrics {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  percentage: number;
}

interface TimeMetrics {
  estimatedHours: number;
  actualHours: number;
  remainingHours: number;
  efficiency: number;
  isOverBudget: boolean;
}

interface VelocityStats {
  tasksPerDay: number;
  trend: 'increasing' | 'stable' | 'decreasing';
  projectedCompletion?: Date;
  daysRemaining?: number;
}

@Component({
  selector: 'app-epic-metrics',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatDividerModule,
    MatListModule,
    MatChipsModule,
    MatTooltipModule,
    MatButtonModule
  ],
  templateUrl: './epic-metrics.component.html',
  styleUrls: ['./epic-metrics.component.scss']
})
export class EpicMetricsComponent implements OnInit, OnDestroy, OnChanges {
  @Input() epic!: Task;
  @Input() features: Task[] = [];
  @Input() tasks: Task[] = [];
  @Input() metrics!: EpicMetrics;

  constructor() {}

  ngOnInit(): void {}

  ngOnDestroy(): void {}

  ngOnChanges(): void {}

  // Méthode pour actualiser les métriques
  onRefresh(): void {
    // Émission d'un événement pour actualiser
    console.log('Actualisation des métriques demandée');
  }

  // Calculs de métriques avec valeurs par défaut
  get calculatedMetrics() {
    if (!this.metrics) {
      return {
        progressPercentage: 0,
        completedTasks: 0,
        inProgressTasks: 0,
        pendingTasks: 0,
        cancelledTasks: 0,
        totalFeatures: this.features.length,
        completedFeatures: this.features.filter(f => f.status === 'completed').length,
        inProgressFeatures: this.features.filter(f => f.status === 'in_progress').length,
        estimatedHours: 0,
        actualHours: 0,
        tasksPerDay: 0,
        totalTasks: this.tasks.length
      };
    }

    return {
      progressPercentage: this.metrics.progressPercentage || 0,
      completedTasks: this.metrics.completedTasks || 0,
      inProgressTasks: this.metrics.inProgressTasks || 0,
      pendingTasks: this.metrics.pendingTasks || 0,
      cancelledTasks: this.metrics.cancelledTasks || 0,
      totalFeatures: this.features.length,
      completedFeatures: this.features.filter(f => f.status === 'completed').length,
      inProgressFeatures: this.features.filter(f => f.status === 'in_progress').length,
      estimatedHours: this.metrics.estimatedHours || 0,
      actualHours: this.metrics.actualHours || 0,
      tasksPerDay: this.calculateTasksPerDay(),
      totalTasks: this.tasks.length
    };
  }

  private calculateTasksPerDay(): number {
    if (this.tasks.length === 0) return 0;
    
    // Calcul simple basé sur les tâches terminées
    const completedTasks = this.tasks.filter(t => t.status === 'completed');
    if (completedTasks.length === 0) return 0;
    
    // Simulation d'un calcul de vélocité sur 7 jours
    return parseFloat((completedTasks.length / 7).toFixed(1));
  }
} 