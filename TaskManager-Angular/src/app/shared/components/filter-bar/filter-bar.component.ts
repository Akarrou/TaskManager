import { Component, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface FilterOptions {
  status: string;
  priority: string;
  searchTerm: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="filter-bar">
      <div class="filter-container">
        <!-- Recherche -->
        <div class="filter-group search-group">
          <label for="search" class="filter-label">
            <svg class="search-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z"/>
            </svg>
          </label>
          <input
            id="search"
            type="text"
            class="search-input"
            placeholder="Rechercher une tâche..."
            [(ngModel)]="filters().searchTerm"
            (ngModelChange)="updateSearch($event)"
            aria-label="Rechercher parmi les tâches">
        </div>

        <!-- Filtres -->
        <div class="filters-row">
          <!-- Filtre par statut -->
          <div class="filter-group">
            <label for="status-filter" class="filter-label">Statut</label>
            <select
              id="status-filter"
              class="filter-select"
              [(ngModel)]="filters().status"
              (ngModelChange)="updateFilters()"
              aria-label="Filtrer par statut">
              <option value="">Tous les statuts</option>
              <option value="pending">⏳ En attente</option>
              <option value="in_progress">🔄 En cours</option>
              <option value="completed">✅ Terminée</option>
              <option value="cancelled">❌ Annulée</option>
            </select>
          </div>

          <!-- Filtre par priorité -->
          <div class="filter-group">
            <label for="priority-filter" class="filter-label">Priorité</label>
            <select
              id="priority-filter"
              class="filter-select"
              [(ngModel)]="filters().priority"
              (ngModelChange)="updateFilters()"
              aria-label="Filtrer par priorité">
              <option value="">Toutes les priorités</option>
              <option value="low">🟢 Faible</option>
              <option value="medium">🟡 Moyenne</option>
              <option value="high">🟠 Élevée</option>
              <option value="urgent">🔴 Urgente</option>
            </select>
          </div>

          <!-- Tri -->
          <div class="filter-group">
            <label for="sort-filter" class="filter-label">Trier par</label>
            <select
              id="sort-filter"
              class="filter-select"
              [(ngModel)]="filters().sortBy"
              (ngModelChange)="updateFilters()"
              aria-label="Trier les tâches par">
              <option value="created_at">Date de création</option>
              <option value="due_date">Date d'échéance</option>
              <option value="priority">Priorité</option>
              <option value="status">Statut</option>
              <option value="title">Titre</option>
            </select>
          </div>

          <!-- Ordre de tri -->
          <div class="filter-group">
            <button
              class="sort-order-btn"
              (click)="toggleSortOrder()"
              [attr.aria-label]="'Trier par ordre ' + (filters().sortOrder === 'asc' ? 'croissant' : 'décroissant')"
              title="Changer l'ordre de tri">
              <svg class="sort-icon" viewBox="0 0 24 24" fill="currentColor">
                <path *ngIf="filters().sortOrder === 'asc'" d="M3,13H15L11,9H13L17.5,13.5L13,18H11L15,14H3V13Z"/>
                <path *ngIf="filters().sortOrder === 'desc'" d="M21,11H9L13,15H11L6.5,10.5L11,6H13L9,10H21V11Z"/>
              </svg>
              {{ filters().sortOrder === 'asc' ? 'Croissant' : 'Décroissant' }}
            </button>
          </div>
        </div>

        <!-- Actions rapides -->
        <div class="quick-actions">
          <button
            class="quick-filter-btn"
            (click)="setQuickFilter('urgent')"
            [class.active]="isQuickFilterActive('urgent')"
            aria-label="Afficher uniquement les tâches urgentes">
            🔴 Urgentes
          </button>
          <button
            class="quick-filter-btn"
            (click)="setQuickFilter('today')"
            [class.active]="isQuickFilterActive('today')"
            aria-label="Afficher les tâches d'aujourd'hui">
            📅 Aujourd'hui
          </button>
          <button
            class="quick-filter-btn"
            (click)="setQuickFilter('completed')"
            [class.active]="isQuickFilterActive('completed')"
            aria-label="Afficher les tâches terminées">
            ✅ Terminées
          </button>
          <button
            class="reset-btn"
            (click)="resetFilters()"
            aria-label="Réinitialiser tous les filtres">
            🔄 Réinitialiser
          </button>
        </div>

        <!-- Résumé des filtres actifs -->
        <div class="active-filters" *ngIf="hasActiveFilters()">
          <span class="filters-label">Filtres actifs :</span>
          <div class="filter-tags">
            <span class="filter-tag" *ngIf="filters().status">
              Statut: {{ getStatusLabel(filters().status) }}
              <button (click)="clearFilter('status')" aria-label="Supprimer le filtre statut">×</button>
            </span>
            <span class="filter-tag" *ngIf="filters().priority">
              Priorité: {{ getPriorityLabel(filters().priority) }}
              <button (click)="clearFilter('priority')" aria-label="Supprimer le filtre priorité">×</button>
            </span>
            <span class="filter-tag" *ngIf="filters().searchTerm">
              Recherche: "{{ filters().searchTerm }}"
              <button (click)="clearFilter('searchTerm')" aria-label="Supprimer la recherche">×</button>
            </span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .filter-bar {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 0.75rem;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    }

    .filter-container {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .search-group {
      position: relative;
      max-width: 400px;
    }

    .search-input {
      width: 100%;
      padding: 0.75rem 0.75rem 0.75rem 3rem;
      border: 2px solid #e5e7eb;
      border-radius: 0.5rem;
      font-size: 1rem;
      transition: border-color 0.2s;
    }

    .search-input:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .search-icon {
      position: absolute;
      left: 0.75rem;
      top: 50%;
      transform: translateY(-50%);
      width: 20px;
      height: 20px;
      color: #9ca3af;
      pointer-events: none;
    }

    .filters-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
      align-items: end;
    }

    .filter-group {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .filter-label {
      font-size: 0.875rem;
      font-weight: 600;
      color: #374151;
    }

    .filter-select {
      padding: 0.75rem;
      border: 2px solid #e5e7eb;
      border-radius: 0.5rem;
      font-size: 1rem;
      background: white;
      transition: border-color 0.2s;
    }

    .filter-select:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .sort-order-btn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      background: #f1f5f9;
      border: 2px solid #e2e8f0;
      border-radius: 0.5rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .sort-order-btn:hover {
      background: #e2e8f0;
      border-color: #cbd5e1;
    }

    .sort-order-btn:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .sort-icon {
      width: 16px;
      height: 16px;
    }

    .quick-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      padding-top: 0.5rem;
      border-top: 1px solid #f1f5f9;
    }

    .quick-filter-btn,
    .reset-btn {
      padding: 0.5rem 1rem;
      border: 2px solid #e2e8f0;
      border-radius: 0.5rem;
      background: white;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .quick-filter-btn:hover,
    .reset-btn:hover {
      border-color: #3b82f6;
      background: #eff6ff;
    }

    .quick-filter-btn.active {
      background: #3b82f6;
      color: white;
      border-color: #3b82f6;
    }

    .reset-btn {
      background: #f1f5f9;
      color: #6b7280;
    }

    .reset-btn:hover {
      background: #e2e8f0;
      border-color: #9ca3af;
    }

    .active-filters {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem;
      padding-top: 1rem;
      border-top: 1px solid #f1f5f9;
    }

    .filters-label {
      font-size: 0.875rem;
      font-weight: 600;
      color: #6b7280;
    }

    .filter-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .filter-tag {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.25rem 0.75rem;
      background: #eff6ff;
      color: #1d4ed8;
      border-radius: 9999px;
      font-size: 0.875rem;
      font-weight: 500;
    }

    .filter-tag button {
      background: none;
      border: none;
      color: #1d4ed8;
      cursor: pointer;
      font-weight: bold;
      padding: 0;
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      transition: background-color 0.2s;
    }

    .filter-tag button:hover {
      background: #dbeafe;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .filters-row {
        grid-template-columns: 1fr;
      }
      
      .quick-actions {
        justify-content: center;
      }
      
      .active-filters {
        flex-direction: column;
        align-items: flex-start;
      }
    }
  `]
})
export class FilterBarComponent {
  filters = signal<FilterOptions>({
    status: '',
    priority: '',
    searchTerm: '',
    sortBy: 'created_at',
    sortOrder: 'desc'
  });

  activeQuickFilter = signal<string>('');
  
  // Outputs pour communiquer avec le parent
  filtersChange = output<FilterOptions>();

  updateSearch(searchTerm: string) {
    this.filters.update(current => ({ ...current, searchTerm }));
    this.emitFilters();
  }

  updateFilters() {
    this.activeQuickFilter.set('');
    this.emitFilters();
  }

  toggleSortOrder() {
    this.filters.update(current => ({
      ...current,
      sortOrder: current.sortOrder === 'asc' ? 'desc' : 'asc'
    }));
    this.emitFilters();
  }

  setQuickFilter(filterType: string) {
    if (this.activeQuickFilter() === filterType) {
      this.resetFilters();
      return;
    }

    this.activeQuickFilter.set(filterType);

    switch (filterType) {
      case 'urgent':
        this.filters.update(current => ({
          ...current,
          priority: 'urgent',
          status: '',
          searchTerm: ''
        }));
        break;
      case 'today':
        const today = new Date().toISOString().split('T')[0];
        this.filters.update(current => ({
          ...current,
          searchTerm: today,
          status: '',
          priority: ''
        }));
        break;
      case 'completed':
        this.filters.update(current => ({
          ...current,
          status: 'completed',
          priority: '',
          searchTerm: ''
        }));
        break;
    }
    this.emitFilters();
  }

  isQuickFilterActive(filterType: string): boolean {
    return this.activeQuickFilter() === filterType;
  }

  resetFilters() {
    this.filters.set({
      status: '',
      priority: '',
      searchTerm: '',
      sortBy: 'created_at',
      sortOrder: 'desc'
    });
    this.activeQuickFilter.set('');
    this.emitFilters();
  }

  clearFilter(filterType: keyof FilterOptions) {
    this.filters.update(current => ({
      ...current,
      [filterType]: filterType === 'sortBy' ? 'created_at' : 
                   filterType === 'sortOrder' ? 'desc' : ''
    }));
    this.activeQuickFilter.set('');
    this.emitFilters();
  }

  hasActiveFilters(): boolean {
    const current = this.filters();
    return !!(current.status || current.priority || current.searchTerm);
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      'pending': '⏳ En attente',
      'in_progress': '🔄 En cours',
      'completed': '✅ Terminée',
      'cancelled': '❌ Annulée'
    };
    return labels[status] || status;
  }

  getPriorityLabel(priority: string): string {
    const labels: Record<string, string> = {
      'low': '🟢 Faible',
      'medium': '🟡 Moyenne',
      'high': '🟠 Élevée',
      'urgent': '🔴 Urgente'
    };
    return labels[priority] || priority;
  }

  private emitFilters() {
    this.filtersChange.emit(this.filters());
  }
} 