import {
  Component,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatListModule } from '@angular/material/list';

import { FormulaEngineService, FormulaFunction } from '../../../services/formula-engine.service';

/**
 * Result returned when a formula is selected
 */
export interface FormulaDialogResult {
  formula: string;
  function: FormulaFunction;
}

/**
 * FormulaDialogComponent
 *
 * Dialog modal style Excel pour parcourir et insérer des formules.
 * Permet de rechercher, filtrer par catégorie et voir les détails de chaque fonction.
 */
@Component({
  selector: 'app-formula-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatListModule,
  ],
  templateUrl: './formula-dialog.component.html',
  styleUrl: './formula-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormulaDialogComponent {
  private dialogRef = inject(MatDialogRef<FormulaDialogComponent>);
  private formulaEngine = inject(FormulaEngineService);

  // Search and filter state
  readonly searchQuery = signal('');
  readonly selectedCategory = signal<string>('all');
  readonly selectedFunction = signal<FormulaFunction | null>(null);

  // Categories list
  readonly categories = computed(() => {
    const cats = Object.keys(this.formulaEngine.functionCategories);
    return ['all', ...cats];
  });

  // Category labels for display
  readonly categoryLabels: Record<string, string> = {
    'all': 'Toutes les fonctions',
    'Math': 'Mathématiques',
    'Logic': 'Logique',
    'Lookup': 'Recherche et référence',
    'Text': 'Texte',
    'Date': 'Date et heure',
    'Statistical': 'Statistiques',
  };

  // Filtered functions based on search and category
  readonly filteredFunctions = computed(() => {
    const query = this.searchQuery().toLowerCase();
    const category = this.selectedCategory();

    let functions: FormulaFunction[];

    if (category === 'all') {
      functions = this.formulaEngine.allFunctions;
    } else {
      functions = this.formulaEngine.functionCategories[category] || [];
    }

    if (query) {
      functions = functions.filter(fn =>
        fn.name.toLowerCase().includes(query) ||
        fn.description.toLowerCase().includes(query)
      );
    }

    return functions;
  });

  /**
   * Get label for a category
   */
  getCategoryLabel(category: string): string {
    return this.categoryLabels[category] || category;
  }

  /**
   * Select a function from the list
   */
  selectFunction(fn: FormulaFunction): void {
    this.selectedFunction.set(fn);
  }

  /**
   * Handle double-click to insert immediately
   */
  onFunctionDoubleClick(fn: FormulaFunction): void {
    this.insertFunction(fn);
  }

  /**
   * Insert the selected function
   */
  insertSelected(): void {
    const fn = this.selectedFunction();
    if (fn) {
      this.insertFunction(fn);
    }
  }

  /**
   * Insert a function and close the dialog
   */
  private insertFunction(fn: FormulaFunction): void {
    // Build the formula string with opening parenthesis
    const formula = `=${fn.name}(`;

    this.dialogRef.close({
      formula,
      function: fn,
    } as FormulaDialogResult);
  }

  /**
   * Close dialog without selection
   */
  cancel(): void {
    this.dialogRef.close(null);
  }

  /**
   * Handle search input
   */
  onSearchChange(value: string): void {
    this.searchQuery.set(value);
    // Reset selection when search changes
    this.selectedFunction.set(null);
  }

  /**
   * Handle category change
   */
  onCategoryChange(category: string): void {
    this.selectedCategory.set(category);
    // Reset selection when category changes
    this.selectedFunction.set(null);
  }
}
