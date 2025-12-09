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
  type: string;
  prd_slug: string;
  tag: string;
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
            placeholder="Rechercher par titre, slug, PRD ou numéro (#123)..."
            [(ngModel)]="searchText"
            (input)="onSearchChange()"
            aria-label="Rechercher des tâches par titre, slug, PRD ou numéro">
      </div>

      <!-- Filtres complets -->
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
            <option value="cancelled">Annulé</option>
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
            <option value="low">Basse</option>
            <option value="medium">Moyenne</option>
            <option value="high">Haute</option>
            <option value="urgent">Urgente</option>
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
            {{ isSearchNumber(searchText) ? 'Numéro: #' + searchText : 'Texte: "' + searchText + '"' }}
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
          <span *ngIf="environmentFilter" class="active-filter">
            Environnement: {{ environmentFilter }}
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
      background: rgba(255, 255, 255, 0.8);
      backdrop-filter: blur(12px);
      border-radius: 1rem;
      border: 1px solid rgba(255, 255, 255, 0.6);
      padding: 1.5rem;
      margin-bottom: 2rem;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
      width: 100%;
      box-sizing: border-box;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .c-filters:hover {
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    }
    .search-mat-field {
      width: 100%;
      margin-bottom: 0.5rem;
    }
    .search-mat-field .mat-form-field-flex {
      background: white;
      border-radius: 0.75rem;
      border: 1px solid #e5e7eb;
    }
    .filters-quick {
      display: flex;
      gap: 1rem;
      align-items: flex-end;
      width: 100%;
      flex-wrap: wrap; 
    }
    .filter-group {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }
    .filter-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .filter-select {
      padding: 0.5rem 0.75rem;
      border: 1px solid #e5e7eb;
      border-radius: 0.5rem;
      background: rgba(255, 255, 255, 0.9);
      color: #1f2937;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.2s;
      min-width: 140px;
      height: 40px;
    }
    .filter-select:hover {
      border-color: #3b82f6;
    }
    .filter-select:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
    }
    .priority-select option {
      padding-left: 1.5em;
    }
    .reset-filters {
      padding: 0.5rem 1rem;
      background: #fee2e2;
      color: #b91c1c;
      border: 1px solid #fca5a5;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      height: 40px;
      display: flex;
      align-items: center;
      gap: 0.375rem;
    }
    .reset-filters:hover {
      background: #fecaca;
      transform: translateY(-1px);
      box-shadow: 0 2px 4px rgba(220, 38, 38, 0.1);
    }
    .search-results {
      margin-top: 1.5rem;
      padding: 0.75rem 1rem;
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      border-radius: 0.5rem;
      color: #0369a1;
    }
    .results-text {
      font-size: 0.875rem;
    }
    .active-filter {
      font-weight: 600;
      margin-right: 0.5rem;
      padding: 0.125rem 0.5rem;
      background: #dbeafe;
      border-radius: 0.25rem;
      color: #1e40af;
    }
    @media (max-width: 768px) {
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
      .filter-select {
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
      completed: 'Terminé',
      cancelled: 'Annulé'
    };
    return labels[status] || status;
  }

  getPriorityLabel(priority: string): string {
    const labels: Record<string, string> = {
      low: 'Basse',
      medium: 'Moyenne',
      high: 'Haute',
      urgent: 'Urgente'
    };
    return labels[priority] || priority;
  }

  private emitFilters() {
    const filters = {
      searchText: this.searchText,
      status: this.statusFilter,
      priority: this.priorityFilter,
      environment: this.environmentFilter,
      type: this.typeFilter,
      prd_slug: this.prdSlugFilter,
      tag: this.tagFilter
    };
    this.filtersChange.emit(filters);
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

  isSearchNumber(text: string): boolean {
    return !isNaN(Number(text)) && text.length > 0;
  }
} 