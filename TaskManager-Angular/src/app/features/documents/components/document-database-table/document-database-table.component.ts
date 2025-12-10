import { Component, Input, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { Subject, takeUntil, debounceTime } from 'rxjs';
import {
  DatabaseConfig,
  DatabaseRow,
  DatabaseNodeAttributes,
  CellValue,
  DEFAULT_DATABASE_CONFIG,
  DatabaseColumn,
  ViewType,
} from '../../models/database.model';
import { DatabaseService } from '../../services/database.service';

/**
 * DocumentDatabaseTableComponent
 *
 * Main orchestration component for database tables embedded in documents.
 * Handles:
 * - Database initialization and metadata management
 * - Row and column CRUD operations
 * - View switching (table, kanban, calendar, timeline)
 * - Bidirectional sync with TipTap node
 */
@Component({
  selector: 'app-document-database-table',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './document-database-table.component.html',
  styleUrl: './document-database-table.component.scss',
})
export class DocumentDatabaseTableComponent implements OnInit, OnDestroy {
  private databaseService = inject(DatabaseService);
  private dialog = inject(MatDialog);

  // Inputs
  @Input() databaseId!: string;
  @Input() documentId!: string;
  @Input() config!: DatabaseConfig;
  @Input() storageMode: 'supabase' = 'supabase';
  @Input() onDataChange?: (attrs: DatabaseNodeAttributes) => void;

  // State signals
  isLoading = signal(false);
  isInitializing = signal(true);
  error = signal<string | null>(null);

  // Database state
  databaseConfig = signal<DatabaseConfig>(DEFAULT_DATABASE_CONFIG);
  rows = signal<DatabaseRow[]>([]);
  currentView = signal<ViewType>('table');
  isCreatingDatabase = signal(false);

  // Computed
  columnCount = computed(() => this.databaseConfig().columns.length);
  rowCount = computed(() => this.rows().length);

  private destroy$ = new Subject<void>();
  private changeSubject = new Subject<void>();

  ngOnInit() {
    // Set initial config from input
    if (this.config) {
      this.databaseConfig.set(this.config);
      this.currentView.set(this.config.defaultView || 'table');
    }

    // Initialize database (create if needed or load existing data)
    this.initializeDatabase();

    // Setup debounced save
    this.changeSubject
      .pipe(debounceTime(1000), takeUntil(this.destroy$))
      .subscribe(() => {
        this.syncToTipTap();
      });
  }

  /**
   * Initialize database: create physical table if first time, or load data
   */
  initializeDatabase() {
    this.isInitializing.set(true);
    this.error.set(null);

    // Check if database already exists in Supabase
    this.databaseService.getDatabaseMetadata(this.databaseId).subscribe({
      next: (metadata) => {
        // Database exists, load rows
        this.loadRows();
        this.isInitializing.set(false);
      },
      error: (err) => {
        // Database doesn't exist yet, create it
        if (err.code === 'PGRST116') {
          // Not found error
          this.createDatabase();
        } else {
          this.error.set('Erreur lors du chargement de la base de données');
          this.isInitializing.set(false);
          console.error('Error loading database metadata:', err);
        }
      },
    });
  }

  /**
   * Create physical database table in Supabase
   */
  private createDatabase() {
    this.isCreatingDatabase.set(true);

    this.databaseService
      .createDatabase({
        documentId: this.documentId,
        config: this.databaseConfig(),
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          console.log('Database created:', response);
          this.isCreatingDatabase.set(false);
          this.isInitializing.set(false);
          // Load initial empty rows
          this.loadRows();
        },
        error: (err) => {
          console.error('Failed to create database:', err);
          this.error.set('Impossible de créer la base de données');
          this.isCreatingDatabase.set(false);
          this.isInitializing.set(false);
        },
      });
  }

  /**
   * Load rows from Supabase
   */
  private loadRows() {
    this.isLoading.set(true);

    this.databaseService
      .getRows({
        databaseId: this.databaseId,
        limit: 100,
        offset: 0,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (rows) => {
          this.rows.set(rows);
          this.isLoading.set(false);
        },
        error: (err) => {
          console.error('Failed to load rows:', err);
          this.error.set('Erreur lors du chargement des données');
          this.isLoading.set(false);
        },
      });
  }

  /**
   * Add a new row
   */
  onAddRow() {
    const newRowOrder = this.rows().length;
    const emptyCells: Record<string, CellValue> = {};

    // Initialize empty cells for all columns
    this.databaseConfig().columns.forEach((col) => {
      emptyCells[col.id] = this.getDefaultValueForColumn(col);
    });

    this.databaseService
      .addRow({
        databaseId: this.databaseId,
        cells: emptyCells,
        row_order: newRowOrder,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (newRow) => {
          this.rows.update((rows) => [...rows, newRow]);
        },
        error: (err) => {
          console.error('Failed to add row:', err);
          alert('Impossible d\'ajouter une ligne');
        },
      });
  }

  /**
   * Update a cell value
   */
  onUpdateCell(rowId: string, columnId: string, value: CellValue) {
    // Optimistic update
    this.rows.update((rows) =>
      rows.map((row) => {
        if (row.id === rowId) {
          return {
            ...row,
            cells: { ...row.cells, [columnId]: value },
          };
        }
        return row;
      })
    );

    // Persist to database
    this.databaseService
      .updateCell({
        databaseId: this.databaseId,
        rowId,
        columnId,
        value,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        error: (err) => {
          console.error('Failed to update cell:', err);
          // Reload rows to revert optimistic update
          this.loadRows();
        },
      });
  }

  /**
   * Delete rows
   */
  onDeleteRows(rowIds: string[]) {
    const confirmDelete = confirm(
      `Supprimer ${rowIds.length} ligne(s) ? Cette action est irréversible.`
    );
    if (!confirmDelete) return;

    this.databaseService
      .deleteRows({
        databaseId: this.databaseId,
        rowIds,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.rows.update((rows) => rows.filter((row) => !rowIds.includes(row.id)));
        },
        error: (err) => {
          console.error('Failed to delete rows:', err);
          alert('Impossible de supprimer les lignes');
        },
      });
  }

  /**
   * Add a new column
   */
  onAddColumn() {
    // TODO: Open column editor dialog
    console.log('Add column - TODO: implement dialog');
  }

  /**
   * Edit column configuration
   */
  onEditColumn(columnId: string) {
    // TODO: Open column editor dialog
    console.log('Edit column:', columnId);
  }

  /**
   * Delete a column
   */
  onDeleteColumn(columnId: string) {
    const column = this.databaseConfig().columns.find((col) => col.id === columnId);
    if (!column) return;

    const confirmDelete = confirm(
      `Supprimer la colonne "${column.name}" ? Toutes les données de cette colonne seront perdues.`
    );
    if (!confirmDelete) return;

    this.databaseService
      .deleteColumn({
        databaseId: this.databaseId,
        columnId,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          // Update config
          this.databaseConfig.update((config) => ({
            ...config,
            columns: config.columns.filter((col) => col.id !== columnId),
          }));

          // Remove column data from rows
          this.rows.update((rows) =>
            rows.map((row) => {
              const { [columnId]: _, ...remainingCells } = row.cells;
              return { ...row, cells: remainingCells };
            })
          );

          this.changeSubject.next();
        },
        error: (err) => {
          console.error('Failed to delete column:', err);
          alert('Impossible de supprimer la colonne');
        },
      });
  }

  /**
   * Switch view type
   */
  onSwitchView(viewType: ViewType) {
    this.currentView.set(viewType);
  }

  /**
   * Sync database config to TipTap node
   */
  private syncToTipTap() {
    if (!this.onDataChange) return;

    const attrs: DatabaseNodeAttributes = {
      databaseId: this.databaseId,
      config: this.databaseConfig(),
      storageMode: 'supabase',
    };

    this.onDataChange(attrs);
  }

  /**
   * Get default value for a column based on its type
   */
  private getDefaultValueForColumn(column: DatabaseColumn): CellValue {
    switch (column.type) {
      case 'text':
      case 'url':
      case 'email':
      case 'select':
        return '';
      case 'number':
        return 0;
      case 'date':
        return null;
      case 'checkbox':
        return false;
      case 'multi-select':
        return [];
      default:
        return null;
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
