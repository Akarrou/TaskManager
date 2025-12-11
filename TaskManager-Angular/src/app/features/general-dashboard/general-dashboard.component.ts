import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { TaskService } from '../../core/services/task';
import { DocumentService } from '../documents/services/document.service';
import { IStat, DocumentsStats } from './general-dashboard.model';
import { FabStore } from '../../core/stores/fab.store';

@Component({
  selector: 'app-general-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './general-dashboard.component.html',
  styleUrls: ['./general-dashboard.component.scss']
})
export class GeneralDashboardComponent implements OnInit, OnDestroy {
  private taskService = inject(TaskService);
  private documentService = inject(DocumentService);
  private router = inject(Router);
  private fabStore = inject(FabStore);
  private pageId = crypto.randomUUID();

  stats = signal<IStat[]>([]);
  loading = signal(true);

  ngOnInit(): void {
    // Enregistrer la configuration FAB
    this.fabStore.registerPage(
      {
        context: { currentPage: 'dashboard' },
        actions: []
      },
      this.pageId
    );

    this.loadDashboardData();
  }

  ngOnDestroy(): void {
    this.fabStore.unregisterPage(this.pageId);
  }

  async loadDashboardData(): Promise<void> {
    try {
      this.loading.set(true);

      // Charger les stats des tâches
      const taskStats = this.taskService.getStats();

      // Charger les stats des documents
      const documentStats = await firstValueFrom(this.documentService.getDocumentsStats());

      // Construire le tableau de stats
      const statsArray: IStat[] = [
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
          value: documentStats.total,
          icon: 'description',
          iconClass: 'c-stat-card__icon-wrapper--documents'
        },
        {
          title: 'Documents récents',
          value: documentStats.recentCount,
          icon: 'history',
          iconClass: 'c-stat-card__icon-wrapper--recent'
        }
      ];

      this.stats.set(statsArray);
    } catch (error) {
      console.error('Erreur lors du chargement des stats du dashboard:', error);
      // En cas d'erreur, afficher des stats à 0
      this.stats.set([
        { title: 'Total Tâches', value: 0, icon: 'task_alt', iconClass: 'c-stat-card__icon-wrapper--total' },
        { title: 'En cours', value: 0, icon: 'pending_actions', iconClass: 'c-stat-card__icon-wrapper--in-progress' },
        { title: 'Terminées', value: 0, icon: 'check_circle', iconClass: 'c-stat-card__icon-wrapper--completed' },
        { title: 'À faire', value: 0, icon: 'radio_button_unchecked', iconClass: 'c-stat-card__icon-wrapper--todo' },
        { title: 'Total Documents', value: 0, icon: 'description', iconClass: 'c-stat-card__icon-wrapper--documents' },
        { title: 'Documents récents', value: 0, icon: 'history', iconClass: 'c-stat-card__icon-wrapper--recent' }
      ]);
    } finally {
      this.loading.set(false);
    }
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
