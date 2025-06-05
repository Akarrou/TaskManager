import { Component, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface SearchFilters {
  searchText: string;
  status: string;
  priority: string;
}

@Component({
  selector: 'app-task-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="search-container">
      <!-- Barre de recherche principale -->
      <div class="search-main">
        <div class="search-input-wrapper">
          <span class="search-icon">🔍</span>
          <input
            type="text"
            class="search-input"
            placeholder="Rechercher des tâches..."
            [(ngModel)]="searchText"
            (input)="onSearchChange()"
            aria-label="Rechercher des tâches">
          <button 
            *ngIf="searchText"
            class="clear-search"
            (click)="clearSearch()"
            title="Effacer la recherche"
            aria-label="Effacer la recherche">
            ✕
          </button>
        </div>
      </div>

      <!-- Filtres rapides -->
      <div class="filters-quick">
        <!-- Filtre par statut -->
        <div class="filter-group">
          <label class="filter-label">Statut</label>
          <select 
            class="filter-select"
            [(ngModel)]="statusFilter"
            (change)="onFilterChange()"
            aria-label="Filtrer par statut">
            <option value="">Tous</option>
            <option value="pending">En attente</option>
            <option value="in_progress">En cours</option>
            <option value="completed">Terminé</option>
          </select>
        </div>

        <!-- Filtre par priorité -->
        <div class="filter-group">
          <label class="filter-label">Priorité</label>
          <select 
            class="filter-select"
            [(ngModel)]="priorityFilter"
            (change)="onFilterChange()"
            aria-label="Filtrer par priorité">
            <option value="">Toutes</option>
            <option value="high">🔴 Haute</option>
            <option value="medium">🟡 Moyenne</option>
            <option value="low">🟢 Basse</option>
          </select>
        </div>

        <!-- Bouton reset -->
        <button 
          *ngIf="hasActiveFilters()"
          class="reset-filters"
          (click)="resetFilters()"
          title="Réinitialiser les filtres">
          🗑️ Reset
        </button>
      </div>

      <!-- Indicateur de résultats -->
      <div class="search-results" *ngIf="hasActiveFilters()">
        <span class="results-text">
          Filtres actifs : 
                     <span *ngIf="searchText" class="active-filter">
             Texte: "{{ searchText }}"
           </span>
           <span *ngIf="statusFilter" class="active-filter">
             Statut: {{ getStatusLabel(statusFilter) }}
           </span>
           <span *ngIf="priorityFilter" class="active-filter">
             Priorité: {{ getPriorityLabel(priorityFilter) }}
           </span>
        </span>
      </div>
    </div>
  `,
  styles: [`
    .search-container {
      background: white;
      border-radius: 0.75rem;
      border: 2px solid #e5e7eb;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    }

    .search-main {
      margin-bottom: 1rem;
    }

    .search-input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
      background: #f9fafb;
      border: 2px solid #e5e7eb;
      border-radius: 0.5rem;
      padding: 0.75rem;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    .search-input-wrapper:focus-within {
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .search-icon {
      margin-right: 0.5rem;
      color: #6b7280;
      font-size: 1.125rem;
    }

    .search-input {
      flex: 1;
      border: none;
      background: none;
      outline: none;
      font-size: 1rem;
      color: #374151;
    }

    .search-input::placeholder {
      color: #9ca3af;
    }

    .clear-search {
      background: none;
      border: none;
      color: #6b7280;
      cursor: pointer;
      padding: 0.25rem;
      border-radius: 0.25rem;
      transition: all 0.2s;
    }

    .clear-search:hover {
      background: #e5e7eb;
      color: #374151;
    }

    .filters-quick {
      display: flex;
      gap: 1rem;
      align-items: flex-end;
      flex-wrap: wrap;
    }

    .filter-group {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .filter-label {
      font-size: 0.875rem;
      font-weight: 600;
      color: #374151;
    }

    .filter-select {
      padding: 0.5rem 0.75rem;
      border: 2px solid #e5e7eb;
      border-radius: 0.375rem;
      background: white;
      color: #374151;
      font-size: 0.875rem;
      cursor: pointer;
      transition: border-color 0.2s;
      min-width: 120px;
    }

    .filter-select:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .reset-filters {
      padding: 0.5rem 1rem;
      background: #fee2e2;
      color: #dc2626;
      border: 2px solid #fecaca;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      height: fit-content;
    }

    .reset-filters:hover {
      background: #fecaca;
      border-color: #fca5a5;
    }

    .search-results {
      margin-top: 1rem;
      padding: 0.75rem;
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      border-radius: 0.375rem;
    }

    .results-text {
      font-size: 0.875rem;
      color: #0369a1;
    }

    .active-filter {
      font-weight: 600;
      margin-right: 0.5rem;
      padding: 0.125rem 0.375rem;
      background: #dbeafe;
      border-radius: 0.25rem;
    }

    /* Responsive */
    @media (max-width: 640px) {
      .search-container {
        padding: 1rem;
      }

      .filters-quick {
        flex-direction: column;
        align-items: stretch;
      }

      .filter-group {
        width: 100%;
      }

      .filter-select {
        min-width: auto;
      }
    }
  `]
})
export class TaskSearchComponent {
  // État des filtres (propriétés simples)
  searchText = '';
  statusFilter = '';
  priorityFilter = '';

  // Output pour notifier les changements
  filtersChange = output<SearchFilters>();

  onSearchChange() {
    this.emitFilters();
  }

  onFilterChange() {
    this.emitFilters();
  }

  clearSearch() {
    this.searchText = '';
    this.emitFilters();
  }

  resetFilters() {
    this.searchText = '';
    this.statusFilter = '';
    this.priorityFilter = '';
    this.emitFilters();
  }

  hasActiveFilters(): boolean {
    return this.searchText !== '' || 
           this.statusFilter !== '' || 
           this.priorityFilter !== '';
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending: 'En attente',
      in_progress: 'En cours',
      completed: 'Terminé'
    };
    return labels[status] || status;
  }

  getPriorityLabel(priority: string): string {
    const labels: Record<string, string> = {
      high: 'Haute',
      medium: 'Moyenne',
      low: 'Basse'
    };
    return labels[priority] || priority;
  }

  private emitFilters() {
    this.filtersChange.emit({
      searchText: this.searchText,
      status: this.statusFilter,
      priority: this.priorityFilter
    });
  }

  // Méthodes publiques pour contrôle externe
  setFilters(filters: Partial<SearchFilters>) {
    if (filters.searchText !== undefined) {
      this.searchText = filters.searchText;
    }
    if (filters.status !== undefined) {
      this.statusFilter = filters.status;
    }
    if (filters.priority !== undefined) {
      this.priorityFilter = filters.priority;
    }
    this.emitFilters();
  }

  getFilters(): SearchFilters {
    return {
      searchText: this.searchText,
      status: this.statusFilter,
      priority: this.priorityFilter
    };
  }
} 