import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SupabaseService } from '../../core/services/supabase';
import { TaskService, Task } from '../../core/services/task';
import { SearchFilters } from '../../shared/components/task-search/task-search.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatDialogModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  private supabaseService = inject(SupabaseService);
  private taskService = inject(TaskService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  
  supabaseStatus = signal<'connecting' | 'connected' | 'error'>('connecting');
  statusMessage = signal('Connexion en cours...');

  tasks = this.taskService.tasks;
  loading = this.taskService.loading;
  taskError = this.taskService.error;

  currentSearchFilters = signal<SearchFilters>({
    searchText: '',
    status: '',
    priority: ''
  });

  filteredTasks = computed(() => {
    const allTasks = this.tasks();
    const filters = this.currentSearchFilters();
    if (!filters.searchText && !filters.status && !filters.priority) {
      return allTasks;
    }
    return allTasks.filter(task => {
      const searchTextMatch = filters.searchText 
        ? task.title.toLowerCase().includes(filters.searchText.toLowerCase()) || 
          (task.description && task.description.toLowerCase().includes(filters.searchText.toLowerCase()))
        : true;
      const statusMatch = filters.status ? task.status === filters.status : true;
      const priorityMatch = filters.priority ? task.priority === filters.priority : true;
      return searchTextMatch && statusMatch && priorityMatch;
    });
  });

  stats = computed(() => {
    const taskStats = this.getTaskStats();
    return [
      { title: 'Tâches totales', value: taskStats.total, icon: 'list_alt', iconClass: 'c-stat-card__icon--total' },
      { title: 'En cours', value: taskStats.inProgress, icon: 'hourglass_top', iconClass: 'c-stat-card__icon--in-progress' },
      { title: 'Terminées', value: taskStats.completed, icon: 'check_circle', iconClass: 'c-stat-card__icon--completed' },
      { title: 'À faire', value: taskStats.pending, icon: 'pending_actions', iconClass: 'c-stat-card__icon--todo' }
    ];
  });

  async ngOnInit() {
    await this.checkSupabaseConnection();
  }

  private async checkSupabaseConnection() {
    this.statusMessage.set('Vérification de la connexion Supabase...');
    try {
      await this.taskService.loadTasks();
      this.supabaseStatus.set('connected');
      this.statusMessage.set('Connecté à Supabase.');
    } catch (error: any) {
      console.error('Erreur de connexion Supabase:', error);
      this.supabaseStatus.set('error');
      this.statusMessage.set(`Erreur de connexion: ${error.message || 'Vérifiez la console'}`);
    }
  }

  getTaskStats() {
    return this.taskService.getStats();
  }

  getStatusIcon(): string {
    switch (this.supabaseStatus()) {
      case 'connected': return 'cloud_done';
      case 'connecting': return 'cloud_queue';
      case 'error': return 'cloud_off';
      default: return 'help_outline';
    }
  }

  getStatusClass(): string {
    switch (this.supabaseStatus()) {
      case 'connected': return 'status-connected';
      case 'connecting': return 'status-connecting';
      case 'error': return 'status-error';
      default: return '';
    }
  }

  getTaskStatusIcon(status: string): string {
    switch (status) {
      case 'pending': return 'hourglass_empty';
      case 'in_progress': return 'sync';
      case 'completed': return 'check_circle_outline';
      case 'cancelled': return 'cancel';
      default: return 'help_outline';
    }
  }

  async createSampleData() {
    await this.taskService.createSampleTasks();
  }

  async refreshData() {
    this.statusMessage.set('Rafraîchissement des données...');
    this.supabaseStatus.set('connecting');
    await this.checkSupabaseConnection();
  }

  async debugTasks() {
    console.log('--- Debugging Tasks ---');
    console.log('Current Tasks Signal:', this.tasks());
    console.log('Loading State:', this.loading());
    console.log('Error State:', this.taskError());
    console.log('Supabase Status:', this.supabaseStatus());
    console.log('Stats:', this.getTaskStats());
    console.log('Filtered Tasks:', this.filteredTasks());
  }

  navigateToNewTaskForm() {
    this.router.navigate(['/tasks/new']);
  }

  navigateToEditTaskForm(task: Task) {
    if (task.id) {
      this.router.navigate(['/tasks', task.id, 'edit']);
    }
  }

  async deleteTask(id: string): Promise<void> {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: { 
        title: 'Confirmation de suppression de tâches', 
        message: 'Êtes-vous sûr de vouloir supprimer cette tâche ?\\nCette action est irréversible.'
      }
    });

    try {
      const result = await firstValueFrom(dialogRef.afterClosed());
      if (result) {
        const success = await this.taskService.deleteTask(id);
        if (success) {
          console.log(`Tâche ${id} supprimée.`);
        } else {
          console.error(`Erreur lors de la suppression de la tâche ${id}.`);
        }
      }
    } catch (error) {
      console.error('Error closing dialog:', error);
    }
  }

  onSearchFiltersChange(filters: SearchFilters) {
    this.currentSearchFilters.set(filters);
  }

  getStatusLabel(status: string): string {
    const statusMap: { [key: string]: string } = {
      pending: 'En attente',
      in_progress: 'En cours',
      completed: 'Terminée',
      cancelled: 'Annulée'
    };
    return statusMap[status] || status;
  }

  getPriorityLabel(priority: string): string {
    const priorityMap: { [key: string]: string } = {
      low: 'Faible',
      medium: 'Moyenne',
      high: 'Élevée',
      urgent: 'Urgente'
    };
    return priorityMap[priority] || priority;
  }
}
