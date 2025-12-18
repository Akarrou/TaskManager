import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { IStat, DocumentsStats } from './general-dashboard.model';
import { FabStore } from '../../core/stores/fab.store';
import { DashboardStatsStore } from '../../core/stores/dashboard-stats.store';

@Component({
  selector: 'app-general-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './general-dashboard.component.html',
  styleUrls: ['./general-dashboard.component.scss']
})
export class GeneralDashboardComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private fabStore = inject(FabStore);
  private dashboardStatsStore = inject(DashboardStatsStore);
  private pageId = crypto.randomUUID();

  loading = signal(true);

  // Computed signal pour les stats (réactivité automatique)
  stats = computed(() => {
    const taskStats = this.dashboardStatsStore.taskStats();
    const docStats = this.dashboardStatsStore.documentStats();

    return [
      {
        title: 'Total Tâches',
        value: taskStats.total,
        icon: 'task_alt',
        iconClass: 'c-stat-card__icon-wrapper--total'
      },
      {
        title: 'En cours',
        value: taskStats.inProgress,
        icon: 'pending_actions',
        iconClass: 'c-stat-card__icon-wrapper--in-progress'
      },
      {
        title: 'Terminées',
        value: taskStats.completed,
        icon: 'check_circle',
        iconClass: 'c-stat-card__icon-wrapper--completed'
      },
      {
        title: 'À faire',
        value: taskStats.pending,
        icon: 'radio_button_unchecked',
        iconClass: 'c-stat-card__icon-wrapper--todo'
      },
      {
        title: 'Total Documents',
        value: docStats.total,
        icon: 'description',
        iconClass: 'c-stat-card__icon-wrapper--documents'
      },
      {
        title: 'Documents récents',
        value: docStats.recentCount,
        icon: 'history',
        iconClass: 'c-stat-card__icon-wrapper--recent'
      }
    ];
  });

  ngOnInit(): void {
    // Enregistrer la configuration FAB
    this.fabStore.registerPage(
      {
        context: { currentPage: 'dashboard' },
        actions: []
      },
      this.pageId
    );

    // Charger TOUTES les stats en une seule fois (tâches + documents en parallèle)
    this.dashboardStatsStore.loadAllStats({});

    // Le computed signal `stats` ci-dessus se mettra à jour automatiquement
    this.loading.set(false);
  }

  ngOnDestroy(): void {
    this.fabStore.unregisterPage(this.pageId);
  }

  navigateToTasks(): void {
    this.router.navigate(['/dashboard/tasks']);
  }

  navigateToDocuments(): void {
    this.router.navigate(['/documents']);
  }

  navigateToNewTask(): void {
    this.router.navigate(['/tasks/new']);
  }

  navigateToNewDocument(): void {
    this.router.navigate(['/documents/new']);
  }
}
