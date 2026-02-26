import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import {
  DatabaseColumn,
  ColumnType,
  Filter,
  FilterOperator,
} from '../../models/database.model';

/**
 * Composant de filtres pour les tables de base de données
 * Fournit une interface utilisateur pour créer, gérer et afficher les filtres actifs
 */
@Component({
  selector: 'app-database-filters',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatInputModule,
    MatFormFieldModule,
    MatChipsModule,
    MatExpansionModule,
  ],
  templateUrl: './database-filters.component.html',
  styleUrl: './database-filters.component.scss',
})
export class DatabaseFiltersComponent {
  /**
   * Liste des colonnes disponibles pour le filtrage
   */
  @Input() columns: DatabaseColumn[] = [];

  /**
   * Liste des filtres actuellement actifs
   */
  @Input() activeFilters: Filter[] = [];

  /**
   * Événement émis quand les filtres changent
   */
  @Output() filterChange = new EventEmitter<Filter[]>();

  /**
   * Événement émis quand l'utilisateur demande d'effacer tous les filtres
   */
  @Output() clearAll = new EventEmitter<void>();

  /**
   * Signal contenant le filtre en cours d'édition
   */
  editingFilter = signal<Partial<Filter>>({});

  /**
   * Colonne sélectionnée pour le filtre en cours d'édition
   */
  selectedColumn = computed(() => {
    const columnId = this.editingFilter().columnId;
    return this.columns.find((col) => col.id === columnId);
  });

  /**
   * Opérateurs disponibles basés sur le type de colonne sélectionnée
   */
  availableOperators = computed(() => {
    const columnType = this.selectedColumn()?.type;
    return this.getOperatorsForType(columnType);
  });

  /**
   * Ajouter le filtre en cours d'édition à la liste des filtres actifs
   */
  onAddFilter(): void {
    const filter = this.editingFilter();

    // Validation : tous les champs requis doivent être remplis
    if (!filter.columnId || !filter.operator) {
      return;
    }

    // Pour les opérateurs is_empty et is_not_empty, pas besoin de valeur
    const needsValue = !['is_empty', 'is_not_empty'].includes(
      filter.operator
    );
    if (needsValue && !filter.value) {
      return;
    }

    // Créer le nouveau filtre
    const newFilter: Filter = {
      columnId: filter.columnId,
      operator: filter.operator as FilterOperator,
      value: needsValue ? filter.value : null,
    };

    // Émettre la nouvelle liste de filtres
    const newFilters = [...this.activeFilters, newFilter];
    this.filterChange.emit(newFilters);

    // Réinitialiser le filtre en cours d'édition
    this.editingFilter.set({});
  }

  /**
   * Supprimer un filtre de la liste des filtres actifs
   */
  onRemoveFilter(index: number): void {
    const newFilters = this.activeFilters.filter((_, i) => i !== index);
    this.filterChange.emit(newFilters);
  }

  /**
   * Appliquer un filtre rapide basé sur le type de colonne
   */
  onQuickFilter(type: ColumnType): void {
    // Trouver la première colonne de ce type
    const column = this.columns.find((col) => col.type === type);
    if (!column) {
      return;
    }

    // Pré-remplir le filtre en cours d'édition
    this.editingFilter.set({
      columnId: column.id,
      operator: this.getDefaultOperatorForType(type),
      value: undefined,
    });
  }

  /**
   * Obtenir la liste des opérateurs valides pour un type de colonne donné
   */
  private getOperatorsForType(type?: ColumnType): FilterOperator[] {
    const operatorsByType: Record<ColumnType, FilterOperator[]> = {
      text: [
        'contains',
        'not_contains',
        'equals',
        'not_equals',
        'starts_with',
        'ends_with',
        'is_empty',
        'is_not_empty',
      ],
      number: [
        'equals',
        'not_equals',
        'greater_than',
        'less_than',
        'greater_than_or_equal',
        'less_than_or_equal',
        'is_empty',
        'is_not_empty',
      ],
      date: [
        'equals',
        'not_equals',
        'greater_than',
        'less_than',
        'is_empty',
        'is_not_empty',
      ],
      'date-range': [
        'is_empty',
        'is_not_empty',
      ],
      checkbox: ['equals'],
      select: ['equals', 'not_equals', 'is_empty', 'is_not_empty'],
      'multi-select': [
        'contains',
        'not_contains',
        'is_empty',
        'is_not_empty',
      ],
      url: [
        'contains',
        'not_contains',
        'equals',
        'not_equals',
        'is_empty',
        'is_not_empty',
      ],
      email: [
        'contains',
        'not_contains',
        'equals',
        'not_equals',
        'is_empty',
        'is_not_empty',
      ],
      datetime: [
        'equals',
        'not_equals',
        'greater_than',
        'less_than',
        'is_empty',
        'is_not_empty',
      ],
      'linked-items': [
        'is_empty',
        'is_not_empty',
      ],
      json: [
        'is_empty',
        'is_not_empty',
      ],
    };

    return type ? operatorsByType[type] : [];
  }

  /**
   * Obtenir l'opérateur par défaut pour un type de colonne
   */
  private getDefaultOperatorForType(type: ColumnType): FilterOperator {
    const defaultOperators: Record<ColumnType, FilterOperator> = {
      text: 'contains',
      number: 'equals',
      date: 'equals',
      'date-range': 'is_not_empty',
      datetime: 'equals',
      checkbox: 'equals',
      select: 'equals',
      'multi-select': 'contains',
      url: 'contains',
      email: 'contains',
      'linked-items': 'is_not_empty',
      json: 'is_not_empty',
    };

    return defaultOperators[type];
  }

  /**
   * Obtenir le libellé traduit d'un opérateur
   */
  getOperatorLabel(operator: FilterOperator): string {
    const labels: Record<FilterOperator, string> = {
      equals: 'Est égal à',
      not_equals: "N'est pas égal à",
      contains: 'Contient',
      not_contains: 'Ne contient pas',
      starts_with: 'Commence par',
      ends_with: 'Se termine par',
      greater_than: 'Supérieur à',
      less_than: 'Inférieur à',
      greater_than_or_equal: 'Supérieur ou égal à',
      less_than_or_equal: 'Inférieur ou égal à',
      is_empty: 'Est vide',
      is_not_empty: "N'est pas vide",
    };

    return labels[operator] || operator;
  }

  /**
   * Obtenir le libellé complet d'un filtre pour affichage
   */
  getFilterLabel(filter: Filter): string {
    const column = this.columns.find((col) => col.id === filter.columnId);
    const columnName = column?.name || filter.columnId;
    const operatorLabel = this.getOperatorLabel(filter.operator);

    // Pour les opérateurs sans valeur
    if (filter.operator === 'is_empty' || filter.operator === 'is_not_empty') {
      return `${columnName} ${operatorLabel}`;
    }

    // Pour les opérateurs avec valeur
    let valueLabel: string;

    if (column?.type === 'select' && column.options?.choices) {
      // Pour les colonnes select, afficher le label du choix
      const choice = column.options.choices.find(
        (c) => c.id === filter.value
      );
      valueLabel = choice?.label || String(filter.value);
    } else if (column?.type === 'checkbox') {
      // Pour les cases à cocher
      valueLabel = filter.value ? 'Vrai' : 'Faux';
    } else {
      // Pour les autres types
      valueLabel = String(filter.value);
    }

    return `${columnName} ${operatorLabel} "${valueLabel}"`;
  }

  /**
   * Mettre à jour le columnId du filtre en cours d'édition
   */
  onColumnChange(columnId: string): void {
    this.editingFilter.update((filter) => ({
      ...filter,
      columnId,
      operator: undefined,
      value: undefined,
    }));
  }

  /**
   * Mettre à jour l'opérateur du filtre en cours d'édition
   */
  onOperatorChange(operator: string): void {
    this.editingFilter.update((filter) => ({
      ...filter,
      operator: operator as FilterOperator,
      value: undefined,
    }));
  }

  /**
   * Mettre à jour la valeur du filtre en cours d'édition
   */
  onValueChange(value: string | number | boolean): void {
    this.editingFilter.update((filter) => ({
      ...filter,
      value,
    }));
  }
}
