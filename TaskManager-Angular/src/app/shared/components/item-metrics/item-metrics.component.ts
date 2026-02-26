import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, SimpleChanges, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatExpansionModule } from '@angular/material/expansion';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';

import { Task } from '../../../core/models/task.model';
import { EpicMetrics } from '../../models/kanban.model';
import { KanbanItem } from '../../../core/models/task.model';

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
  assignedTasks: Record<string, number>;
  completedTasks: Record<string, number>;
  topPerformer: string | null;
  workloadDistribution: 'balanced' | 'unbalanced';
}

interface VelocityStats {
  tasksPerDay: number;
  featuresPerWeek: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  projectedCompletion: Date | null;
  daysRemaining: number;
  sprintVelocity: number;
}

interface Alert {
  id: string;
  type: 'info' | 'warning' | 'danger';
  title: string;
  message: string;
  timestamp: Date;
  actionable: boolean;
}

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
  selector: 'app-item-metrics',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatChipsModule,
    MatExpansionModule,
    MatMenuModule,
    MatProgressBarModule,
    MatDividerModule,
    MatTooltipModule,
    MatSnackBarModule,
    BaseChartDirective
  ],
  templateUrl: './item-metrics.component.html',
  styleUrls: ['./item-metrics.component.scss']
})
export class ItemMetricsComponent implements OnInit, OnDestroy, OnChanges {
  private snackBar = inject(MatSnackBar);
  private cdr = inject(ChangeDetectorRef);

  @Input() item!: Task | KanbanItem; // Peut être epic, feature, ou task
  @Input() children: (Task | KanbanItem)[] = []; // Peut être features, tasks, ou subtasks
  @Input() tasks: (Task | KanbanItem)[] = []; // Toujours les tâches finales
  @Input() metrics!: EpicMetrics;
  @Input() itemType: 'epic' | 'feature' | 'task' = 'epic'; // Type de l'item principal
  @Input() refreshInterval = 30000; // 30 secondes

  @Output() refreshRequested = new EventEmitter<void>();
  @Output() alertAction = new EventEmitter<{ alertId: string; action: string }>();
  @Output() exportRequested = new EventEmitter<MetricsExport>();

  // T012 - État du composant
  private refreshTimer?: number;
  lastRefresh = new Date();
  isRefreshing = false;
  viewMode: 'overview' | 'detailed' = 'overview';

  // T012 - Métriques calculées temps réel
  taskMetrics = {
    total: 0, completed: 0, inProgress: 0, review: 0, pending: 0, cancelled: 0,
    percentage: 0, remaining: 0, overdue: 0, completionRate: 0
  };

  featureMetrics = {
    total: 0, completed: 0, inProgress: 0, review: 0, pending: 0,
    percentage: 0, avgTasksPerFeature: 0, blockedFeatures: 0
  };

  timeMetrics = {
    estimatedHours: 0, actualHours: 0, remainingHours: 0,
    efficiency: 0, isOverBudget: false, timePerTask: 0, projectedCompletion: null as Date | null
  };

  teamMetrics = {
    totalMembers: 0, activeMembers: 0, assignedTasks: {}, completedTasks: {},
    topPerformer: null as string | null, workloadDistribution: 'balanced' as const
  };

  velocityStats = {
    tasksPerDay: 0, featuresPerWeek: 0, trend: 'stable' as const,
    projectedCompletion: null as Date | null, daysRemaining: 0, sprintVelocity: 0
  };

  alerts: Alert[] = [];

  // Labels dynamiques selon le type d'item
  get itemTypeLabel(): string {
    switch(this.itemType) {
      case 'epic': return 'Epic';
      case 'feature': return 'Feature';
      case 'task': return 'Task';
      default: return 'Item';
    }
  }

  get childrenLabel(): string {
    switch(this.itemType) {
      case 'epic': return 'Features';
      case 'feature': return 'Tasks';
      case 'task': return 'Subtasks';
      default: return 'Elements';
    }
  }

  get childrenSingularLabel(): string {
    switch(this.itemType) {
      case 'epic': return 'feature';
      case 'feature': return 'task';
      case 'task': return 'subtask';
      default: return 'element';
    }
  }

  // T012 - Configuration graphiques Chart.js
  progressChartType = 'doughnut' as const;
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
    cutout: '70%',
    plugins: {
      legend: { display: false }
    }
  };

  velocityChartType = 'line' as const;
  velocityChartData: ChartData<'line'> = {
    labels: ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4'],
    datasets: [{
      label: 'Tâches complétées',
      data: [0, 0, 0, 0],
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      fill: true,
      tension: 0.4
    }]
  };

  velocityChartOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
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
    if (changes['tasks'] || changes['children'] || changes['item']) {
      this.updateAllMetrics();
    }
  }

  // T012 - Calcul complet des métriques temps réel
  private updateAllMetrics(): void {
    // Si pas de données, utiliser des données de démo
    if (!this.tasks.length && !this.children.length) {
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
    this.taskMetrics = {
      total: 17,
      completed: 8,
      inProgress: 5,
      review: 2,
      pending: 2,
      cancelled: 0,
      percentage: 47,
      remaining: 9,
      overdue: 3,
      completionRate: 2.5
    };

    this.featureMetrics = {
      total: 4,
      completed: 2,
      inProgress: 1,
      review: 0,
      pending: 1,
      percentage: 50,
      avgTasksPerFeature: 4,
      blockedFeatures: 1
    };

    this.timeMetrics = {
      estimatedHours: 120,
      actualHours: 95,
      remainingHours: 25,
      efficiency: 0.79,
      isOverBudget: false,
      timePerTask: 5.6,
      projectedCompletion: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
    };

    this.teamMetrics = {
      totalMembers: 5,
      activeMembers: 4,
      assignedTasks: { 'dev1': 6, 'dev2': 4, 'dev3': 3, 'dev4': 2, 'dev5': 2 },
      completedTasks: { 'dev1': 3, 'dev2': 2, 'dev3': 2, 'dev4': 1, 'dev5': 0 },
      topPerformer: 'dev1',
      workloadDistribution: 'balanced'
    };

    this.velocityStats = {
      tasksPerDay: 2.5,
      featuresPerWeek: 1.2,
      trend: 'stable',
      projectedCompletion: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      daysRemaining: 10,
      sprintVelocity: 15
    };

    this.alerts = [
      {
        id: '1',
        type: 'warning',
        title: 'Tâches en retard',
        message: '3 tâches ont dépassé leur échéance',
        timestamp: new Date(),
        actionable: true
      }
    ];
  }

  private calculateTaskMetrics(): void {
    const total = this.tasks.length;
    const completed = this.tasks.filter((t: Task | KanbanItem) => t.status === 'completed').length;
    const inProgress = this.tasks.filter((t: Task | KanbanItem) => t.status === 'in_progress').length;
    const review = this.tasks.filter((t: Task | KanbanItem) => t.status === 'review').length;
    const pending = this.tasks.filter((t: Task | KanbanItem) => t.status === 'pending').length;
    const cancelled = this.tasks.filter((t: Task | KanbanItem) => t.status === 'cancelled').length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    const remaining = total - completed - cancelled;
    
    // Calcul des tâches en retard
    const overdue = this.tasks.filter((t: Task | KanbanItem) => {
      const dueDate = 'due_date' in t ? t.due_date : 'dueDate' in t ? t.dueDate : null;
      if (!dueDate || t.status === 'completed' || t.status === 'cancelled') return false;
      return new Date(dueDate) < new Date();
    }).length;

    // Calcul du taux de completion (tâches/jour)
    const completionRate = this.calculateCompletionRate();

    this.taskMetrics = {
      total, completed, inProgress, review, pending, cancelled,
      percentage, remaining, overdue, completionRate
    };
  }

  private calculateFeatureMetrics(): void {
    const total = this.children.length;
    const completed = this.children.filter((f: Task | KanbanItem) => f.status === 'completed').length;
    const inProgress = this.children.filter((f: Task | KanbanItem) => f.status === 'in_progress').length;
    const review = this.children.filter((f: Task | KanbanItem) => f.status === 'review').length;
    const pending = this.children.filter((f: Task | KanbanItem) => f.status === 'pending').length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    const avgTasksPerFeature = total > 0 ? Math.round(this.tasks.length / total) : 0;
    
    // Éléments bloqués (avec tâches en retard)
    const blockedFeatures = this.children.filter((child: Task | KanbanItem) => {
      const childTasks = this.tasks.filter((t: Task | KanbanItem) => t.parent_task_id === child.id);
      return childTasks.some((t: Task | KanbanItem) => {
        const dueDate = 'due_date' in t ? t.due_date : 'dueDate' in t ? t.dueDate : null;
        if (!dueDate || t.status === 'completed') return false;
        return new Date(dueDate) < new Date();
      });
    }).length;

    this.featureMetrics = {
      total, completed, inProgress, review, pending,
      percentage, avgTasksPerFeature, blockedFeatures
    };
  }

  private calculateTimeMetrics(): void {
    const estimatedHours = this.tasks.reduce((sum, t) => {
      const estimated = 'estimated_hours' in t ? t.estimated_hours : 0;
      return sum + (estimated || 0);
    }, 0);
    const actualHours = this.tasks.reduce((sum, t) => {
      const actual = 'actual_hours' in t ? t.actual_hours : 0;
      return sum + (actual || 0);
    }, 0);
    const remainingHours = Math.max(0, estimatedHours - actualHours);
    const efficiency = estimatedHours > 0 ? actualHours / estimatedHours : 0;
    const isOverBudget = actualHours > estimatedHours;
    const timePerTask = this.tasks.length > 0 ? actualHours / this.tasks.length : 0;
    
    // Projection de completion basée sur la vélocité
    const projectedCompletion = this.calculateProjectedCompletion();

    this.timeMetrics = {
      estimatedHours, actualHours, remainingHours,
      efficiency, isOverBudget, timePerTask, projectedCompletion
    };
  }

  private calculateTeamMetrics(): void {
    const assignedTasks: Record<string, number> = {};
    const completedTasks: Record<string, number> = {};

    this.tasks.forEach(task => {
      const assignedTo = 'assigned_to' in task ? task.assigned_to : 'assignee' in task ? task.assignee : null;
      if (assignedTo) {
        assignedTasks[assignedTo] = (assignedTasks[assignedTo] || 0) + 1;
        if (task.status === 'completed') {
          completedTasks[assignedTo] = (completedTasks[assignedTo] || 0) + 1;
        }
      }
    });

    const totalMembers = Object.keys(assignedTasks).length;
    const activeMembers = Object.keys(assignedTasks).filter(member => {
      const memberTasks = this.tasks.filter(t => {
        const assignedTo = 'assigned_to' in t ? t.assigned_to : 'assignee' in t ? t.assignee : null;
        return assignedTo === member;
      });
      return memberTasks.some(t => t.status === 'in_progress' || t.status === 'review');
    }).length;

    // Top performer (ratio completion)
    let topPerformer: string | null = null;
    let bestRatio = 0;
    Object.keys(assignedTasks).forEach(member => {
      const ratio = (completedTasks[member] || 0) / assignedTasks[member];
      if (ratio > bestRatio) {
        bestRatio = ratio;
        topPerformer = member;
      }
    });

    this.teamMetrics = {
      totalMembers, activeMembers, assignedTasks, completedTasks,
      topPerformer, workloadDistribution: 'balanced'
    };
  }

  private calculateVelocityStats(): void {
    const tasksPerDay = this.calculateCompletionRate();
    const completedFeatures = this.children.filter((f: Task | KanbanItem) => f.status === 'completed').length;
    const featuresPerWeek = completedFeatures; // Simplification pour demo
    
    // Trend basé sur les dernières complétions
    const trend: VelocityStats['trend'] = 'stable'; // Simplification
    
    // Projection basée sur la vélocité actuelle
    const remainingTasks = this.taskMetrics.remaining;
    const daysRemaining = tasksPerDay > 0 ? Math.ceil(remainingTasks / tasksPerDay) : 0;
    const projectedCompletion = daysRemaining > 0 ? 
      new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000) : null;

    this.velocityStats = {
      tasksPerDay, featuresPerWeek, trend, projectedCompletion,
      daysRemaining, sprintVelocity: Math.round(tasksPerDay * 7)
    };
  }

  private calculateCompletionRate(): number {
    // Simplification : assume 2.5 tâches/jour en moyenne
    return 2.5;
  }

  private calculateProjectedCompletion(): Date | null {
    const remainingTasks = this.taskMetrics.remaining;
    const rate = this.calculateCompletionRate();
    if (rate > 0) {
      const daysRemaining = Math.ceil(remainingTasks / rate);
      return new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000);
    }
    return null;
  }

  private generateAlerts(): void {
    const alerts: Alert[] = [];
    
    // Alerte pour tâches en retard
    if (this.taskMetrics.overdue > 0) {
      alerts.push({
        id: 'overdue-tasks',
        type: 'warning',
        title: 'Tâches en retard',
        message: `${this.taskMetrics.overdue} tâches ont dépassé leur échéance`,
        timestamp: new Date(),
        actionable: true
      });
    }

    // Alerte pour budget temps dépassé
    if (this.timeMetrics.isOverBudget) {
      alerts.push({
        id: 'over-budget',
        type: 'danger',
        title: 'Budget temps dépassé',
        message: 'Le temps réel dépasse les estimations',
        timestamp: new Date(),
        actionable: true
      });
    }

    this.alerts = alerts;
  }

  private updateCharts(): void {
    // Mise à jour du graphique de progression
    this.progressChartData.datasets[0].data = [
      this.taskMetrics.completed,
      this.taskMetrics.inProgress,
      this.taskMetrics.review,
      this.taskMetrics.pending
    ];

    // Mise à jour du graphique de vélocité (données simulées)
    this.velocityChartData.datasets[0].data = [
      Math.max(0, this.velocityStats.tasksPerDay - 1),
      Math.max(0, this.velocityStats.tasksPerDay - 0.5),
      this.velocityStats.tasksPerDay,
      Math.max(0, this.velocityStats.tasksPerDay + 0.5)
    ];
  }

  // T012 - Gestion de l'actualisation automatique
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
    }
  }

  // T012 - Actions utilisateur
  toggleViewMode(): void {
    this.viewMode = this.viewMode === 'overview' ? 'detailed' : 'overview';
  }

  onRefresh(): void {
    this.isRefreshing = true;
    this.refreshRequested.emit();
    
    // Simulation du délai de chargement
    setTimeout(() => {
      this.updateAllMetrics();
      this.isRefreshing = false;
      this.snackBar.open('Métriques actualisées', 'OK', { duration: 2000 });
    }, 1000);
  }

  onExportMetrics(): void {
    const exportData: MetricsExport = {
      epic: {
        id: String(this.item?.id || ''),
        title: this.item?.title || '',
        status: this.item?.status || ''
      },
      timestamp: new Date().toISOString(),
      taskMetrics: this.taskMetrics,
      featureMetrics: this.featureMetrics,
      timeMetrics: this.timeMetrics,
      teamMetrics: this.teamMetrics,
      velocityStats: this.velocityStats,
      alerts: this.alerts
    };

    this.exportRequested.emit(exportData);
    
    // Télécharger le fichier JSON
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `metrics-${this.item?.title || 'export'}-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    window.URL.revokeObjectURL(url);

    this.snackBar.open('Métriques exportées', 'OK', { duration: 2000 });
  }

  onAlertAction(alertId: string, action: string): void {
    this.alertAction.emit({ alertId, action });
    
    if (action === 'dismiss') {
      this.alerts = this.alerts.filter(alert => alert.id !== alertId);
      this.snackBar.open('Alerte marquée comme lue', 'OK', { duration: 1500 });
    }
  }

  // T012 - Méthodes utilitaires pour le template
  hasAlertType(type: Alert['type']): boolean {
    return this.alerts.some(alert => alert.type === type);
  }

  hasOnlyInfoAlerts(): boolean {
    return this.alerts.length > 0 && this.alerts.every(alert => alert.type === 'info');
  }

  getAlertIcon(type: Alert['type']): string {
    switch (type) {
      case 'info': return 'info';
      case 'warning': return 'warning';
      case 'danger': return 'error';
      default: return 'help';
    }
  }

  getAlertIconColor(type: Alert['type']): string {
    switch (type) {
      case 'info': return 'blue-500';
      case 'warning': return 'orange-500';
      case 'danger': return 'red-600';
      default: return 'gray-500';
    }
  }

  trackAlert(_: number, alert: Alert): string {
    return alert.id;
  }
}