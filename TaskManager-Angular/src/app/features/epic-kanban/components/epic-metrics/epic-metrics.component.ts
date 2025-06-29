import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, SimpleChanges, computed, signal, effect, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatListModule } from '@angular/material/list';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatExpansionModule } from '@angular/material/expansion';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData, ChartType } from 'chart.js';

import { Task } from '../../../../core/services/task';
import { EpicMetrics } from '../../models/epic-board.model';

// T012 - Interfaces avancées pour métriques
interface TaskMetrics {
  total: number;
  completed: number;
  inProgress: number;
  review: number;
  pending: number;
  cancelled: number;
  percentage: number;
  remaining: number;
  overdue: number;
  completionRate: number; // tâches/jour
}

interface FeatureMetrics {
  total: number;
  completed: number;
  inProgress: number;
  review: number;
  pending: number;
  percentage: number;
  avgTasksPerFeature: number;
  blockedFeatures: number;
}

interface TimeMetrics {
  estimatedHours: number;
  actualHours: number;
  remainingHours: number;
  efficiency: number; // actualHours / estimatedHours
  isOverBudget: boolean;
  timePerTask: number;
  projectedCompletion: Date | null;
}

interface TeamMetrics {
  totalMembers: number;
  activeMembers: number;
  assignedTasks: { [member: string]: number };
  completedTasks: { [member: string]: number };
  topPerformer: string | null;
  workloadDistribution: 'balanced' | 'unbalanced' | 'overloaded';
}

interface VelocityStats {
  tasksPerDay: number;
  featuresPerWeek: number;
  trend: 'increasing' | 'stable' | 'decreasing';
  projectedCompletion: Date | null;
  daysRemaining: number;
  sprintVelocity: number;
}

interface Alert {
  id: string;
  type: 'danger' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  actionable: boolean;
}

// T012 - Interface pour export
interface MetricsExport {
  epic: {
    id: string;
    title: string;
    status: string;
  };
  timestamp: string;
  taskMetrics: TaskMetrics;
  featureMetrics: FeatureMetrics;
  timeMetrics: TimeMetrics;
  teamMetrics: TeamMetrics;
  velocityStats: VelocityStats;
  alerts: Alert[];
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
    MatButtonModule,
    MatMenuModule,
    MatSnackBarModule,
    MatExpansionModule,
    BaseChartDirective
  ],
  templateUrl: './epic-metrics.component.html',
  styleUrls: ['./epic-metrics.component.scss']
})
export class EpicMetricsComponent implements OnInit, OnDestroy, OnChanges {
  private snackBar = inject(MatSnackBar);
  private cdr = inject(ChangeDetectorRef);

  @Input() epic!: Task;
  @Input() features: Task[] = [];
  @Input() tasks: Task[] = [];
  @Input() metrics!: EpicMetrics;
  @Input() refreshInterval: number = 30000; // 30 secondes

  @Output() refreshRequested = new EventEmitter<void>();
  @Output() alertAction = new EventEmitter<{ alertId: string; action: string }>();
  @Output() exportRequested = new EventEmitter<MetricsExport>();

  // T012 - État du composant
  private refreshTimer?: number;
  lastRefresh = new Date();
  isRefreshing = false;
  viewMode: 'overview' | 'detailed' = 'overview';

  // T012 - Métriques calculées temps réel
  taskMetrics = signal<TaskMetrics>({
    total: 0, completed: 0, inProgress: 0, review: 0, pending: 0, cancelled: 0,
    percentage: 0, remaining: 0, overdue: 0, completionRate: 0
  });

  featureMetrics = signal<FeatureMetrics>({
    total: 0, completed: 0, inProgress: 0, review: 0, pending: 0,
    percentage: 0, avgTasksPerFeature: 0, blockedFeatures: 0
  });

  timeMetrics = signal<TimeMetrics>({
    estimatedHours: 0, actualHours: 0, remainingHours: 0,
    efficiency: 0, isOverBudget: false, timePerTask: 0, projectedCompletion: null
  });

  teamMetrics = signal<TeamMetrics>({
    totalMembers: 0, activeMembers: 0, assignedTasks: {}, completedTasks: {},
    topPerformer: null, workloadDistribution: 'balanced'
  });

  velocityStats = signal<VelocityStats>({
    tasksPerDay: 0, featuresPerWeek: 0, trend: 'stable',
    projectedCompletion: null, daysRemaining: 0, sprintVelocity: 0
  });

  alerts = signal<Alert[]>([]);

  // T012 - Configuration graphiques Chart.js
  progressChartType: 'doughnut' = 'doughnut';
  progressChartData: ChartData<'doughnut'> = {
    labels: ['Terminé', 'En cours', 'En révision', 'En attente'],
    datasets: [{
      data: [0, 0, 0, 0],
      backgroundColor: ['#10b981', '#f59e0b', '#3b82f6', '#6b7280'],
      borderWidth: 0
    }]
  };

  progressChartOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '60%',
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => {
            const label = context.label || '';
            const value = context.parsed;
            const total = context.dataset.data.reduce((a, b) => Number(a) + Number(b), 0) as number;
            const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
            return `${label}: ${value} (${percentage}%)`;
          }
        }
      }
    }
  };

  velocityChartType: 'line' = 'line';
  velocityChartData: ChartData<'line'> = {
    labels: ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4'],
    datasets: [{
      label: 'Tâches complétées',
      data: [0, 0, 0, 0],
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      tension: 0.4,
      fill: true
    }]
  };

  velocityChartOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: { beginAtZero: true },
      x: { display: true }
    },
    plugins: {
      legend: { display: false }
    }
  };

  ngOnInit(): void {
    // Force la génération des métriques au démarrage (même sans données)
    this.updateAllMetrics();
    this.startAutoRefresh();
  }

  ngOnDestroy(): void {
    this.stopAutoRefresh();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['tasks'] || changes['features'] || changes['epic']) {
      this.updateAllMetrics();
    }
  }

  // T012 - Calcul complet des métriques temps réel
  private updateAllMetrics(): void {
    // Si pas de données, utiliser des données de démo
    if (!this.tasks.length && !this.features.length) {
      this.generateDemoMetrics();
    } else {
      this.calculateTaskMetrics();
      this.calculateFeatureMetrics();
      this.calculateTimeMetrics();
      this.calculateTeamMetrics();
      this.calculateVelocityStats();
      this.generateAlerts();
    }
    this.updateCharts();
    this.lastRefresh = new Date();
    this.cdr.detectChanges();
  }

  // T012 - Génération de métriques de démonstration
  private generateDemoMetrics(): void {
    this.taskMetrics.set({
      total: 17,
      completed: 8,
      inProgress: 5,
      review: 2,
      pending: 2,
      cancelled: 0,
      percentage: 47,
      remaining: 9,
      overdue: 3,
      completionRate: 2.1
    });

    this.featureMetrics.set({
      total: 4,
      completed: 1,
      inProgress: 2,
      review: 1,
      pending: 0,
      percentage: 25,
      avgTasksPerFeature: 4,
      blockedFeatures: 1
    });

    this.timeMetrics.set({
      estimatedHours: 600,
      actualHours: 320,
      remainingHours: 280,
      efficiency: 0.85,
      isOverBudget: false,
      timePerTask: 18.8,
      projectedCompletion: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // +14 jours
    });

    this.teamMetrics.set({
      totalMembers: 4,
      activeMembers: 3,
      assignedTasks: { 'John': 5, 'Jane': 4, 'Bob': 3, 'Alice': 5 },
      completedTasks: { 'John': 3, 'Jane': 2, 'Bob': 2, 'Alice': 1 },
      topPerformer: 'John',
      workloadDistribution: 'balanced'
    });

    this.velocityStats.set({
      tasksPerDay: 2.1,
      featuresPerWeek: 1.2,
      trend: 'increasing',
      projectedCompletion: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      daysRemaining: 14,
      sprintVelocity: 8
    });

    this.alerts.set([
      {
        id: 'demo-1',
        type: 'warning',
        title: 'Retard détecté',
        message: '3 tâches sont en retard sur leurs dates limites',
        timestamp: new Date(),
        actionable: true
      },
      {
        id: 'demo-2',
        type: 'info',
        title: 'Sprint en cours',
        message: 'Sprint 3 - 8 points de vélocité cette semaine',
        timestamp: new Date(),
        actionable: false
      }
    ]);
  }

  private calculateTaskMetrics(): void {
    const total = this.tasks.length;
    const completed = this.tasks.filter(t => t.status === 'completed').length;
    const inProgress = this.tasks.filter(t => t.status === 'in_progress').length;
    const review = this.tasks.filter(t => t.status === 'review').length;
    const pending = this.tasks.filter(t => t.status === 'pending').length;
    const cancelled = this.tasks.filter(t => t.status === 'cancelled').length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    const remaining = total - completed - cancelled;
    
    // Calcul des tâches en retard
    const overdue = this.tasks.filter(t => {
      if (!t.due_date || t.status === 'completed' || t.status === 'cancelled') return false;
      return new Date(t.due_date) < new Date();
    }).length;

    // Calcul du taux de completion (tâches/jour)
    const completionRate = this.calculateCompletionRate();

    this.taskMetrics.set({
      total, completed, inProgress, review, pending, cancelled,
      percentage, remaining, overdue, completionRate
    });
  }

  private calculateFeatureMetrics(): void {
    const total = this.features.length;
    const completed = this.features.filter(f => f.status === 'completed').length;
    const inProgress = this.features.filter(f => f.status === 'in_progress').length;
    const review = this.features.filter(f => f.status === 'review').length;
    const pending = this.features.filter(f => f.status === 'pending').length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    const avgTasksPerFeature = total > 0 ? Math.round(this.tasks.length / total) : 0;
    
    // Features bloquées (avec tâches en retard)
    const blockedFeatures = this.features.filter(feature => {
      const featureTasks = this.tasks.filter(t => t.parent_task_id === feature.id);
      return featureTasks.some(t => {
        if (!t.due_date || t.status === 'completed') return false;
        return new Date(t.due_date) < new Date();
      });
    }).length;

    this.featureMetrics.set({
      total, completed, inProgress, review, pending,
      percentage, avgTasksPerFeature, blockedFeatures
    });
  }

  private calculateTimeMetrics(): void {
    const estimatedHours = this.tasks.reduce((sum, t) => sum + (t.estimated_hours || 0), 0);
    const actualHours = this.tasks.reduce((sum, t) => sum + (t.actual_hours || 0), 0);
    const remainingHours = Math.max(0, estimatedHours - actualHours);
    const efficiency = estimatedHours > 0 ? actualHours / estimatedHours : 0;
    const isOverBudget = actualHours > estimatedHours;
    const timePerTask = this.tasks.length > 0 ? actualHours / this.tasks.length : 0;
    
    // Projection de completion basée sur la vélocité
    const projectedCompletion = this.calculateProjectedCompletion();

    this.timeMetrics.set({
      estimatedHours, actualHours, remainingHours,
      efficiency, isOverBudget, timePerTask, projectedCompletion
    });
  }

  private calculateTeamMetrics(): void {
    const assignedTasks: { [member: string]: number } = {};
    const completedTasks: { [member: string]: number } = {};

    this.tasks.forEach(task => {
      if (task.assigned_to) {
        assignedTasks[task.assigned_to] = (assignedTasks[task.assigned_to] || 0) + 1;
        if (task.status === 'completed') {
          completedTasks[task.assigned_to] = (completedTasks[task.assigned_to] || 0) + 1;
        }
      }
    });

    const totalMembers = Object.keys(assignedTasks).length;
    const activeMembers = Object.keys(assignedTasks).filter(member => {
      const memberTasks = this.tasks.filter(t => t.assigned_to === member);
      return memberTasks.some(t => t.status === 'in_progress' || t.status === 'review');
    }).length;

    // Top performer (ratio completion)
    const topPerformer = Object.keys(completedTasks).reduce((top, member) => {
      const completionRatio = completedTasks[member] / (assignedTasks[member] || 1);
      const topRatio = top ? completedTasks[top] / (assignedTasks[top] || 1) : 0;
      return completionRatio > topRatio ? member : top;
    }, null as string | null);

    // Distribution de charge
    const workloads = Object.values(assignedTasks);
    const avgWorkload = workloads.length > 0 ? workloads.reduce((a, b) => a + b, 0) / workloads.length : 0;
    const maxWorkload = Math.max(...workloads, 0);
    const workloadDistribution: TeamMetrics['workloadDistribution'] = 
      maxWorkload > avgWorkload * 2 ? 'overloaded' :
      maxWorkload > avgWorkload * 1.5 ? 'unbalanced' : 'balanced';

    this.teamMetrics.set({
      totalMembers, activeMembers, assignedTasks, completedTasks,
      topPerformer, workloadDistribution
    });
  }

  private calculateVelocityStats(): void {
    const tasksPerDay = this.calculateCompletionRate();
    const completedFeatures = this.features.filter(f => f.status === 'completed').length;
    const featuresPerWeek = completedFeatures; // Simplification pour demo
    
    // Trend basé sur les dernières complétions
    const trend: VelocityStats['trend'] = 'stable'; // Simplification
    
    const remainingTasks = this.taskMetrics().remaining;
    const daysRemaining = tasksPerDay > 0 ? Math.ceil(remainingTasks / tasksPerDay) : 0;
    
    const projectedCompletion = daysRemaining > 0 ? 
      new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000) : null;

    const sprintVelocity = tasksPerDay * 14; // Vélocité sur 2 semaines

    this.velocityStats.set({
      tasksPerDay, featuresPerWeek, trend,
      projectedCompletion, daysRemaining, sprintVelocity
    });
  }

  private calculateCompletionRate(): number {
    const completedTasks = this.tasks.filter(t => t.status === 'completed');
    if (completedTasks.length === 0) return 0;
    
    // Simulation basée sur une semaine de travail
    return parseFloat((completedTasks.length / 7).toFixed(1));
  }

  private calculateProjectedCompletion(): Date | null {
    const remainingHours = this.timeMetrics().remainingHours;
    const avgHoursPerDay = 8; // Simulation
    const daysNeeded = Math.ceil(remainingHours / avgHoursPerDay);
    
    return daysNeeded > 0 ? 
      new Date(Date.now() + daysNeeded * 24 * 60 * 60 * 1000) : null;
  }

  // T012 - Génération d'alertes intelligentes
  private generateAlerts(): void {
    const currentAlerts: Alert[] = [];
    const taskM = this.taskMetrics();
    const featureM = this.featureMetrics();
    const timeM = this.timeMetrics();
    const teamM = this.teamMetrics();

    // Alerte retards
    if (taskM.overdue > 0) {
      currentAlerts.push({
        id: 'overdue-tasks',
        type: 'danger',
        title: 'Tâches en retard',
        message: `${taskM.overdue} tâche(s) sont en retard`,
        timestamp: new Date(),
        actionable: true
      });
    }

    // Alerte budget temps
    if (timeM.isOverBudget) {
      currentAlerts.push({
        id: 'over-budget',
        type: 'warning',
        title: 'Budget temps dépassé',
        message: `${(timeM.efficiency * 100).toFixed(0)}% du budget utilisé`,
        timestamp: new Date(),
        actionable: true
      });
    }

    // Alerte charge équipe
    if (teamM.workloadDistribution === 'overloaded') {
      currentAlerts.push({
        id: 'team-overload',
        type: 'warning',
        title: 'Équipe surchargée',
        message: 'Répartition des tâches déséquilibrée',
        timestamp: new Date(),
        actionable: true
      });
    }

    // Alerte features bloquées
    if (featureM.blockedFeatures > 0) {
      currentAlerts.push({
        id: 'blocked-features',
        type: 'warning',
        title: 'Features bloquées',
        message: `${featureM.blockedFeatures} feature(s) avec tâches en retard`,
        timestamp: new Date(),
        actionable: true
      });
    }

    this.alerts.set(currentAlerts);
  }

  // T012 - Mise à jour des graphiques
  private updateCharts(): void {
    const taskM = this.taskMetrics();
    const velocityM = this.velocityStats();
    
    // Graphique progression (doughnut: completed vs remaining)
    this.progressChartData = {
      datasets: [{
        data: [taskM.completed, taskM.total - taskM.completed],
        backgroundColor: ['#10b981', '#e5e7eb'],
        borderWidth: 0,
        hoverBackgroundColor: ['#059669', '#d1d5db']
      }]
    };

    // Configuration options pour le graphique progression
    this.progressChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: (context: any) => {
              const label = context.dataIndex === 0 ? 'Terminées' : 'Restantes';
              const value = context.parsed;
              const percentage = taskM.total > 0 ? Math.round((value / taskM.total) * 100) : 0;
              return `${label}: ${value} (${percentage}%)`;
            }
          }
        }
      }
    };

    // Graphique vélocité (line chart avec historique)
    this.velocityChartData = {
      labels: ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4'],
      datasets: [{
        label: 'Vélocité (points)',
        data: [6, 8, velocityM.sprintVelocity, Math.round(velocityM.sprintVelocity * 1.2)],
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4,
        fill: true,
        pointBackgroundColor: '#3b82f6',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 4
      }]
    };

    // Configuration options pour le graphique vélocité
    this.velocityChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 2
          }
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          mode: 'index',
          intersect: false
        }
      }
    };
  }

  // T012 - Actions publiques
  onRefresh(): void {
    this.isRefreshing = true;
    this.refreshRequested.emit();
    this.updateAllMetrics();
    
    setTimeout(() => {
      this.isRefreshing = false;
      this.snackBar.open('Métriques actualisées', 'OK', { duration: 2000 });
    }, 1000);
  }

  onExportMetrics(): void {
    const exportData: MetricsExport = {
      epic: {
        id: this.epic?.id || '',
        title: this.epic?.title || '',
        status: this.epic?.status || ''
      },
      timestamp: new Date().toISOString(),
      taskMetrics: this.taskMetrics(),
      featureMetrics: this.featureMetrics(),
      timeMetrics: this.timeMetrics(),
      teamMetrics: this.teamMetrics(),
      velocityStats: this.velocityStats(),
      alerts: this.alerts()
    };

    this.exportRequested.emit(exportData);
    this.downloadMetricsJSON(exportData);
  }

  private downloadMetricsJSON(data: MetricsExport): void {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `epic-metrics-${data.epic.id}-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  onAlertAction(alertId: string, action: string): void {
    this.alertAction.emit({ alertId, action });
    
    // Supprimer l'alerte si action "dismiss"
    if (action === 'dismiss') {
      const currentAlerts = this.alerts();
      this.alerts.set(currentAlerts.filter(a => a.id !== alertId));
    }
  }

  toggleViewMode(): void {
    this.viewMode = this.viewMode === 'overview' ? 'detailed' : 'overview';
  }

  // T012 - Auto-refresh
  private startAutoRefresh(): void {
    if (this.refreshInterval > 0) {
      this.refreshTimer = window.setInterval(() => {
        this.updateAllMetrics();
      }, this.refreshInterval);
    }
  }

  private stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  // T012 - Méthodes helper pour template
  trackAlert(index: number, alert: Alert): string {
    return alert.id;
  }

  getAlertIcon(type: Alert['type']): string {
    switch (type) {
      case 'danger': return 'error';
      case 'warning': return 'warning';
      case 'info': return 'info';
      default: return 'notifications';
    }
  }

  getAlertIconColor(type: Alert['type']): string {
    switch (type) {
      case 'danger': return 'red-600';
      case 'warning': return 'orange-500';
      case 'info': return 'blue-500';
      default: return 'gray-500';
    }
  }

  getWorkloadLabel(distribution: TeamMetrics['workloadDistribution']): string {
    switch (distribution) {
      case 'balanced': return 'Équilibrée';
      case 'unbalanced': return 'Déséquilibrée';
      case 'overloaded': return 'Surchargée';
      default: return 'Inconnue';
    }
  }

  getTrendIcon(trend: VelocityStats['trend']): string {
    switch (trend) {
      case 'increasing': return 'trending_up';
      case 'decreasing': return 'trending_down';
      case 'stable': return 'trending_flat';
      default: return 'remove';
    }
  }

  // Getters pour compatibilité avec template existant
  get calculatedMetrics() {
    return {
      progressPercentage: this.taskMetrics().percentage,
      completedTasks: this.taskMetrics().completed,
      inProgressTasks: this.taskMetrics().inProgress,
      pendingTasks: this.taskMetrics().pending,
      cancelledTasks: this.taskMetrics().cancelled,
      totalFeatures: this.featureMetrics().total,
      completedFeatures: this.featureMetrics().completed,
      inProgressFeatures: this.featureMetrics().inProgress,
      estimatedHours: this.timeMetrics().estimatedHours,
      actualHours: this.timeMetrics().actualHours,
      tasksPerDay: this.velocityStats().tasksPerDay,
      totalTasks: this.taskMetrics().total
    };
  }
} 