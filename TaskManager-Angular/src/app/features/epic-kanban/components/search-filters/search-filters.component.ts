import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonModule } from '@angular/material/button';
import { Store } from '@ngrx/store';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';

import { EpicKanbanActions } from '../../store/epic-kanban.actions';
import { 
  selectEpicKanbanFilters, 
  selectUniqueAssignees, 
  selectUniqueEnvironments,
  selectUniqueTags 
} from '../../store/epic-kanban.selectors';
import { UserService } from '../../../../core/services/user.service';

export interface KanbanSearchFilters {
  searchText: string;
  priority: string;
  assignee: string;
  status: string;
  environment: string;
  tags: string[];
}

@Component({
  selector: 'app-search-filters',
  standalone: true,
  imports: [
    CommonModule, 
    MatIconModule,
    MatChipsModule,
    MatButtonModule
  ],
  templateUrl: './search-filters.component.html',
  styleUrls: ['./search-filters.component.scss']
})
export class SearchFiltersComponent implements OnInit {
  private store = inject(Store);
  private userService = inject(UserService);
  private destroy$ = new Subject<void>();
  
  // État local des filtres
  searchText = signal('');
  priorityFilter = signal('');
  assigneeFilter = signal('');
  statusFilter = signal('');
  environmentFilter = signal('');
  tagsFilter = signal<string[]>([]);
  
  // État d'expansion du panel
  isExpanded = signal(false);
  
  // Données du store
  availableUsers = signal<{ id: string; email: string }[]>([]);
  uniqueAssignees = signal<string[]>([]);
  uniqueEnvironments = signal<string[]>([]);
  uniqueTags = signal<string[]>([]);
  
  // Subject pour la recherche avec debounce
  private searchSubject$ = new Subject<string>();
  
  // Options pour les selects avec icônes
  statusOptions = [
    { value: 'pending', label: 'En attente', icon: 'radio_button_unchecked', color: '#6B7280' },
    { value: 'in_progress', label: 'En cours', icon: 'hourglass_empty', color: '#F59E0B' },
    { value: 'review', label: 'Review', icon: 'rate_review', color: '#3B82F6' },
    { value: 'completed', label: 'Terminé', icon: 'check_circle', color: '#10B981' }
  ];
  
  priorityOptions = [
    { value: 'low', label: 'Basse', icon: 'arrow_downward', color: '#6B7280' },
    { value: 'medium', label: 'Moyenne', icon: 'remove', color: '#F59E0B' },
    { value: 'high', label: 'Haute', icon: 'arrow_upward', color: '#DC2626' },
    { value: 'urgent', label: 'Urgente', icon: 'priority_high', color: '#DC2626' }
  ];

  // T020 - Options environnement
  environmentOptions = [
    { value: 'development', label: 'Développement', icon: 'code', color: '#3B82F6' },
    { value: 'staging', label: 'Staging', icon: 'preview', color: '#F59E0B' },
    { value: 'production', label: 'Production', icon: 'public', color: '#10B981' },
    { value: 'testing', label: 'Test', icon: 'bug_report', color: '#8B5CF6' }
  ];

  // Signal calculé pour savoir si des filtres sont actifs
  hasActiveFilters = computed(() => {
    return !!(
      this.searchText() || 
      this.priorityFilter() || 
      this.assigneeFilter() || 
      this.statusFilter() ||
      this.environmentFilter() ||
      this.tagsFilter().length > 0
    );
  });

  // Signal calculé pour compter les filtres actifs
  activeFiltersCount = computed(() => {
    let count = 0;
    if (this.searchText()) count++;
    if (this.priorityFilter()) count++;
    if (this.assigneeFilter()) count++;
    if (this.statusFilter()) count++;
    if (this.environmentFilter()) count++;
    if (this.tagsFilter().length > 0) count += this.tagsFilter().length;
    return count;
  });

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

  readonly activeEnvironmentLabel = computed(() => {
    const environment = this.environmentFilter();
    if (!environment) return '';
    return this.environmentOptions.find(e => e.value === environment)?.label || '';
  });

  readonly activeAssigneeLabel = computed(() => {
    const assignee = this.assigneeFilter();
    if (!assignee) return '';
    if (assignee === 'unassigned') return 'Non assigné';
    
    const user = this.availableUsers().find((u: { id: string; email: string }) => u.id === assignee);
    return user ? user.email : assignee;
  });

  // T020 - Filtres rapides par priorité
  quickPriorityFilters = computed(() => 
    this.priorityOptions.map(option => ({
      ...option,
      isActive: this.priorityFilter() === option.value,
      count: 0 // TODO: Calculer le nombre d'items par priorité
    }))
  );

  // T020 - Filtres rapides par statut
  quickStatusFilters = computed(() => 
    this.statusOptions.map(option => ({
      ...option,
      isActive: this.statusFilter() === option.value,
      count: 0 // TODO: Calculer le nombre d'items par statut
    }))
  );

  /**
   * Vérifie s'il y a des filtres avancés actifs (tous sauf recherche, priorité et statut)
   */
  hasAdvancedFilters = computed(() => {
    return !!(this.assigneeFilter() || this.environmentFilter() || this.tagsFilter().length > 0);
  });

  /**
   * Nombre de filtres avancés actifs
   */
  advancedFiltersCount = computed(() => {
    let count = 0;
    if (this.assigneeFilter()) count++;
    if (this.environmentFilter()) count++;
    if (this.tagsFilter().length > 0) count += this.tagsFilter().length;
    return count;
  });

  async ngOnInit() {
    // Configuration du debounce pour la recherche
    this.searchSubject$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(searchTerm => {
      this.updateFilters({ searchText: searchTerm });
    });

    // T020 - Charger les utilisateurs réels
    await this.loadUsers();

    // Écouter les changements du store
    this.subscribeToStore();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async loadUsers() {
    try {
      const users = await this.userService.getUsers();
      this.availableUsers.set(users);
    } catch (error) {
      console.error('Erreur lors du chargement des utilisateurs:', error);
      // Fallback sur des données mockées
      this.availableUsers.set([
        { id: 'user1', email: 'admin@test.com' },
        { id: 'user2', email: 'dev@test.com' }
      ]);
    }
  }

  private subscribeToStore() {
    // Écouter les changements de filtres depuis le store
    this.store.select(selectEpicKanbanFilters).pipe(
      takeUntil(this.destroy$)
    ).subscribe((filters: KanbanSearchFilters | null) => {
      if (filters) {
        this.searchText.set(filters.searchText || '');
        this.priorityFilter.set(filters.priority || '');
        this.assigneeFilter.set(filters.assignee || '');
        this.statusFilter.set(filters.status || '');
        this.environmentFilter.set(filters.environment || '');
        this.tagsFilter.set(filters.tags || []);
      }
    });

    // T020 - Écouter les assignés uniques
    this.store.select(selectUniqueAssignees).pipe(
      takeUntil(this.destroy$)
    ).subscribe((assignees: string[]) => {
      this.uniqueAssignees.set(assignees);
    });

    // T020 - Écouter les environnements uniques
    this.store.select(selectUniqueEnvironments).pipe(
      takeUntil(this.destroy$)
    ).subscribe((environments: string[]) => {
      this.uniqueEnvironments.set(environments);
    });

    // T020 - Écouter les tags uniques
    this.store.select(selectUniqueTags).pipe(
      takeUntil(this.destroy$)
    ).subscribe((tags: string[]) => {
      this.uniqueTags.set(tags);
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

  // T020 - Nouveau filtre environnement
  onEnvironmentChange(value: string) {
    this.environmentFilter.set(value);
    this.updateFilters({ environment: value });
  }

  // T020 - Gestion des tags
  onTagAdd(tag: string) {
    const currentTags = this.tagsFilter();
    if (!currentTags.includes(tag)) {
      const newTags = [...currentTags, tag];
      this.tagsFilter.set(newTags);
      this.updateFilters({ tags: newTags });
    }
  }

  onTagRemove(tag: string) {
    const currentTags = this.tagsFilter();
    const newTags = currentTags.filter(t => t !== tag);
    this.tagsFilter.set(newTags);
    this.updateFilters({ tags: newTags });
  }

  // T020 - Filtres rapides par boutons
  onQuickPriorityFilter(priority: string) {
    const newPriority = this.priorityFilter() === priority ? '' : priority;
    this.onPriorityChange(newPriority);
  }

  onQuickStatusFilter(status: string) {
    const newStatus = this.statusFilter() === status ? '' : status;
    this.onStatusChange(newStatus);
  }

  onQuickEnvironmentFilter(environment: string) {
    const newEnvironment = this.environmentFilter() === environment ? '' : environment;
    this.onEnvironmentChange(newEnvironment);
  }

  // Basculer l'expansion du panel
  toggleExpanded() {
    this.isExpanded.update(expanded => !expanded);
  }

  // Méthode pour mettre à jour les filtres dans le store
  private updateFilters(filterUpdate: Partial<KanbanSearchFilters>) {
    this.store.dispatch(EpicKanbanActions.updateFilters({
      searchText: filterUpdate.searchText ?? this.searchText(),
      priority: filterUpdate.priority ?? this.priorityFilter(),
      assignee: filterUpdate.assignee ?? this.assigneeFilter(),
      status: filterUpdate.status ?? this.statusFilter(),
      environment: filterUpdate.environment ?? this.environmentFilter(),
      tags: filterUpdate.tags ?? this.tagsFilter()
    }));
  }

  // Réinitialiser tous les filtres
  clearFilters() {
    this.searchText.set('');
    this.priorityFilter.set('');
    this.assigneeFilter.set('');
    this.statusFilter.set('');
    this.environmentFilter.set('');
    this.tagsFilter.set([]);
    
    this.store.dispatch(EpicKanbanActions.clearFilters());
  }

  // Méthodes utilitaires pour les icônes
  getStatusIcon(status: string): string {
    return this.statusOptions.find(s => s.value === status)?.icon || 'radio_button_unchecked';
  }

  getPriorityIcon(priority: string): string {
    return this.priorityOptions.find(p => p.value === priority)?.icon || 'low_priority';
  }

  getEnvironmentIcon(environment: string): string {
    return this.environmentOptions.find(e => e.value === environment)?.icon || 'settings';
  }

  // T020 - Méthodes utilitaires pour les couleurs
  getStatusColor(status: string): string {
    return this.statusOptions.find(s => s.value === status)?.color || '#6B7280';
  }

  getPriorityColor(priority: string): string {
    return this.priorityOptions.find(p => p.value === priority)?.color || '#6B7280';
  }

  getEnvironmentColor(environment: string): string {
    return this.environmentOptions.find(e => e.value === environment)?.color || '#6B7280';
  }

  /**
   * Efface tous les filtres
   */
  clearAllFilters(): void {
    this.store.dispatch(EpicKanbanActions.clearFilters());
  }
} 