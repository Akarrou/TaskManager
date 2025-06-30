import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Store } from '@ngrx/store';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { EpicKanbanActions } from '../../store/epic-kanban.actions';
import { selectEpicKanbanFilters } from '../../store/epic-kanban.selectors';

export interface KanbanSearchFilters {
  searchText: string;
  priority: string;
  assignee: string;
  status: string;
}

@Component({
  selector: 'app-search-filters',
  standalone: true,
  imports: [
    CommonModule, 
    MatIconModule
  ],
  templateUrl: './search-filters.component.html',
  styleUrls: ['./search-filters.component.scss']
})
export class SearchFiltersComponent implements OnInit {
  private store = inject(Store);
  
  // État local des filtres
  searchText = signal('');
  priorityFilter = signal('');
  assigneeFilter = signal('');
  statusFilter = signal('');
  
  // État d'expansion du panel
  isExpanded = signal(false);
  
  // Subject pour la recherche avec debounce
  private searchSubject$ = new Subject<string>();
  
  // Options pour les selects
  statusOptions = [
    { value: 'pending', label: 'En attente' },
    { value: 'in_progress', label: 'En cours' },
    { value: 'review', label: 'Review' },
    { value: 'completed', label: 'Terminé' }
  ];
  
  priorityOptions = [
    { value: 'low', label: 'Basse' },
    { value: 'medium', label: 'Moyenne' },
    { value: 'high', label: 'Haute' },
    { value: 'urgent', label: 'Urgente' }
  ];

  // Signal calculé pour savoir si des filtres sont actifs
  hasActiveFilters = computed(() => {
    return !!(this.searchText() || this.priorityFilter() || this.assigneeFilter() || this.statusFilter());
  });

  // Signal calculé pour compter les filtres actifs
  activeFiltersCount = computed(() => {
    let count = 0;
    if (this.searchText()) count++;
    if (this.priorityFilter()) count++;
    if (this.assigneeFilter()) count++;
    if (this.statusFilter()) count++;
    return count;
  });

  // Méthode pour obtenir la liste des utilisateurs (temporaire - à connecter au store)
  availableUsers = () => [
    { id: 'user1', email: 'admin@test.com' },
    { id: 'user2', email: 'dev@test.com' }
  ];

  // Computed properties pour les labels des filtres actifs
  readonly activeStatusLabel = computed(() => {
    const status = this.statusFilter();
    if (!status) return '';
    return this.statusOptions.find(s => s.value === status)?.label || '';
  });

  readonly activePriorityLabel = computed(() => {
    const priority = this.priorityFilter();
    if (!priority) return '';
    return this.priorityOptions.find(p => p.value === priority)?.label || '';
  });

  readonly activeAssigneeLabel = computed(() => {
    const assignee = this.assigneeFilter();
    if (!assignee) return '';
    if (assignee === 'unassigned') return 'Non assigné';
    
    const user = this.availableUsers().find(u => u.id === assignee);
    return user ? user.email : assignee;
  });

  ngOnInit() {
    // Configuration du debounce pour la recherche
    this.searchSubject$.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(searchTerm => {
      this.updateFilters({ searchText: searchTerm });
    });

    // Écouter les changements de filtres depuis le store
    this.store.select(selectEpicKanbanFilters).subscribe(filters => {
      if (filters) {
        this.searchText.set(filters.searchText || '');
        this.priorityFilter.set(filters.priority || '');
        this.assigneeFilter.set(filters.assignee || '');
        this.statusFilter.set(filters.status || '');
      }
    });
  }

  // Méthodes pour gérer les changements de filtres
  onSearchChange(value: string) {
    this.searchText.set(value);
    this.searchSubject$.next(value);
  }

  clearSearch() {
    this.searchText.set('');
    this.searchSubject$.next('');
  }

  onPriorityChange(value: string) {
    this.priorityFilter.set(value);
    this.updateFilters({ priority: value });
  }

  onAssigneeChange(value: string) {
    this.assigneeFilter.set(value);
    this.updateFilters({ assignee: value });
  }

  onStatusChange(value: string) {
    this.statusFilter.set(value);
    this.updateFilters({ status: value });
  }

  // Basculer l'expansion du panel
  toggleExpanded() {
    this.isExpanded.update(expanded => !expanded);
  }

  // Méthode pour mettre à jour les filtres dans le store
  private updateFilters(filterUpdate: any) {
    this.store.dispatch(EpicKanbanActions.updateFilters({
      searchText: filterUpdate.searchText ?? this.searchText(),
      priority: filterUpdate.priority ?? this.priorityFilter(),
      assignee: filterUpdate.assignee ?? this.assigneeFilter(),
      status: filterUpdate.status ?? this.statusFilter()
    }));
  }

  // Réinitialiser tous les filtres
  clearFilters() {
    this.searchText.set('');
    this.priorityFilter.set('');
    this.assigneeFilter.set('');
    this.statusFilter.set('');
    
    this.store.dispatch(EpicKanbanActions.clearFilters());
  }

  // Méthodes utilitaires pour les icônes
  getStatusIcon(status: string): string {
    const icons: { [key: string]: string } = {
      'pending': 'radio_button_unchecked',
      'in_progress': 'hourglass_empty',
      'review': 'rate_review',
      'completed': 'check_circle'
    };
    return icons[status] || 'radio_button_unchecked';
  }

  getPriorityIcon(priority: string): string {
    const icons: { [key: string]: string } = {
      'low': 'arrow_downward',
      'medium': 'remove',
      'high': 'arrow_upward',
      'urgent': 'priority_high'
    };
    return icons[priority] || 'low_priority';
  }
} 