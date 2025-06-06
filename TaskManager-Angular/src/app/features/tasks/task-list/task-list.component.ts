import { Component, signal, computed, input, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { Task, TaskService } from '../../../core/services/task';
import { ViewToggleComponent, ViewMode } from '../../../shared/components/view-toggle/view-toggle.component';
import { TagInputComponent } from '../../../shared/components/tag-input/tag-input.component';

@Component({
  selector: 'app-task-list',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, ViewToggleComponent, TagInputComponent],
  templateUrl: './task-list.component.html',
  styleUrls: ['./task-list.component.scss']
})
export class TaskListComponent {
  private router = inject(Router);

  tasks = input<Task[]>([]);
  loading = input<boolean>(false);
  deleteTask = output<Task>();

  currentViewMode = signal<ViewMode>('grid');
  statusFilter = signal<string>('');
  sortBy = signal<string>('created_at');
  filterTags = signal<string[]>([]);

  totalTasks = computed(() => this.tasks().length);
  filteredTasks = computed(() => {
    let items = [...this.tasks()];

    // Filter by status
    const currentStatusFilter = this.statusFilter();
    if (currentStatusFilter) {
      items = items.filter(task => task.status === currentStatusFilter);
    }

    // Filter by tags
    const currentFilterTags = this.filterTags();
    if (currentFilterTags.length > 0) {
      items = items.filter(task => 
        currentFilterTags.every(filterTag => 
          task.tags && task.tags.some(taskTag => taskTag.toLowerCase().includes(filterTag.toLowerCase()))
        )
      );
    }

    // Sort
    const currentSortBy = this.sortBy();
    items.sort((a, b) => {
      let valA: any, valB: any;

      switch (currentSortBy) {
        case 'title':
          valA = a.title.toLowerCase();
          valB = b.title.toLowerCase();
          break;
        case 'due_date':
          valA = a.due_date ? new Date(a.due_date).getTime() : 0;
          valB = b.due_date ? new Date(b.due_date).getTime() : 0;
          // Pour les dates nulles, les mettre à la fin lors du tri ascendant
          if (!valA && valB) return 1; 
          if (valA && !valB) return -1;
          if (!valA && !valB) return 0;
          break;
        case 'priority':
          const priorityOrder: { [key in Task['priority']]: number } = { 'low': 4, 'medium': 3, 'high': 2, 'urgent': 1 };
          valA = priorityOrder[a.priority];
          valB = priorityOrder[b.priority];
          break;
        case 'status':
          const statusOrder: { [key in Task['status']]: number } = { 'pending': 1, 'in_progress': 2, 'completed': 3, 'cancelled': 4 };
          valA = statusOrder[a.status];
          valB = statusOrder[b.status];
          break;
        case 'created_at':
        default:
          valA = a.created_at ? new Date(a.created_at).getTime() : 0;
          valB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return valB - valA; // Par défaut, tri descendant pour la date de création
      }

      if (valA < valB) return -1;
      if (valA > valB) return 1;
      return 0;
    });

    return items;
  });

  hasActiveFilters = computed(() => this.statusFilter() !== '' || this.filterTags().length > 0);

  constructor() {
    // Initialisation si nécessaire
  }

  onViewModeChange(mode: ViewMode) {
    this.currentViewMode.set(mode);
  }

  onStatusFilterChange() {
    // Le signal sera mis à jour automatiquement via ngModel
  }

  onSortChange() {
    // Le signal sera mis à jour automatiquement via ngModel
  }

  onFilterTagsChange(tags: string[]) {
    this.filterTags.set(tags);
  }

  clearStatusFilter() {
    this.statusFilter.set('');
  }

  removeFilterTag(tagToRemove: string) {
    this.filterTags.update(currentTags => currentTags.filter(t => t !== tagToRemove));
  }

  clearAllFilters() {
    this.clearStatusFilter();
    this.filterTags.set([]);
  }

  isOverdue(dueDateString: string): boolean {
    if (!dueDateString) return false;
    const dueDate = new Date(dueDateString);
    const today = new Date();
    // Comparer uniquement la date, pas l'heure
    today.setHours(0, 0, 0, 0);
    dueDate.setHours(0,0,0,0); // S'assurer que l'heure est ignorée
    return dueDate < today;
  }

  getStatusLabel(status: Task['status']): string {
    const labels: { [key in Task['status']]: string } = {
      pending: 'En attente',
      in_progress: 'En cours',
      completed: 'Terminée',
      cancelled: 'Annulée'
    };
    return labels[status] || status;
  }

  getStatusIcon(status: Task['status']): string {
    const icons: { [key in Task['status']]: string } = {
      pending: 'hourglass_empty',
      in_progress: 'sync',
      completed: 'check_circle_outline',
      cancelled: 'cancel'
    };
    return icons[status] || 'help_outline';
  }

  getPriorityLabel(priority: Task['priority']): string {
    const labels: { [key in Task['priority']]: string } = {
      low: 'Basse',
      medium: 'Moyenne',
      high: 'Haute',
      urgent: 'Urgente'
    };
    return labels[priority] || priority;
  }

  getPriorityIcon(priority: Task['priority']): string {
    const icons: { [key in Task['priority']]: string } = {
      low: 'arrow_downward',
      medium: 'remove',
      high: 'arrow_upward',
      urgent: 'priority_high' // ou error, warning, notification_important
    };
    return icons[priority] || 'help_outline';
  }

  trackByTask(index: number, task: Task): string {
    return task.id || `task-${index}`;
  }

  public getCastedStatusFilter(): Task['status'] {
    return this.statusFilter() as Task['status'];
  }

  navigateToNewTaskForm() {
    this.router.navigate(['/tasks/new']);
  }

  navigateToEditTaskForm(task: Task) {
    if (task.id) {
      this.router.navigate(['/tasks', task.id, 'edit']);
    }
  }
} 