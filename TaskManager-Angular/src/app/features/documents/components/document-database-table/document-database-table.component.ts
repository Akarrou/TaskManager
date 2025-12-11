import { Component, Input, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { Subject, takeUntil, debounceTime, delay, of, retry, timer, switchMap, catchError, tap, take } from 'rxjs';
import {
  DatabaseConfig,
  DatabaseRow,
  DatabaseNodeAttributes,
  CellValue,
  DEFAULT_DATABASE_CONFIG,
  DatabaseColumn,
  ViewType,
  SelectChoice,
  Filter,
  SortOrder,
  QueryRowsParams,
  DatabaseView,
} from '../../models/database.model';
import { DatabaseService } from '../../services/database.service';
import {
  ColumnEditorDialogComponent,
  ColumnEditorDialogData,
  ColumnEditorDialogResult,
} from '../column-editor-dialog/column-editor-dialog.component';
import { DatabaseFiltersComponent } from '../database-filters/database-filters.component';
import { DatabaseKanbanView } from '../database-kanban-view/database-kanban-view';
import { DatabaseCalendarView } from '../database-calendar-view/database-calendar-view';
import { DatabaseTimelineView } from '../database-timeline-view/database-timeline-view';

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
    MatMenuModule,
    MatCheckboxModule,
    DatabaseFiltersComponent,
    DatabaseKanbanView,
    DatabaseCalendarView,
    DatabaseTimelineView,
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

  // Filtering and sorting state
  activeFilters = signal<Filter[]>([]);
  activeSort = signal<{ columnId: string; order: SortOrder } | null>(null);

  // Kanban view state
  kanbanGroupByColumnId = signal<string | undefined>(undefined);

  // Calendar view state
  calendarDateColumnId = signal<string | undefined>(undefined);

  // Timeline view state
  timelineStartDateColumnId = signal<string | undefined>(undefined);
  timelineEndDateColumnId = signal<string | undefined>(undefined);

  // Computed
  columnCount = computed(() => this.databaseConfig().columns.length);
  rowCount = computed(() => this.rows().length);
  filteredRowCount = computed(() => this.rows().length);

  // Row selection state
  selectedRowIds = signal<Set<string>>(new Set());
  isAllSelected = computed(() => {
    const rows = this.rows();
    const selected = this.selectedRowIds();
    return rows.length > 0 && selected.size === rows.length;
  });
  isSomeSelected = computed(() => {
    const selected = this.selectedRowIds();
    return selected.size > 0 && !this.isAllSelected();
  });
  selectedCount = computed(() => this.selectedRowIds().size);

  // Database name editing
  isEditingName = signal(false);
  tempDatabaseName = signal('');

  private destroy$ = new Subject<void>();
  private changeSubject = new Subject<void>();

  ngOnInit() {
    // Set initial view from input config (but don't trust column config - will be loaded from Supabase)
    if (this.config) {
      this.currentView.set(this.config.defaultView || 'table');
    }

    // Initialize database (load metadata and config from Supabase)
    this.initializeDatabase();

    // Setup debounced save
    this.changeSubject
      .pipe(debounceTime(1000), takeUntil(this.destroy$))
      .subscribe(() => {
        this.syncToTipTap();
      });
  }

  /**
   * Initialize database: load existing data or show error if database doesn't exist
   */
  initializeDatabase() {
    this.isInitializing.set(true);
    this.error.set(null);

    // If databaseId is empty, show error - database should be created BEFORE inserting block
    if (!this.databaseId || this.databaseId === '') {
      console.error('❌ Empty databaseId - database should be created before block insertion');
      this.error.set('Erreur: Base de données non initialisée');
      this.isInitializing.set(false);
      return;
    }

    // Load existing database metadata (source of truth for config)
    console.log('📥 Loading database with ID:', this.databaseId);
    this.databaseService.getDatabaseMetadata(this.databaseId).subscribe({
      next: (metadata) => {
        console.log('✅ Database metadata loaded:', metadata);

        // Load config from Supabase (source of truth)
        this.databaseConfig.set(metadata.config);

        // Load filters and sort from current view (now that config is loaded)
        this.loadViewConfig();

        // Sync config to TipTap node (update document with latest config)
        this.syncToTipTap();

        // Database exists, check if it's newly created (within last 2 seconds)
        const createdAt = new Date(metadata.created_at);
        const now = new Date();
        const ageInSeconds = (now.getTime() - createdAt.getTime()) / 1000;
        const isNewlyCreated = ageInSeconds < 2;

        if (isNewlyCreated) {
          console.log('✅ Newly created database detected, starting schema availability polling...');

          // Poll until table is available in PostgREST schema cache
          this.waitForSchemaAvailability();
        } else {
          console.log('✅ Existing database found, loading rows immediately...');
          this.loadRows();
          this.isInitializing.set(false);
        }
      },
      error: (err) => {
        // Database doesn't exist - this is an error (should have been created first)
        if (err.code === 'PGRST116') {
          console.error('❌ Database not found in Supabase:', this.databaseId);
          this.error.set('Base de données introuvable');
        } else {
          console.error('❌ Error loading database metadata:', err);
          this.error.set('Erreur lors du chargement de la base de données');
        }
        this.isInitializing.set(false);
      },
    });
  }


  /**
   * Load rows from Supabase with filters and sorting
   */
  private loadRows() {
    this.loadRowsWithFilters();
  }

  /**
   * Load rows with current filters and sort
   */
  loadRowsWithFilters() {
    this.isLoading.set(true);

    const params: QueryRowsParams = {
      databaseId: this.databaseId,
      filters: this.activeFilters(),
      limit: 100,
      offset: 0,
    };

    const sort = this.activeSort();
    if (sort) {
      params.sortBy = sort.columnId;
      params.sortOrder = sort.order;
    }

    this.databaseService
      .getRows(params)
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
   * Wait for PostgREST schema to be available using intelligent polling
   * Polls the table until it becomes available (max 15 attempts = 30 seconds)
   */
  private waitForSchemaAvailability() {
    this.isLoading.set(true);

    const maxAttempts = 15;
    let attemptCount = 0;
    let tableReady = false;

    // Poll every 2 seconds, max 15 times
    timer(0, 2000)
      .pipe(
        take(maxAttempts),
        switchMap(() => {
          attemptCount++;
          console.log(`🔍 Polling attempt ${attemptCount}/${maxAttempts} - checking table availability...`);

          return this.databaseService.getRows({
            databaseId: this.databaseId,
            limit: 1, // Just check if table exists
            offset: 0,
          }).pipe(
            tap((rows) => {
              console.log(`✅ Table is available! Found ${rows.length} row(s)`);
              tableReady = true;
            }),
            catchError((err) => {
              // Schema cache errors - table not ready yet
              const isSchemaError = err.code === 'PGRST116' || err.code === 'PGRST204' || err.code === 'PGRST205' || err.code === '42P01';

              if (isSchemaError && attemptCount < maxAttempts) {
                console.log(`⏳ Table not yet available (${err.code}), will retry in 2s...`);
                return of(null); // Return null to continue polling
              } else if (attemptCount >= maxAttempts) {
                console.error(`❌ Max polling attempts reached (${maxAttempts})`);
                throw new Error('TIMEOUT');
              } else {
                // Other error - stop polling
                console.error('❌ Unexpected error:', err);
                throw err;
              }
            })
          );
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (rows) => {
          // If we got actual rows (not null from catchError), table is ready
          if (rows !== null && !tableReady) {
            tableReady = true;
            console.log('✅ Schema available, loading all rows...');
            this.loadRows();
            this.isInitializing.set(false);
          }
        },
        error: (err) => {
          if (err.message === 'TIMEOUT') {
            this.error.set('La table n\'est pas encore disponible après 30 secondes. Veuillez rafraîchir la page.');
          } else {
            this.error.set('Erreur lors du chargement des données');
          }
          this.isLoading.set(false);
          this.isInitializing.set(false);
        },
        complete: () => {
          // If polling completed and table is ready, load rows
          if (tableReady) {
            console.log('✅ Polling complete - table ready');
            this.loadRows();
            this.isInitializing.set(false);
          } else if (this.isLoading()) {
            // If polling completed without success, show timeout error
            this.error.set('La table n\'est pas encore disponible. Veuillez rafraîchir la page dans quelques secondes.');
            this.isLoading.set(false);
            this.isInitializing.set(false);
          }
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
    const existingColumnIds = this.databaseConfig().columns.map((col) => col.id);

    const dialogData: ColumnEditorDialogData = {
      existingColumnIds,
      mode: 'add',
    };

    const dialogRef = this.dialog.open(ColumnEditorDialogComponent, {
      width: '600px',
      data: dialogData,
      disableClose: true,
    });

    dialogRef.afterClosed().subscribe((result: ColumnEditorDialogResult | undefined) => {
      if (!result) return;

      const newColumn = result.column;

      // Add column to database
      this.databaseService
        .addColumn({
          databaseId: this.databaseId,
          column: newColumn,
        })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            // Update config
            this.databaseConfig.update((config) => ({
              ...config,
              columns: [...config.columns, newColumn],
            }));

            this.changeSubject.next();
          },
          error: (err) => {
            console.error('Failed to add column:', err);
            alert('Impossible d\'ajouter la colonne');
          },
        });
    });
  }

  /**
   * Edit column configuration
   */
  onEditColumn(columnId: string) {
    const column = this.databaseConfig().columns.find((col) => col.id === columnId);
    if (!column) return;

    const existingColumnIds = this.databaseConfig()
      .columns.filter((col) => col.id !== columnId)
      .map((col) => col.id);

    const dialogData: ColumnEditorDialogData = {
      column,
      existingColumnIds,
      mode: 'edit',
    };

    const dialogRef = this.dialog.open(ColumnEditorDialogComponent, {
      width: '600px',
      data: dialogData,
      disableClose: true,
    });

    dialogRef.afterClosed().subscribe((result: ColumnEditorDialogResult | undefined) => {
      if (!result) return;

      const updatedColumn = result.column;

      // Update column configuration (metadata only)
      this.databaseService
        .updateColumn({
          databaseId: this.databaseId,
          columnId,
          updates: updatedColumn,
        })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            // Update config
            this.databaseConfig.update((config) => ({
              ...config,
              columns: config.columns.map((col) =>
                col.id === columnId ? updatedColumn : col
              ),
            }));

            this.changeSubject.next();
          },
          error: (err) => {
            console.error('Failed to update column:', err);
            alert('Impossible de modifier la colonne');
          },
        });
    });
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

  /**
   * Get HTML input type based on column type
   */
  getCellInputType(columnType: string): string {
    switch (columnType) {
      case 'number':
        return 'number';
      case 'date':
        return 'date';
      case 'email':
        return 'email';
      case 'url':
        return 'url';
      case 'text':
      default:
        return 'text';
    }
  }

  /**
   * Handle cell click (for future inline editing enhancements)
   */
  onCellClick(rowId: string, columnId: string, event: Event): void {
    // Placeholder for future click handling
    // Could be used for more complex editing UI
  }

  /**
   * Update multi-select cell value
   */
  onUpdateMultiSelectCell(rowId: string, columnId: string, selectElement: HTMLSelectElement): void {
    const selectedOptions = Array.from(selectElement.selectedOptions);
    const selectedValues = selectedOptions.map(option => option.value);

    this.onUpdateCell(rowId, columnId, selectedValues);
  }

  /**
   * Get selected choice object for single select
   */
  getSelectedChoice(cellValue: CellValue, column: DatabaseColumn): SelectChoice | null {
    if (!cellValue || typeof cellValue !== 'string') return null;
    if (!column.options?.choices) return null;

    const selectedId = cellValue as string;
    return column.options.choices.find(choice => choice.id === selectedId) || null;
  }

  /**
   * Get selected choice objects from cell value (for multi-select)
   */
  getSelectedChoices(cellValue: CellValue, column: DatabaseColumn): SelectChoice[] {
    if (!cellValue || !Array.isArray(cellValue)) return [];
    if (!column.options?.choices) return [];

    const selectedIds = cellValue as string[];
    return column.options.choices.filter(choice => selectedIds.includes(choice.id));
  }

  /**
   * Get available (unselected) choices
   */
  getAvailableChoices(cellValue: CellValue, column: DatabaseColumn): SelectChoice[] {
    if (!column.options?.choices) return [];

    const selectedIds = Array.isArray(cellValue) ? (cellValue as string[]) : [];
    return column.options.choices.filter(choice => !selectedIds.includes(choice.id));
  }

  /**
   * Convert Tailwind color class to CSS color
   */
  getChoiceColor(colorClass: string): string {
    const colorMap: Record<string, string> = {
      'bg-gray-200': '#e5e7eb',
      'bg-red-200': '#fecaca',
      'bg-orange-200': '#fed7aa',
      'bg-yellow-200': '#fef08a',
      'bg-green-200': '#bbf7d0',
      'bg-teal-200': '#99f6e4',
      'bg-blue-200': '#bfdbfe',
      'bg-indigo-200': '#c7d2fe',
      'bg-purple-200': '#e9d5ff',
      'bg-pink-200': '#fbcfe8',
    };

    return colorMap[colorClass] || '#e5e7eb';
  }

  /**
   * Add a choice to multi-select cell
   */
  addChoiceToCell(rowId: string, columnId: string, choiceId: string): void {
    if (!choiceId) return;

    const row = this.rows().find(r => r.id === rowId);
    if (!row) return;

    const currentValue = row.cells[columnId];
    const selectedIds = Array.isArray(currentValue) ? (currentValue as string[]) : [];

    if (!selectedIds.includes(choiceId)) {
      const newValue = [...selectedIds, choiceId];
      this.onUpdateCell(rowId, columnId, newValue);
    }
  }

  /**
   * Remove a choice from multi-select cell
   */
  removeChoiceFromCell(rowId: string, columnId: string, choiceId: string): void {
    const row = this.rows().find(r => r.id === rowId);
    if (!row) return;

    const currentValue = row.cells[columnId];
    const selectedIds = Array.isArray(currentValue) ? (currentValue as string[]) : [];

    const newValue = selectedIds.filter(id => id !== choiceId);
    this.onUpdateCell(rowId, columnId, newValue);
  }

  /**
   * Prevent TipTap from intercepting keyboard events inside the table
   * This prevents the database block from being deleted when typing in cells
   */
  onTableKeydown(event: KeyboardEvent): void {
    // Stop propagation to prevent TipTap from handling keyboard events
    // Exception: Allow Escape key to propagate (to exit editing)
    if (event.key !== 'Escape') {
      event.stopPropagation();
    }
  }

  /**
   * Toggle selection for all rows
   */
  onToggleSelectAll(): void {
    if (this.isAllSelected()) {
      // Deselect all
      this.selectedRowIds.set(new Set());
    } else {
      // Select all
      const allRowIds = this.rows().map(row => row.id);
      this.selectedRowIds.set(new Set(allRowIds));
    }
  }

  /**
   * Toggle selection for a single row
   */
  onToggleRowSelection(rowId: string): void {
    const currentSelection = new Set(this.selectedRowIds());

    if (currentSelection.has(rowId)) {
      currentSelection.delete(rowId);
    } else {
      currentSelection.add(rowId);
    }

    this.selectedRowIds.set(currentSelection);
  }

  /**
   * Check if a row is selected
   */
  isRowSelected(rowId: string): boolean {
    return this.selectedRowIds().has(rowId);
  }

  /**
   * Delete selected rows
   */
  onDeleteSelectedRows(): void {
    const selectedIds = Array.from(this.selectedRowIds());
    if (selectedIds.length === 0) return;

    const confirmMessage = `Voulez-vous vraiment supprimer ${selectedIds.length} ligne(s) ?`;
    if (!confirm(confirmMessage)) return;

    this.onDeleteRows(selectedIds);
    // Clear selection after deletion
    this.selectedRowIds.set(new Set());
  }

  /**
   * Start editing database name
   */
  onStartEditingName(): void {
    this.tempDatabaseName.set(this.databaseConfig().name);
    this.isEditingName.set(true);
  }

  /**
   * Save database name
   */
  onSaveDatabaseName(): void {
    const newName = this.tempDatabaseName().trim();

    // Don't save if name is empty or unchanged
    if (!newName || newName === this.databaseConfig().name) {
      this.isEditingName.set(false);
      return;
    }

    // Update config locally
    this.databaseConfig.update(config => ({
      ...config,
      name: newName
    }));

    // Save to Supabase
    this.databaseService.updateDatabaseConfig(this.databaseId, this.databaseConfig())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          console.log('✅ Database name updated:', newName);
          this.syncToTipTap();
          this.isEditingName.set(false);
        },
        error: (err) => {
          console.error('❌ Failed to update database name:', err);
          alert('Erreur lors de la mise à jour du nom');
          this.isEditingName.set(false);
        }
      });
  }

  /**
   * Cancel editing database name
   */
  onCancelEditingName(): void {
    this.isEditingName.set(false);
    this.tempDatabaseName.set('');
  }

  /**
   * Handle keydown in name input
   */
  onNameInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.onSaveDatabaseName();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.onCancelEditingName();
    }
    // Stop propagation to prevent TipTap interference
    event.stopPropagation();
  }

  /**
   * Get the current view configuration
   */
  private getCurrentView(): DatabaseView | undefined {
    return this.databaseConfig().views.find(
      (v) => v.type === this.currentView()
    );
  }

  /**
   * Load filters and sort from current view config
   */
  private loadViewConfig(): void {
    const currentView = this.getCurrentView();
    if (currentView?.config?.filters) {
      this.activeFilters.set(currentView.config.filters);
    }
    if (currentView?.config?.sortBy) {
      // Vérifier que la colonne existe avant d'appliquer le tri
      const columnExists = this.databaseConfig().columns.some(
        (col) => col.id === currentView.config.sortBy
      );
      if (columnExists) {
        this.activeSort.set({
          columnId: currentView.config.sortBy,
          order: currentView.config.sortOrder || 'asc',
        });
      }
    }
    if (currentView?.config?.groupBy) {
      this.kanbanGroupByColumnId.set(currentView.config.groupBy);
    }
    // Load calendar dateColumn from view config
    // Note: dateColumn is stored in groupBy for calendar views (reusing the field)
    if (this.currentView() === 'calendar' && currentView?.config?.groupBy) {
      this.calendarDateColumnId.set(currentView.config.groupBy);
    }
    // Load timeline date columns from view config
    // Note: We use groupBy for startDate and sortBy for endDate (reusing fields)
    if (this.currentView() === 'timeline') {
      if (currentView?.config?.groupBy) {
        this.timelineStartDateColumnId.set(currentView.config.groupBy);
      }
      if (currentView?.config?.sortBy) {
        this.timelineEndDateColumnId.set(currentView.config.sortBy);
      }
    }
  }

  /**
   * Handle filter changes from DatabaseFiltersComponent
   */
  onFilterChange(filters: Filter[]): void {
    this.activeFilters.set(filters);
    this.loadRowsWithFilters();
    this.saveCurrentViewConfig();
  }

  /**
   * Clear all active filters
   */
  onClearAllFilters(): void {
    this.activeFilters.set([]);
    this.loadRowsWithFilters();
    this.saveCurrentViewConfig();
  }

  /**
   * Handle column header click for sorting
   */
  onColumnHeaderClick(columnId: string): void {
    const currentSort = this.activeSort();

    // Cycle: none → asc → desc → none
    if (!currentSort || currentSort.columnId !== columnId) {
      // Nouveau tri ascendant
      this.activeSort.set({ columnId, order: 'asc' });
    } else if (currentSort.order === 'asc') {
      // Passer en descendant
      this.activeSort.set({ columnId, order: 'desc' });
    } else {
      // Supprimer le tri
      this.activeSort.set(null);
    }

    this.loadRowsWithFilters();
    this.saveCurrentViewConfig();
  }

  /**
   * Toggle column visibility
   */
  onToggleColumnVisibility(columnId: string): void {
    this.databaseConfig.update(config => ({
      ...config,
      columns: config.columns.map(col =>
        col.id === columnId ? { ...col, visible: !col.visible } : col
      ),
    }));

    // Sauvegarder dans Supabase
    this.databaseService
      .updateDatabaseConfig(this.databaseId, this.databaseConfig())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.syncToTipTap();
        },
        error: (err) => {
          console.error('Failed to update column visibility:', err);
        },
      });
  }

  /**
   * Save current view configuration (filters, sort) to Supabase
   */
  private saveCurrentViewConfig(): void {
    const currentView = this.getCurrentView();
    if (!currentView) return;

    // Update the view config
    currentView.config.filters = this.activeFilters();
    const sort = this.activeSort();
    if (sort) {
      currentView.config.sortBy = sort.columnId;
      currentView.config.sortOrder = sort.order;
    } else {
      delete currentView.config.sortBy;
      delete currentView.config.sortOrder;
    }

    // Save kanban groupBy
    if (this.currentView() === 'kanban') {
      currentView.config.groupBy = this.kanbanGroupByColumnId();
    }

    // Save calendar dateColumn (reuse groupBy field)
    if (this.currentView() === 'calendar') {
      currentView.config.groupBy = this.calendarDateColumnId();
    }

    // Save timeline date columns (reuse groupBy for startDate, sortBy for endDate)
    if (this.currentView() === 'timeline') {
      currentView.config.groupBy = this.timelineStartDateColumnId();
      currentView.config.sortBy = this.timelineEndDateColumnId();
    }

    // Persist to Supabase (debounced via changeSubject)
    this.changeSubject.next();
  }

  // =====================================================================
  // Kanban View Methods
  // =====================================================================

  /**
   * Handle cell update from Kanban drag & drop
   */
  onKanbanCellUpdate(event: { rowId: string; columnId: string; value: CellValue }): void {
    this.onUpdateCell(event.rowId, event.columnId, event.value);
  }

  /**
   * Handle "Add select column" from Kanban empty state
   */
  onKanbanAddSelectColumn(): void {
    // Find first select column or create one
    const selectColumn = this.databaseConfig().columns.find(
      (col) => col.type === 'select' || col.type === 'multi-select'
    );

    if (selectColumn) {
      // Use existing select column
      this.kanbanGroupByColumnId.set(selectColumn.id);
      this.saveCurrentViewConfig();
    } else {
      // Create a new select column
      this.onAddColumn();
    }
  }

  /**
   * Handle "Configure groupBy" from Kanban
   */
  onKanbanConfigureGroupBy(): void {
    // Find all select columns
    const selectColumns = this.databaseConfig().columns.filter(
      (col) => col.type === 'select' || col.type === 'multi-select'
    );

    if (selectColumns.length === 0) {
      this.onAddColumn();
      return;
    }

    // For now, cycle through available select columns
    // TODO: Show a dialog to let user choose
    const currentGroupBy = this.kanbanGroupByColumnId();
    const currentIndex = selectColumns.findIndex((col) => col.id === currentGroupBy);
    const nextIndex = (currentIndex + 1) % selectColumns.length;
    this.kanbanGroupByColumnId.set(selectColumns[nextIndex].id);
    this.saveCurrentViewConfig();
  }

  // =====================================================================
  // Calendar View Methods
  // =====================================================================

  /**
   * Handle row click from Calendar
   */
  onCalendarRowClick(rowId: string): void {
    // TODO: Open row detail dialog or scroll to row in table view
    console.log('Calendar row clicked:', rowId);
  }

  /**
   * Handle "Add date column" from Calendar empty state
   */
  onCalendarAddDateColumn(): void {
    // Find first date column or create one
    const dateColumn = this.databaseConfig().columns.find(
      (col) => col.type === 'date'
    );

    if (dateColumn) {
      // Use existing date column
      this.calendarDateColumnId.set(dateColumn.id);
      this.saveCurrentViewConfig();
    } else {
      // Create a new date column
      this.onAddColumn();
    }
  }

  /**
   * Handle "Configure date column" from Calendar
   */
  onCalendarConfigureDateColumn(): void {
    // Find all date columns
    const dateColumns = this.databaseConfig().columns.filter(
      (col) => col.type === 'date'
    );

    if (dateColumns.length === 0) {
      this.onAddColumn();
      return;
    }

    // For now, cycle through available date columns
    // TODO: Show a dialog to let user choose
    const currentDateColumn = this.calendarDateColumnId();
    const currentIndex = dateColumns.findIndex((col) => col.id === currentDateColumn);
    const nextIndex = (currentIndex + 1) % dateColumns.length;
    this.calendarDateColumnId.set(dateColumns[nextIndex].id);
    this.saveCurrentViewConfig();
  }

  // =====================================================================
  // Timeline View Methods
  // =====================================================================

  /**
   * Handle row click from Timeline
   */
  onTimelineRowClick(rowId: string): void {
    // TODO: Implement row editing or modal
    console.log('Timeline row clicked:', rowId);
  }

  /**
   * Handle "Add date column" from Timeline
   */
  onTimelineAddDateColumn(): void {
    // Find first existing date column or create one
    const dateColumn = this.databaseConfig().columns.find(
      (col) => col.type === 'date'
    );

    if (dateColumn) {
      this.timelineStartDateColumnId.set(dateColumn.id);
      this.saveCurrentViewConfig();
    } else {
      // Create a new date column
      this.onAddColumn();
    }
  }

  /**
   * Handle "Configure date columns" from Timeline
   */
  onTimelineConfigureDateColumns(): void {
    // Find all date columns
    const dateColumns = this.databaseConfig().columns.filter(
      (col) => col.type === 'date'
    );

    if (dateColumns.length === 0) {
      this.onAddColumn();
      return;
    }

    // For now, cycle through available date columns for start date
    // TODO: Show a dialog to let user choose both start and end date columns
    const currentStartDateColumn = this.timelineStartDateColumnId();
    const currentIndex = dateColumns.findIndex(
      (col) => col.id === currentStartDateColumn
    );
    const nextIndex = (currentIndex + 1) % dateColumns.length;
    this.timelineStartDateColumnId.set(dateColumns[nextIndex].id);

    // Optionally set the next column as end date
    if (dateColumns.length > 1) {
      const endIndex = (nextIndex + 1) % dateColumns.length;
      this.timelineEndDateColumnId.set(dateColumns[endIndex].id);
    }

    this.saveCurrentViewConfig();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
