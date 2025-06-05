import { Component, signal, computed, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Task, TaskService } from '../../../core/services/task';
import { ViewToggleComponent, ViewMode } from '../../../shared/components/view-toggle/view-toggle.component';
import { TagInputComponent } from '../../../shared/components/tag-input/tag-input.component';

@Component({
  selector: 'app-task-list',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, ViewToggleComponent, TagInputComponent],
  template: `
    <div class="task-list-container">
      <!-- En-tête avec filtres et contrôles -->
      <div class="list-header">
        <div class="header-left">
          <h2 class="list-title">
            <mat-icon>assignment</mat-icon> {{ filteredTasks().length }} tâche(s)
            <span class="task-count-detail" *ngIf="totalTasks() !== filteredTasks().length">
              / {{ totalTasks() }} au total
            </span>
          </h2>
        </div>
        
        <div class="header-controls">
          <!-- Filtre par tags -->
          <div class="filter-section">
            <app-tag-input
              [label]="'Filtrer par tags'"
              [placeholder]="'Rechercher des tags...'"
              [helpText]="''"
              [maxTags]="5"
              (tagsChange)="onFilterTagsChange($event)">
            </app-tag-input>
          </div>
          
          <!-- Filtre par statut -->
          <select 
            class="status-filter"
            [(ngModel)]="statusFilter"
            (change)="onStatusFilterChange()"
            aria-label="Filtrer par statut">
            <option value="">Tous les statuts</option>
            <option value="pending">En attente</option>
            <option value="in_progress">En cours</option>
            <option value="completed">Terminé</option>
          </select>
          
          <!-- Tri -->
          <select 
            class="sort-select"
            [(ngModel)]="sortBy"
            (change)="onSortChange()"
            aria-label="Trier par">
            <option value="created_at">Date de création</option>
            <option value="due_date">Date d'échéance</option>
            <option value="title">Nom</option>
            <option value="priority">Priorité</option>
            <option value="status">Statut</option>
          </select>
          
          <!-- Toggle vue grille/liste -->
          <app-view-toggle 
            (viewChange)="onViewModeChange($event)">
          </app-view-toggle>
        </div>
      </div>

      <!-- Indicateurs de filtres actifs -->
      <div class="active-filters" *ngIf="hasActiveFilters()">
        <span class="filter-label">Filtres actifs :</span>
        <span 
          *ngIf="statusFilter()" 
          class="filter-tag">
          Statut: {{ getStatusLabel(getCastedStatusFilter()) }}
          <button (click)="clearStatusFilter()" class="filter-remove">×</button>
        </span>
        <span 
          *ngFor="let tag of filterTags()" 
          class="filter-tag">
          Tag: {{ tag }}
          <button (click)="removeFilterTag(tag)" class="filter-remove">×</button>
        </span>
        <button class="clear-all-filters" (click)="clearAllFilters()">
          <mat-icon>delete</mat-icon> Effacer tous les filtres
        </button>
      </div>

      <!-- Liste des tâches -->
      <div class="tasks-container" [class]="'view-' + currentViewMode()">
        <div 
          *ngIf="filteredTasks().length === 0 && !loading()" 
          class="empty-state">
          <div class="empty-icon"><mat-icon>inbox</mat-icon></div>
          <h3>{{ hasActiveFilters() ? 'Aucune tâche ne correspond aux filtres' : 'Aucune tâche' }}</h3>
          <p>{{ hasActiveFilters() ? 'Essayez de modifier vos critères de recherche.' : 'Créez votre première tâche pour commencer !' }}</p>
          <button 
            *ngIf="!hasActiveFilters()" 
            class="cta-button"
            (click)="createTask.emit()">
            <mat-icon>add_circle_outline</mat-icon> Créer une tâche
          </button>
        </div>

        <div *ngIf="loading()" class="loading-state">
          <div class="loading-spinner"><mat-icon>autorenew</mat-icon></div>
          <p>Chargement des tâches...</p>
        </div>

        <!-- Vue grille -->
        <div 
          *ngIf="currentViewMode() === 'grid' && filteredTasks().length > 0" 
          class="tasks-grid">
          <div 
            *ngFor="let task of filteredTasks(); trackBy: trackByTask"
            class="task-card"
            [class]="'priority-' + task.priority"
            role="article"
            [attr.aria-label]="'Tâche: ' + task.title">
            
            <div class="task-header">
              <div class="task-priority" [title]="'Priorité: ' + getPriorityLabel(task.priority)">
                <mat-icon>{{ getPriorityIcon(task.priority) }}</mat-icon>
              </div>
              <div class="task-status" [class]="'status-' + task.status">
                <mat-icon>{{ getStatusIcon(task.status) }}</mat-icon>
              </div>
            </div>

            <div class="task-content">
              <h3 class="task-title" [title]="task.title">{{ task.title }}</h3>
              <p class="task-description" *ngIf="task.description" [title]="task.description">
                {{ task.description | slice:0:100 }}{{ task.description.length > 100 ? '...' : '' }}
              </p>
              
              <div class="task-tags" *ngIf="task.tags && task.tags.length > 0">
                <span 
                  *ngFor="let tag of task.tags.slice(0, 3)" 
                  class="task-tag">
                  {{ tag }}
                </span>
                <span *ngIf="task.tags.length > 3" class="more-tags">
                  +{{ task.tags.length - 3 }}
                </span>
              </div>
            </div>

            <div class="task-footer">
              <div class="task-meta">
                <span class="task-assignee" *ngIf="task.assigned_to" title="Assigné à">
                  <mat-icon>person</mat-icon> {{ task.assigned_to }}
                </span>
                <span class="task-date" *ngIf="task.due_date" [title]="'Échéance: ' + (task.due_date | date:'short')">
                  <mat-icon>calendar_today</mat-icon> {{ task.due_date | date:'dd/MM' }}
                </span>
              </div>
              
              <div class="task-actions">
                <button 
                  class="action-btn edit-btn"
                  (click)="editTask.emit(task)"
                  [attr.aria-label]="'Modifier ' + task.title"
                  title="Modifier">
                  <mat-icon>edit</mat-icon>
                </button>
                <button 
                  class="action-btn delete-btn"
                  (click)="deleteTask.emit(task)"
                  [attr.aria-label]="'Supprimer ' + task.title"
                  title="Supprimer">
                  <mat-icon>delete</mat-icon>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Vue liste -->
        <div 
          *ngIf="currentViewMode() === 'list' && filteredTasks().length > 0" 
          class="tasks-list">
          <div class="list-header-row">
            <div class="col-title">Tâche</div>
            <div class="col-status">Statut</div>
            <div class="col-priority">Priorité</div>
            <div class="col-assignee">Assigné</div>
            <div class="col-date">Échéance</div>
            <div class="col-actions">Actions</div>
          </div>
          
          <div 
            *ngFor="let task of filteredTasks(); trackBy: trackByTask"
            class="task-row"
            [class]="'priority-' + task.priority"
            role="row">
            
            <div class="col-title">
              <div class="task-title-cell">
                <h4 class="row-task-title">{{ task.title }}</h4>
                <p class="row-task-description" *ngIf="task.description">
                  {{ task.description | slice:0:60 }}{{ task.description.length > 60 ? '...' : '' }}
                </p>
                <div class="row-task-tags" *ngIf="task.tags && task.tags.length > 0">
                  <span 
                    *ngFor="let tag of task.tags.slice(0, 2)" 
                    class="row-task-tag">
                    {{ tag }}
                  </span>
                  <span *ngIf="task.tags.length > 2" class="more-tags-small">
                    +{{ task.tags.length - 2 }}
                  </span>
                </div>
              </div>
            </div>
            
            <div class="col-status">
              <span class="status-badge" [class]="'status-' + task.status">
                <mat-icon>{{ getStatusIcon(task.status) }}</mat-icon> {{ getStatusLabel(task.status) }}
              </span>
            </div>
            
            <div class="col-priority">
              <span class="priority-badge" [class]="'priority-' + task.priority">
                <mat-icon>{{ getPriorityIcon(task.priority) }}</mat-icon> {{ getPriorityLabel(task.priority) }}
              </span>
            </div>
            
            <div class="col-assignee">
              <span *ngIf="task.assigned_to" class="assignee-name">
                <mat-icon>person</mat-icon> {{ task.assigned_to }}
              </span>
              <span *ngIf="!task.assigned_to" class="no-assignee">Non assigné</span>
            </div>
            
            <div class="col-date">
              <span *ngIf="task.due_date" class="due-date" [class.overdue]="isOverdue(task.due_date)">
                <mat-icon>calendar_today</mat-icon> {{ task.due_date | date:'dd/MM/yyyy' }}
              </span>
              <span *ngIf="!task.due_date" class="no-date">Pas d'échéance</span>
            </div>
            
            <div class="col-actions">
              <button 
                class="row-action-btn edit-btn"
                (click)="editTask.emit(task)"
                title="Modifier">
                <mat-icon>edit</mat-icon>
              </button>
              <button 
                class="row-action-btn delete-btn"
                (click)="deleteTask.emit(task)"
                title="Supprimer">
                <mat-icon>delete</mat-icon>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .task-list-container {
      width: 100%;
      max-width: 1200px;
      margin: 0 auto;
    }

    /* En-tête */
    .list-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1.5rem;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .list-title {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 700;
      color: #1f2937;
    }

    .task-count-detail {
      font-size: 1rem;
      color: #6b7280;
      font-weight: 400;
    }

    .header-controls {
      display: flex;
      align-items: flex-end;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .filter-section {
      min-width: 200px;
    }

    .status-filter,
    .sort-select {
      padding: 0.5rem 0.75rem;
      border: 2px solid #e5e7eb;
      border-radius: 0.5rem;
      background: white;
      font-size: 0.875rem;
      color: #374151;
      cursor: pointer;
      transition: border-color 0.2s;
    }

    .status-filter:focus,
    .sort-select:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    /* Filtres actifs */
    .active-filters {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }

    .filter-label {
      font-size: 0.875rem;
      color: #6b7280;
      font-weight: 500;
    }

    .filter-tag {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.25rem 0.5rem;
      background: #fef3c7;
      color: #92400e;
      border-radius: 0.375rem;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .filter-remove {
      background: none;
      border: none;
      color: #92400e;
      cursor: pointer;
      padding: 0;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .filter-remove:hover {
      background: #fbbf24;
    }

    .clear-all-filters {
      padding: 0.25rem 0.5rem;
      background: #fee2e2;
      color: #dc2626;
      border: none;
      border-radius: 0.375rem;
      font-size: 0.75rem;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .clear-all-filters:hover {
      background: #fecaca;
    }

    /* Conteneur des tâches */
    .tasks-container {
      width: 100%;
    }

    /* États vides et chargement */
    .empty-state,
    .loading-state {
      text-align: center;
      padding: 3rem 1rem;
      color: #6b7280;
    }

    .empty-icon,
    .loading-spinner {
      font-size: 3rem;
      margin-bottom: 1rem;
    }

    .loading-spinner {
      animation: spin 2s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .cta-button {
      margin-top: 1rem;
      padding: 0.75rem 1.5rem;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 0.5rem;
      font-weight: 600;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .cta-button:hover {
      background: #2563eb;
    }

    /* Vue grille */
    .view-grid .tasks-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 1rem;
    }

    .task-card {
      background: white;
      border: 2px solid #e5e7eb;
      border-radius: 0.75rem;
      padding: 1rem;
      transition: all 0.2s ease;
      position: relative;
      overflow: hidden;
    }

    .task-card:hover {
      border-color: #d1d5db;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      transform: translateY(-1px);
    }

    .task-card.priority-high {
      border-left: 4px solid #ef4444;
    }

    .task-card.priority-medium {
      border-left: 4px solid #f59e0b;
    }

    .task-card.priority-low {
      border-left: 4px solid #10b981;
    }

    .task-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
    }

    .task-priority,
    .task-status {
      font-size: 1.25rem;
    }

    .task-content {
      margin-bottom: 1rem;
    }

    .task-title {
      margin: 0 0 0.5rem 0;
      font-size: 1.125rem;
      font-weight: 600;
      color: #1f2937;
      line-height: 1.4;
    }

    .task-description {
      margin: 0 0 0.75rem 0;
      font-size: 0.875rem;
      color: #6b7280;
      line-height: 1.4;
    }

    .task-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
      margin-bottom: 0.5rem;
    }

    .task-tag {
      padding: 0.125rem 0.375rem;
      background: #eff6ff;
      color: #1d4ed8;
      border-radius: 0.25rem;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .more-tags {
      padding: 0.125rem 0.375rem;
      background: #f3f4f6;
      color: #6b7280;
      border-radius: 0.25rem;
      font-size: 0.75rem;
    }

    .task-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .task-meta {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .task-assignee,
    .task-date {
      font-size: 0.75rem;
      color: #6b7280;
    }

    .task-actions {
      display: flex;
      gap: 0.5rem;
    }

    .action-btn {
      padding: 0.25rem;
      background: none;
      border: 1px solid #e5e7eb;
      border-radius: 0.375rem;
      cursor: pointer;
      transition: all 0.2s;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .action-btn:hover {
      background: #f9fafb;
      border-color: #d1d5db;
    }

    /* Vue liste */
    .view-list .tasks-list {
      background: white;
      border-radius: 0.75rem;
      border: 2px solid #e5e7eb;
      overflow: hidden;
    }

    .list-header-row {
      display: grid;
      grid-template-columns: 2fr 1fr 1fr 1fr 1fr auto;
      gap: 1rem;
      padding: 1rem;
      background: #f9fafb;
      border-bottom: 2px solid #e5e7eb;
      font-weight: 600;
      color: #374151;
      font-size: 0.875rem;
    }

    .task-row {
      display: grid;
      grid-template-columns: 2fr 1fr 1fr 1fr 1fr auto;
      gap: 1rem;
      padding: 1rem;
      border-bottom: 1px solid #f3f4f6;
      transition: background-color 0.2s;
      align-items: center;
    }

    .task-row:hover {
      background: #f8fafc;
    }

    .task-row:last-child {
      border-bottom: none;
    }

    .task-title-cell {
      min-width: 0;
    }

    .row-task-title {
      margin: 0 0 0.25rem 0;
      font-size: 1rem;
      font-weight: 600;
      color: #1f2937;
    }

    .row-task-description {
      margin: 0 0 0.25rem 0;
      font-size: 0.875rem;
      color: #6b7280;
    }

    .row-task-tags {
      display: flex;
      gap: 0.25rem;
      flex-wrap: wrap;
    }

    .row-task-tag {
      padding: 0.125rem 0.25rem;
      background: #eff6ff;
      color: #1d4ed8;
      border-radius: 0.25rem;
      font-size: 0.7rem;
      font-weight: 500;
    }

    .more-tags-small {
      padding: 0.125rem 0.25rem;
      background: #f3f4f6;
      color: #6b7280;
      border-radius: 0.25rem;
      font-size: 0.7rem;
    }

    .status-badge,
    .priority-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.25rem 0.5rem;
      border-radius: 0.375rem;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .status-badge.status-pending {
      background: #fef3c7;
      color: #92400e;
    }

    .status-badge.status-in_progress {
      background: #dbeafe;
      color: #1d4ed8;
    }

    .status-badge.status-completed {
      background: #d1fae5;
      color: #065f46;
    }

    .priority-badge.priority-high {
      background: #fee2e2;
      color: #dc2626;
    }

    .priority-badge.priority-medium {
      background: #fef3c7;
      color: #d97706;
    }

    .priority-badge.priority-low {
      background: #d1fae5;
      color: #059669;
    }

    .assignee-name,
    .no-assignee {
      font-size: 0.875rem;
      color: #374151;
    }

    .no-assignee {
      color: #9ca3af;
      font-style: italic;
    }

    .due-date,
    .no-date {
      font-size: 0.875rem;
      color: #374151;
    }

    .due-date.overdue {
      color: #dc2626;
      font-weight: 600;
    }

    .no-date {
      color: #9ca3af;
      font-style: italic;
    }

    .row-action-btn {
      padding: 0.25rem;
      background: none;
      border: none;
      cursor: pointer;
      border-radius: 0.25rem;
      transition: background-color 0.2s;
    }

    .row-action-btn:hover {
      background: #f3f4f6;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .list-header {
        flex-direction: column;
        align-items: stretch;
      }

      .header-controls {
        justify-content: flex-start;
      }

      .view-grid .tasks-grid {
        grid-template-columns: 1fr;
      }

      .view-list .list-header-row,
      .view-list .task-row {
        grid-template-columns: 2fr auto;
        gap: 0.5rem;
      }

      .col-status,
      .col-priority,
      .col-assignee,
      .col-date {
        display: none;
      }

      .col-title {
        grid-column: 1;
      }

      .col-actions {
        grid-column: 2;
      }
    }
  `]
})
export class TaskListComponent {
  // Inputs
  tasks = input<Task[]>([]);
  loading = input<boolean>(false);

  // Outputs
  editTask = output<Task>();
  deleteTask = output<Task>();
  createTask = output<void>();

  // État interne
  currentViewMode = signal<ViewMode>('grid');
  statusFilter = signal<string>('');
  sortBy = signal<string>('created_at');
  filterTags = signal<string[]>([]);

  // Computed
  totalTasks = computed(() => this.tasks().length);

  filteredTasks = computed(() => {
    let items = this.tasks();

    // Filter by status
    const currentStatusFilter = this.statusFilter();
    if (currentStatusFilter) {
      items = items.filter(task => task.status === currentStatusFilter);
    }

    // Filter by tags
    const currentFilterTags = this.filterTags();
    if (currentFilterTags.length > 0) {
      items = items.filter(task =>
        currentFilterTags.every(filterTag => task.tags && task.tags.includes(filterTag))
      );
    }

    // Sort
    const currentSortBy = this.sortBy();
    if (currentSortBy) {
      items = [...items].sort((a, b) => {
        switch (currentSortBy) {
          case 'title':
            return (a.title || '').localeCompare(b.title || '');
          case 'status':
            return (a.status || '').localeCompare(b.status || '');
          case 'priority':
            const priorityOrder: { [key in Task['priority']]: number } = {
              'urgent': 4,
              'high': 3,
              'medium': 2,
              'low': 1
            };
            return (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
          case 'due_date':
            const dateA = a.due_date ? new Date(a.due_date).getTime() : Infinity;
            const dateB = b.due_date ? new Date(b.due_date).getTime() : Infinity;
            return dateA - dateB;
          case 'created_at':
            const createdA = a.created_at ? new Date(a.created_at).getTime() : Infinity;
            const createdB = b.created_at ? new Date(b.created_at).getTime() : Infinity;
            return createdA - createdB;
          default:
            return 0;
        }
      });
    }
    return items;
  });

  hasActiveFilters = computed(() => 
    this.statusFilter() !== '' || this.filterTags().length > 0
  );

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

  removeFilterTag(tag: string) {
    this.filterTags.update(tags => tags.filter(t => t !== tag));
  }

  clearAllFilters() {
    this.statusFilter.set('');
    this.filterTags.set([]);
  }

  isOverdue(dueDate: string): boolean {
    return new Date(dueDate) < new Date();
  }

  getStatusLabel(status: Task['status']): string {
    switch (status) {
      case 'pending': return 'En attente';
      case 'in_progress': return 'En cours';
      case 'completed': return 'Terminé';
      case 'cancelled': return 'Annulé';
      default: return 'Inconnu';
    }
  }

  getStatusIcon(status: Task['status']): string {
    switch (status) {
      case 'pending': return 'hourglass_empty';
      case 'in_progress': return 'sync';
      case 'completed': return 'check_circle';
      case 'cancelled': return 'cancel';
      default: return 'help_outline';
    }
  }

  getPriorityLabel(priority: Task['priority']): string {
    switch (priority) {
      case 'low': return 'Basse';
      case 'medium': return 'Moyenne';
      case 'high': return 'Haute';
      case 'urgent': return 'Urgente';
      default: return 'Inconnue';
    }
  }

  getPriorityIcon(priority: Task['priority']): string {
    switch (priority) {
      case 'low': return 'arrow_downward';
      case 'medium': return 'remove'; // Simple line for medium
      case 'high': return 'arrow_upward';
      case 'urgent': return 'priority_high';
      default: return 'help_outline';
    }
  }

  trackByTask(index: number, task: Task): string {
    return task.id || task.title;
  }

  // New method to cast statusFilter for template usage
  public getCastedStatusFilter(): Task['status'] {
    return this.statusFilter() as Task['status'];
  }
} 