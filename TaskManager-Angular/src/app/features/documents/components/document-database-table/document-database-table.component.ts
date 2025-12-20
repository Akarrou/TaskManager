import { Component, Input, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
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
  SelectChoice,
  Filter,
  SortOrder,
  QueryRowsParams,
  DatabaseView,
  findNameColumn,
} from '../../models/database.model';
import { DatabaseService } from '../../services/database.service';
import { Document, DocumentService } from '../../services/document.service';
import {
  ColumnEditorDialogComponent,
  ColumnEditorDialogData,
  ColumnEditorDialogResult,
} from '../column-editor-dialog/column-editor-dialog.component';
import {
  CsvImportDialogComponent,
} from '../csv-import-dialog/csv-import-dialog.component';
import {
  TaskCsvImportDialogComponent,
} from '../../../tasks-dashboard/components/task-csv-import-dialog/task-csv-import-dialog.component';
import { TaskCsvImportResult } from '../../../tasks-dashboard/models/task-csv-import.model';
import {
  ManageOptionsDialogComponent,
  ManageOptionsDialogData,
  ManageOptionsDialogResult,
} from '../manage-options-dialog/manage-options-dialog.component';
import {
  DeleteDatabaseDialogComponent,
  DeleteDatabaseDialogData,
} from '../delete-database-dialog/delete-database-dialog.component';
import { CsvImportDialogData, CsvImportResult } from '../../models/csv-import.model';
import { DatabaseFiltersComponent } from '../database-filters/database-filters.component';
import { DatabaseKanbanView } from '../database-kanban-view/database-kanban-view';
import { DatabaseCalendarView } from '../database-calendar-view/database-calendar-view';
import { DatabaseTimelineView } from '../database-timeline-view/database-timeline-view';
import { MatSnackBar } from '@angular/material/snack-bar';

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
    MatPaginatorModule,
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
  private documentService = inject(DocumentService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);

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

  // Pagination state
  pageSize = signal<number>(50);
  pageIndex = signal<number>(0);
  totalCount = signal<number>(0);
  pageSizeOptions = [10, 25, 50, 100];

  // Kanban view state
  kanbanGroupByColumnId = signal<string | undefined>(undefined);

  // Calendar view state
  calendarDateColumnId = signal<string | undefined>(undefined);

  // Timeline view state
  timelineStartDateColumnId = signal<string | undefined>(undefined);
  timelineEndDateColumnId = signal<string | undefined>(undefined);

  // Computed
  columnCount = computed(() => this.databaseConfig().columns.length);
  rowCount = computed(() => this.totalCount()); // Use totalCount for accurate row count with pagination

  // Check if this is a task database
  isTaskDatabase = computed(() => {
    const config = this.databaseConfig() as { type?: string };
    return config.type === 'task';
  });

  // Sorted columns with Task Number first (for table display)
  sortedColumns = computed(() => {
    const columns = this.databaseConfig().columns;
    const taskNumberColumn = columns.find((col: DatabaseColumn) => col.name === 'Task Number');

    if (!taskNumberColumn) {
      return columns;
    }

    // Place Task Number first, then all other columns in their original order
    const otherColumns = columns.filter((col: DatabaseColumn) => col.name !== 'Task Number');
    return [taskNumberColumn, ...otherColumns];
  });

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
    this.databaseService.getDatabaseMetadata(this.databaseId).subscribe({
      next: (metadata) => {

        // Load config from Supabase (source of truth)
        this.databaseConfig.set(metadata.config);

        // Clean up view configs: remove references to deleted columns
        const validColumnIds = new Set(metadata.config.columns.map(col => col.id));
        let configUpdated = false;

        metadata.config.views.forEach(view => {
          // Clean up sortBy if column no longer exists
          if (view.config?.sortBy && !validColumnIds.has(view.config.sortBy)) {
            delete view.config.sortBy;
            delete view.config.sortOrder;
            configUpdated = true;
          }

          // Clean up groupBy if column no longer exists
          if (view.config?.groupBy && !validColumnIds.has(view.config.groupBy)) {
            delete view.config.groupBy;
            configUpdated = true;
          }

          // Clean up filters that reference deleted columns
          if (view.config?.filters && view.config.filters.length > 0) {
            const validFilters = view.config.filters.filter(filter => {
              const isValid = validColumnIds.has(filter.columnId);
              return isValid;
            });
            if (validFilters.length !== view.config.filters.length) {
              view.config.filters = validFilters;
              configUpdated = true;
            }
          }
        });

        // Helper function to continue initialization after config is ready
        const continueInitialization = () => {
          // With lazy creation, table may not exist yet - loadRows() will handle empty tables gracefully
          this.loadRows();
          this.isInitializing.set(false);
        };

        // If config was updated, persist to Supabase before continuing
        if (configUpdated) {
          this.databaseConfig.set(metadata.config);
          this.databaseService
            .updateDatabaseConfig(this.databaseId, metadata.config)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: () => {
                this.syncToTipTap();
                this.loadViewConfig();
                // Continue initialization AFTER config is saved
                continueInitialization();
              },
              error: (err) => {
                console.error('[CSV Import] Failed to persist cleaned config:', err);
                // Continue anyway with cleaned config in memory
                this.syncToTipTap();
                this.loadViewConfig();
                // Continue initialization even if save failed
                continueInitialization();
              },
            });
        } else {
          // No cleanup needed, proceed normally
          this.syncToTipTap();
          this.loadViewConfig();
          // Continue initialization immediately
          continueInitialization();
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
   * Uses RPC which bypasses PostgREST schema cache
   */
  loadRowsWithFilters() {
    this.isLoading.set(true);

    const params: QueryRowsParams = {
      databaseId: this.databaseId,
      filters: this.activeFilters(),
      limit: this.pageSize(),
      offset: this.pageIndex() * this.pageSize(),
    };

    const sort = this.activeSort();
    if (sort) {
      params.sortBy = sort.columnId;
      params.sortOrder = sort.order;
    }

    this.databaseService
      .getRowsWithCount(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ rows, totalCount }) => {
          this.rows.set(rows);
          this.totalCount.set(totalCount);
          this.isLoading.set(false);
        },
        error: (err: any) => {
          console.error('Failed to load rows:', err);
          this.error.set('Erreur lors du chargement des données');
          this.isLoading.set(false);
        },
      });
  }

  /**
   * Handle page change from paginator
   */
  onPageChange(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.loadRowsWithFilters();
  }


  /**
   * Add a new row
   * Creates a linked document if the database has a Name column (Notion-style)
   */
  onAddRow() {
    const newRowOrder = this.rows().length;
    const emptyCells: Record<string, CellValue> = {};

    // Initialize empty cells for all columns
    this.databaseConfig().columns.forEach((col) => {
      emptyCells[col.id] = this.getDefaultValueForColumn(col);
    });

    // Check if database has a Name column (should create linked document)
    const nameColumn = findNameColumn(this.databaseConfig().columns);

    if (nameColumn) {
      // Create row WITH linked document (for databases with Name column)
      this.databaseService
        .addRowWithDocument(
          this.databaseId,
          emptyCells,
          undefined, // No project_id for row documents
          newRowOrder
        )
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: ({ row }: { row: DatabaseRow; document: Document }) => {
            // Update local state with the new row
            this.rows.update((rows: DatabaseRow[]) => [...rows, row]);
            // Update total count to hide empty state
            this.totalCount.update((count: number) => count + 1);
          },
          error: (err: unknown) => {
            console.error('Failed to add row with document:', err);
            alert('Impossible d\'ajouter une ligne');
          },
        });
    } else {
      // For databases without Name column, just create the row
      this.databaseService
        .addRow({
          databaseId: this.databaseId,
          cells: emptyCells,
          row_order: newRowOrder,
        })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (newRow: DatabaseRow) => {
            this.rows.update((rows: DatabaseRow[]) => [...rows, newRow]);
            // Update total count to hide empty state
            this.totalCount.update((count: number) => count + 1);
          },
          error: (err: unknown) => {
            console.error('Failed to add row:', err);
            alert('Impossible d\'ajouter une ligne');
          },
        });
    }
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

    // Check if this is the Name column update -> sync with linked document
    const nameColumn = findNameColumn(this.databaseConfig().columns);
    const isNameColumnUpdate = nameColumn && nameColumn.id === columnId;

    if (isNameColumnUpdate && typeof value === 'string') {
      // Get the linked document for this row and update its title
      this.databaseService.getRowDocument(this.databaseId, rowId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (linkedDoc: Document | null) => {
            if (linkedDoc) {
              // Update the document title
              this.documentService.updateDocument(linkedDoc.id, { title: value })
                .pipe(takeUntil(this.destroy$))
                .subscribe({
                  error: (err: unknown) => console.error('Failed to sync document title:', err)
                });
            }
          },
          error: (err: unknown) => console.error('Failed to get linked document:', err)
        });
    }

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
          // Update total count
          this.totalCount.update((count: number) => count - rowIds.length);
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
            // Reload only metadata (not rows) to get the updated columns
            this.databaseService
              .getDatabaseMetadata(this.databaseId)
              .pipe(takeUntil(this.destroy$))
              .subscribe({
                next: (metadata: any) => {
                  this.databaseConfig.set(metadata.config);
                  this.syncToTipTap();
                  this.loadViewConfig();
                },
                error: () => {},
              });
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

    // Block editing of readonly columns
    if (column.readonly) {
      console.warn('Cannot edit readonly column:', column.name);
      return;
    }

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
   * Manage options for select/multi-select columns
   */
  onManageOptions(columnId: string) {
    const column = this.databaseConfig().columns.find((col) => col.id === columnId);
    if (!column) return;

    // Only for select/multi-select columns
    if (column.type !== 'select' && column.type !== 'multi-select') {
      console.warn('Can only manage options for select/multi-select columns');
      return;
    }

    const dialogData: ManageOptionsDialogData = {
      column,
    };

    const dialogRef = this.dialog.open(ManageOptionsDialogComponent, {
      width: '600px',
      data: dialogData,
      disableClose: true,
    });

    dialogRef.afterClosed().subscribe((result: ManageOptionsDialogResult | undefined) => {
      if (!result) return;

      // Update column with new choices
      const updatedColumn = {
        ...column,
        options: {
          ...column.options,
          choices: result.choices,
        },
      };

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

            this.snackBar.open('Options mises à jour avec succès', 'Fermer', {
              duration: 3000,
            });
          },
          error: (err) => {
            console.error('Failed to update column options:', err);
            alert('Impossible de mettre à jour les options');
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

    // Block deletion of readonly columns
    if (column.readonly) {
      console.warn('Cannot delete readonly column:', column.name);
      return;
    }

    // Block deletion of Name column (linked to document title)
    if (column.isNameColumn) {
      this.snackBar.open('La colonne "Nom" ne peut pas être supprimée car elle est liée au titre du document', 'OK', {
        duration: 4000,
      });
      return;
    }

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
   * Vérifie si l'import CSV est autorisé (aucune ligne uniquement)
   */
  canImportCsv(): boolean {
    return this.rows().length === 0;
  }

  /**
   * Ouvre le dialog d'import CSV
   * Pour les Task Databases, ouvre le TaskCsvImportDialogComponent spécialisé
   * Pour les autres databases, ouvre le CsvImportDialogComponent générique
   */
  openCsvImportDialog() {
    if (this.isTaskDatabase()) {
      this.openTaskCsvImportDialog();
    } else {
      this.openGenericCsvImportDialog();
    }
  }

  /**
   * Ouvre le dialog d'import CSV pour les Task Databases
   */
  private openTaskCsvImportDialog() {
    const dialogRef = this.dialog.open(TaskCsvImportDialogComponent, {
      width: '900px',
      maxHeight: '90vh',
      data: {
        preselectedDatabaseId: this.databaseId,
      },
      disableClose: false,
    });

    dialogRef.afterClosed().subscribe((result: TaskCsvImportResult | null) => {
      if (result && result.rowsImported > 0) {
        // Recharger les métadonnées et les lignes
        this.initializeDatabase();

        // Afficher message de succès
        const message =
          result.errors.length === 0
            ? `Import réussi ! ${result.rowsImported} tâches importées.`
            : `Import partiel : ${result.rowsImported} tâches importées. ${result.errors.length} erreurs.`;

        this.snackBar.open(message, 'OK', {
          duration: 5000,
        });
      }
    });
  }

  /**
   * Ouvre le dialog d'import CSV générique
   */
  private openGenericCsvImportDialog() {
    const dialogData: CsvImportDialogData = {
      databaseId: this.databaseId,
      tableName: this.databaseConfig().name || 'Base de données',
    };

    const dialogRef = this.dialog.open(CsvImportDialogComponent, {
      width: '900px',
      maxHeight: '90vh',
      data: dialogData,
      disableClose: false,
    });

    dialogRef.afterClosed().subscribe((result: CsvImportResult | null) => {
      if (result && result.rowsImported > 0) {
        // Recharger les métadonnées et les lignes
        this.initializeDatabase();

        // Afficher message de succès
        const message =
          result.errors.length === 0
            ? `Import réussi ! ${result.columnsCreated} colonnes et ${result.rowsImported} lignes ajoutées.`
            : `Import partiel : ${result.rowsImported} lignes importées sur ${result.rowsImported + result.errors.length}. ${result.errors.length} erreurs.`;

        this.snackBar.open(message, 'OK', {
          duration: 5000,
        });
      }
    });
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
   * Check if a column is readonly (cannot be edited or deleted)
   */
  isColumnReadonly(columnId: string): boolean {
    const column = this.databaseConfig().columns.find(col => col.id === columnId);
    return column?.readonly === true;
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
   * Convert Tailwind color class to CSS color, or return hex color directly
   */
  getChoiceColor(color: string): string {
    // If it's already a hex color, return it directly
    if (color?.startsWith('#')) {
      return color;
    }

    // Map Tailwind classes to hex colors
    const colorMap: Record<string, string> = {
      'bg-gray-100': '#f3f4f6',
      'bg-gray-200': '#e5e7eb',
      'bg-gray-300': '#d1d5db',
      'bg-red-200': '#fecaca',
      'bg-red-300': '#fca5a5',
      'bg-orange-200': '#fed7aa',
      'bg-yellow-200': '#fef08a',
      'bg-green-200': '#bbf7d0',
      'bg-teal-200': '#99f6e4',
      'bg-cyan-200': '#a5f3fc',
      'bg-blue-200': '#bfdbfe',
      'bg-indigo-200': '#c7d2fe',
      'bg-purple-200': '#e9d5ff',
      'bg-pink-200': '#fbcfe8',
    };

    return colorMap[color] || '#e5e7eb';
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
   * Create a new option and add it to the multi-select cell
   * Opens the manage options dialog
   */
  onCreateNewOption(rowId: string, columnId: string): void {
    const column = this.databaseConfig().columns.find((col: DatabaseColumn) => col.id === columnId);
    if (!column) return;

    const dialogData: ManageOptionsDialogData = {
      column,
    };

    const dialogRef = this.dialog.open(ManageOptionsDialogComponent, {
      width: '600px',
      data: dialogData,
      disableClose: true,
    });

    dialogRef.afterClosed().subscribe((result: ManageOptionsDialogResult | undefined) => {
      if (!result) return;

      // Get the newly added choices (compare with original)
      const originalChoiceIds = column.options?.choices?.map((c: SelectChoice) => c.id) || [];
      const newChoices = result.choices.filter((c: SelectChoice) => !originalChoiceIds.includes(c.id));

      // Update column with new choices
      const updatedColumn = {
        ...column,
        options: {
          ...column.options,
          choices: result.choices,
        },
      };

      // Update column configuration
      this.databaseService
        .updateColumn({
          databaseId: this.databaseId,
          columnId,
          updates: updatedColumn,
        })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            // Update local config
            this.databaseConfig.update((config: DatabaseConfig) => ({
              ...config,
              columns: config.columns.map((col: DatabaseColumn) =>
                col.id === columnId ? updatedColumn : col
              ),
            }));

            // If a new choice was added, add it to the current cell
            if (newChoices.length > 0) {
              // Add the most recently created choice to the cell
              const lastNewChoice = newChoices[newChoices.length - 1];
              this.addChoiceToCell(rowId, columnId, lastNewChoice.id);
            }

            this.changeSubject.next();

            this.snackBar.open('Options mises à jour avec succès', 'Fermer', {
              duration: 3000,
            });
          },
          error: (err: Error) => {
            console.error('Failed to update column options:', err);
            alert('Impossible de mettre à jour les options');
          },
        });
    });
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
    const selectedIds = Array.from(this.selectedRowIds()) as string[];
    if (selectedIds.length === 0) return;

    const confirmMessage = `Voulez-vous vraiment supprimer ${selectedIds.length} ligne(s) ?`;
    if (!confirm(confirmMessage)) return;

    this.onDeleteRows(selectedIds);
    // Clear selection after deletion
    this.selectedRowIds.set(new Set());
  }

  /**
   * Delete entire database with confirmation
   * Removes the PostgreSQL table, metadata, and TipTap node
   */
  onDeleteDatabase(): void {
    const dialogRef = this.dialog.open<DeleteDatabaseDialogComponent, DeleteDatabaseDialogData, boolean>(
      DeleteDatabaseDialogComponent,
      {
        width: '500px',
        data: {
          databaseName: this.databaseConfig().name,
          rowCount: this.rowCount(),
        },
      }
    );

    dialogRef.afterClosed()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (confirmed: boolean | undefined) => {
          if (confirmed) {
            this.isLoading.set(true);
            this.databaseService
              .deleteDatabase(this.databaseId)
              .pipe(takeUntil(this.destroy$))
              .subscribe({
                next: () => {
                  this.isLoading.set(false);
                  this.snackBar.open('Base de données supprimée avec succès', 'OK', {
                    duration: 3000,
                  });

                  // Notify parent component (TipTap editor) to remove the node
                  console.log('🔔 Notifying parent about database deletion', {
                    databaseId: this.databaseId,
                    hasCallback: !!this.onDataChange,
                  });

                  if (this.onDataChange) {
                    this.onDataChange({
                      databaseId: this.databaseId,
                      config: this.databaseConfig(),
                      storageMode: this.storageMode,
                      deleted: true,
                    });
                    console.log('✅ onDataChange callback executed');
                  } else {
                    console.warn('⚠️ No onDataChange callback provided');
                  }
                },
                error: (err: unknown) => {
                  this.isLoading.set(false);
                  console.error('Failed to delete database:', err);
                  const errorMessage = err instanceof Error
                    ? err.message
                    : 'Erreur lors de la suppression de la base de données';
                  this.snackBar.open(errorMessage, 'OK', {
                    duration: 5000,
                  });
                },
              });
          }
        },
      });
  }

  /**
   * Open the document linked to a database row (Notion-style)
   * This allows users to click on a row and open it as a full page with properties and content
   */
  onOpenRowDocument(rowId: string): void {
    this.databaseService
      .getRowDocument(this.databaseId, rowId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (document: Document | null) => {
          if (document) {
            // Navigate to the existing document
            this.router.navigate(['/documents', document.id]);
          } else {
            // Document doesn't exist yet - this shouldn't happen with the new flow
            // but we can handle it gracefully
            console.warn('No document found for row:', rowId);
            this.snackBar.open('Document introuvable pour cette ligne', 'OK', {
              duration: 3000,
            });
          }
        },
        error: (err: unknown) => {
          console.error('Failed to get row document:', err);
          this.snackBar.open('Erreur lors de l\'ouverture du document', 'OK', {
            duration: 3000,
          });
        },
      });
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
    this.pageIndex.set(0); // Reset to first page when filters change
    this.loadRowsWithFilters();
    this.saveCurrentViewConfig();
  }

  /**
   * Clear all active filters
   */
  onClearAllFilters(): void {
    this.activeFilters.set([]);
    this.pageIndex.set(0); // Reset to first page when filters cleared
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

    this.pageIndex.set(0); // Reset to first page when sort changes
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
  onCalendarRowClick(_rowId: string): void {
    // TODO: Open row detail dialog or scroll to row in table view
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
  onTimelineRowClick(_rowId: string): void {
    // TODO: Implement row editing or modal
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

  /**
   * Check if column can have its options managed
   */
  canManageOptions(columnId: string): boolean {
    const column = this.databaseConfig().columns.find((col: DatabaseColumn) => col.id === columnId);
    if (!column) return false;
    return column.type === 'select' || column.type === 'multi-select';
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
