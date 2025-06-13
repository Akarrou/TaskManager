import { Component, signal, output, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';

export interface SearchFilters {
  searchText: string;
  status: string;
  priority: string;
  environment: string;
  type?: string;
  prd_slug?: string;
  tag?: string;
}

@Component({
  selector: 'app-task-search',
  standalone: true,
  imports: [CommonModule, FormsModule, MatFormFieldModule, MatInputModule, MatIconModule],
  template: `
    <div class="c-filters" style="width: 100%; box-sizing: border-box; flex-direction: column; gap: 0.5rem;">
      <!-- Barre de recherche principale -->
      <div style="margin-bottom: 1rem; margin-top: 1rem;">
          <input matInput
            type="text"
            placeholder="Rechercher des tâches..."
            [(ngModel)]="searchText"
            (input)="onSearchChange()"
            aria-label="Rechercher des tâches">
      </div>

      <!-- Filtres rapides -->
      <div class="filters-quick" style="display: flex; align-items: flex-end; gap: 1rem; width: 100%;">
        <!-- Filtre par type -->
        <div class="filter-group">
          <label class="filter-label">Type</label>
          <select class="filter-select" [(ngModel)]="typeFilter" (change)="onFilterChange()" aria-label="Filtrer par type">
            <option value="">Tous</option>
            <option value="epic">Epic</option>
            <option value="feature">Feature</option>
            <option value="task">Task</option>
          </select>
        </div>
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
            class="filter-select priority-select"
            [(ngModel)]="priorityFilter"
            (change)="onFilterChange()"
            aria-label="Filtrer par priorité">
            <option value="">Toutes</option>
            <option value="high">Haute</option>
            <option value="medium">Moyenne</option>
            <option value="low">Basse</option>
          </select>
        </div>
        <!-- Filtre par environnement -->
        <div class="filter-group">
          <label class="filter-label">Environnement</label>
          <select 
            class="filter-select env-select"
            [(ngModel)]="environmentFilter"
            (change)="onFilterChange()"
            aria-label="Filtrer par environnement">
            <option value="">Tous</option>
            <option value="frontend">Frontend</option>
            <option value="backend">Backend</option>
          </select>
        </div>
        <!-- Filtre par PRD Slug -->
        <div class="filter-group">
          <label class="filter-label">PRD Slug</label>
          <input class="filter-select" type="text" [(ngModel)]="prdSlugFilter" (input)="onFilterChange()" placeholder="ex: prd-gestion-roles">
        </div>
        <!-- Filtre par tag -->
        <div class="filter-group">
          <label class="filter-label">Tag</label>
          <input class="filter-select" type="text" [(ngModel)]="tagFilter" (input)="onFilterChange()" placeholder="ex: urgent">
        </div>
        <div style="flex:1;"></div>
        <!-- Bouton reset aligné à droite -->
        <button 
          *ngIf="hasActiveFilters()"
          class="reset-filters"
          style="margin-left:auto; display:flex; align-items:center; gap:0.25rem;"
          (click)="resetFilters()"
          title="Réinitialiser les filtres">
          <span class="material-icons-outlined" style="font-size:1.1em;">delete_sweep</span>
          <span>Reset</span>
        </button>
      </div>

      <!-- Indicateur de résultats -->
      <div class="search-results" *ngIf="hasActiveFilters()">
        <span class="results-text">
          Filtres actifs : 
                     <span *ngIf="searchText" class="active-filter">
             Texte: "{{ searchText }}"
           </span>
           <span *ngIf="typeFilter" class="active-filter">
             Type: {{ typeFilter }}
           </span>
           <span *ngIf="statusFilter" class="active-filter">
             Statut: {{ getStatusLabel(statusFilter) }}
           </span>
           <span *ngIf="priorityFilter" class="active-filter">
             Priorité: {{ getPriorityLabel(priorityFilter) }}
           </span>
           <span *ngIf="prdSlugFilter" class="active-filter">
             PRD: {{ prdSlugFilter }}
           </span>
           <span *ngIf="tagFilter" class="active-filter">
             Tag: {{ tagFilter }}
           </span>
        </span>
      </div>
    </div>
  `,
  styles: [`
    .c-filters {
      background: white;
      border-radius: 0.75rem;
      border: 2px solid #e5e7eb;
      padding: 1rem 1.5rem 1.5rem 1.5rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
      width: 100%;
      box-sizing: border-box;
    }
    .search-mat-field {
      width: 100%;
      margin-bottom: 0.5rem;
    }
    .search-mat-field .mat-form-field-flex {
      min-height: 38px;
      padding: 0 8px;
      background: #f9fafb;
      border-radius: 8px;
    }
    .mat-form-field-appearance-fill .mat-form-field-flex {
      background: #f9fafb;
    }
    .mat-input-element {
      font-size: 1rem;
      padding: 0.5rem 0;
    }
    .mat-form-field-outline {
      border-radius: 8px;
    }
    .mat-form-field-appearance-fill .mat-form-field-outline {
      border-radius: 8px;
    }
    .filters-quick {
      display: flex;
      gap: 1rem;
      align-items: flex-end;
      width: 100%;
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
      padding: 0.35rem 0.75rem;
      border: 1.5px solid #e5e7eb;
      border-radius: 0.375rem;
      background: white;
      color: #374151;
      font-size: 0.95rem;
      cursor: pointer;
      transition: border-color 0.2s;
      min-width: 120px;
      min-height: 32px;
    }
    .filter-select:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.08);
    }
    .priority-select option {
      padding-left: 1.5em;
    }
    .reset-filters {
      padding: 0.5rem 1rem;
      background: #fee2e2;
      color: #dc2626;
      border: 2px solid #fecaca;
      border-radius: 0.375rem;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      height: fit-content;
      display: flex;
      align-items: center;
      gap: 0.25rem;
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
    @media (max-width: 640px) {
      .c-filters {
        padding: 1rem;
      }
      .filters-quick {
        flex-direction: column;
        align-items: stretch;
      }
      .filter-group {
        width: 100%;
      }
    }
  `]
})
export class TaskSearchComponent implements OnChanges {
  // État des filtres (propriétés simples)
  searchText = '';
  statusFilter = '';
  priorityFilter = '';
  environmentFilter = '';
  typeFilter = '';
  prdSlugFilter = '';
  tagFilter = '';

  // Output pour notifier les changements
  filtersChange = output<SearchFilters>();

  @Input() filters: SearchFilters | null = null;

  ngOnChanges(changes: SimpleChanges) {
    if (changes['filters'] && this.filters) {
      this.searchText = this.filters.searchText || '';
      this.statusFilter = this.filters.status || '';
      this.priorityFilter = this.filters.priority || '';
      this.environmentFilter = this.filters.environment || '';
      this.typeFilter = this.filters.type || '';
      this.prdSlugFilter = this.filters.prd_slug || '';
      this.tagFilter = this.filters.tag || '';
    }
  }

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
    this.environmentFilter = '';
    this.typeFilter = '';
    this.prdSlugFilter = '';
    this.tagFilter = '';
    this.emitFilters();
  }

  hasActiveFilters(): boolean {
    return this.searchText !== '' || 
           this.statusFilter !== '' || 
           this.priorityFilter !== '' ||
           this.environmentFilter !== '' ||
           this.typeFilter !== '' ||
           this.prdSlugFilter !== '' ||
           this.tagFilter !== '';
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
      priority: this.priorityFilter,
      environment: this.environmentFilter,
      type: this.typeFilter,
      prd_slug: this.prdSlugFilter,
      tag: this.tagFilter
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
    if (filters.environment !== undefined) {
      this.environmentFilter = filters.environment;
    }
    if (filters.type !== undefined) {
      this.typeFilter = filters.type;
    }
    if (filters.prd_slug !== undefined) {
      this.prdSlugFilter = filters.prd_slug;
    }
    if (filters.tag !== undefined) {
      this.tagFilter = filters.tag;
    }
    this.emitFilters();
  }

  getFilters(): SearchFilters {
    return {
      searchText: this.searchText,
      status: this.statusFilter,
      priority: this.priorityFilter,
      environment: this.environmentFilter,
      type: this.typeFilter,
      prd_slug: this.prdSlugFilter,
      tag: this.tagFilter
    };
  }
} 