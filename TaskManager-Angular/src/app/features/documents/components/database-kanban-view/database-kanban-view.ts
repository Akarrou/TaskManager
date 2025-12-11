import { Component, Input, Output, EventEmitter, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CdkDragDrop, DragDropModule, transferArrayItem } from '@angular/cdk/drag-drop';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import {
  DatabaseRow,
  DatabaseColumn,
  CellValue,
  SelectChoice,
  hasSelectChoices,
} from '../../models/database.model';

/**
 * Kanban column definition
 */
interface KanbanColumn {
  id: string;
  title: string;
  color: string;
  rows: DatabaseRow[];
}

/**
 * DatabaseKanbanViewComponent
 *
 * Kanban board view for database rows, grouped by a select column.
 * Features drag & drop between columns to update row values.
 */
@Component({
  selector: 'app-database-kanban-view',
  standalone: true,
  imports: [
    CommonModule,
    DragDropModule,
    MatIconModule,
    MatCardModule,
    MatButtonModule,
  ],
  templateUrl: './database-kanban-view.html',
  styleUrl: './database-kanban-view.scss',
})
export class DatabaseKanbanView {
  @Input() rows: DatabaseRow[] = [];
  @Input() columns: DatabaseColumn[] = [];
  @Input() groupByColumnId?: string;

  @Output() cellUpdate = new EventEmitter<{
    rowId: string;
    columnId: string;
    value: CellValue;
  }>();
  @Output() addSelectColumn = new EventEmitter<void>();
  @Output() configureGroupBy = new EventEmitter<void>();

  // Computed: Find the groupBy column
  groupByColumn = computed(() => {
    const columnId = this.groupByColumnId;
    if (!columnId) return null;
    return this.columns.find((col) => col.id === columnId) || null;
  });

  // Computed: Generate kanban columns from select choices
  kanbanColumns = computed((): KanbanColumn[] => {
    const groupColumn = this.groupByColumn();
    if (!groupColumn || !hasSelectChoices(groupColumn)) {
      return [];
    }

    const choices = groupColumn.options.choices;
    const columnId = groupColumn.id;

    // Create columns for each choice
    const columns: KanbanColumn[] = choices.map((choice) => ({
      id: choice.id,
      title: choice.label,
      color: choice.color,
      rows: this.rows.filter((row) => row.cells[columnId] === choice.id),
    }));

    // Add "No value" column for rows without a value
    columns.push({
      id: 'no-value',
      title: 'Sans valeur',
      color: 'bg-gray-200',
      rows: this.rows.filter((row) => !row.cells[columnId]),
    });

    return columns;
  });

  // Computed: Check if we have select columns
  hasSelectColumn = computed(() => {
    return this.columns.some((col) => col.type === 'select' || col.type === 'multi-select');
  });

  // Computed: Get visible columns for card display
  visibleColumns = computed(() => {
    return this.columns.filter((col) => col.visible !== false && col.id !== this.groupByColumnId);
  });

  /**
   * Handle drop of a card into a new column
   */
  onDrop(event: CdkDragDrop<DatabaseRow[]>, targetColumnId: string): void {
    const row = event.previousContainer.data[event.previousIndex];
    const groupColumnId = this.groupByColumnId;

    if (!groupColumnId) return;

    // Emit cell update
    this.cellUpdate.emit({
      rowId: row.id,
      columnId: groupColumnId,
      value: targetColumnId === 'no-value' ? null : targetColumnId,
    });

    // Optimistic update - move the card visually
    if (event.previousContainer !== event.container) {
      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex
      );
    }
  }

  /**
   * Get color for a choice badge
   */
  getChoiceColor(color: string): string {
    // Map Tailwind color classes to actual colors
    const colorMap: Record<string, string> = {
      'bg-gray-200': '#e5e7eb',
      'bg-red-200': '#fecaca',
      'bg-orange-200': '#fed7aa',
      'bg-yellow-200': '#fef08a',
      'bg-green-200': '#bbf7d0',
      'bg-blue-200': '#bfdbfe',
      'bg-indigo-200': '#c7d2fe',
      'bg-purple-200': '#e9d5ff',
      'bg-pink-200': '#fbcfe8',
    };

    return colorMap[color] || color;
  }

  /**
   * Get the display value for a cell
   */
  getCellDisplayValue(row: DatabaseRow, column: DatabaseColumn): string {
    const value = row.cells[column.id];

    if (value === null || value === undefined) {
      return '-';
    }

    // Handle select columns - show label instead of ID
    if ((column.type === 'select') && hasSelectChoices(column)) {
      const choice = column.options.choices.find((c) => c.id === value);
      return choice ? choice.label : String(value);
    }

    // Handle multi-select - show labels
    if (column.type === 'multi-select' && hasSelectChoices(column) && Array.isArray(value)) {
      const labels = value
        .map((id) => column.options.choices.find((c) => c.id === id)?.label)
        .filter(Boolean);
      return labels.join(', ') || '-';
    }

    // Handle checkbox
    if (column.type === 'checkbox') {
      return value ? '✓' : '✗';
    }

    // Handle date
    if (column.type === 'date' && typeof value === 'string') {
      const date = new Date(value);
      return date.toLocaleDateString('fr-FR');
    }

    return String(value);
  }

  /**
   * Determine if a field should be shown on the card
   * Show first 3 visible columns (excluding groupBy column)
   */
  shouldShowField(columnId: string): boolean {
    const visibleCols = this.visibleColumns();
    const index = visibleCols.findIndex((col) => col.id === columnId);
    return index >= 0 && index < 3;
  }

  /**
   * Handle click on "Add select column" button
   */
  onAddSelectColumn(): void {
    this.addSelectColumn.emit();
  }

  /**
   * Handle click on "Configure groupBy" button
   */
  onConfigureGroupBy(): void {
    this.configureGroupBy.emit();
  }
}
