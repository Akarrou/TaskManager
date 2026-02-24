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
import { Subject, forkJoin, of, takeUntil, debounceTime, switchMap, filter } from 'rxjs';
import { RealtimeService } from '../../../../core/services/realtime.service';
import { RealtimeCooldown } from '../../../../core/utils/realtime-cooldown';
import {
  DatabaseConfig,
  DatabaseRow,
  DatabaseNodeAttributes,
  CellValue,
  DEFAULT_DATABASE_CONFIG,
  DEFAULT_COLUMN_WIDTHS,
  DatabaseColumn,
  ViewType,
  ViewConfig,
  SelectChoice,
  Filter,
  SortOrder,
  QueryRowsParams,
  DatabaseView,
  findNameColumn,
  DateRangeValue,
  isDateRangeValue,
  hasIncludeTime,
  TimelineGranularity,
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
import {
  ConnectDatabaseDialogComponent,
  ConnectDatabaseDialogData,
  ConnectDatabaseDialogResult,
} from '../connect-database-dialog/connect-database-dialog.component';
import { CsvImportDialogData, CsvImportResult } from '../../models/csv-import.model';
import { DatabaseFiltersComponent } from '../database-filters/database-filters.component';
import { DatabaseKanbanView } from '../database-kanban-view/database-kanban-view';
import { DatabaseCalendarView } from '../database-calendar-view/database-calendar-view';
import { DatabaseTimelineView } from '../database-timeline-view/database-timeline-view';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TrashService } from '../../../../core/services/trash.service';
import { TrashStore } from '../../../trash/store/trash.store';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import {
  DateRangePickerDialogComponent,
  DateRangePickerDialogData,
  DateRangePickerDialogResult,
} from '../date-range-picker-dialog/date-range-picker-dialog.component';
import { DateRangeFormatPipe } from '../../../../shared/pipes/date-range-format.pipe';
import { LinkedItem } from '../../models/database.model';
import { AddToEventDialogComponent, AddToEventDialogData } from '../../../calendar/components/add-to-event-dialog/add-to-event-dialog.component';

interface DatabasePaginationSettings {
  pageSize: number;
  pageIndex: number;
}

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
    DateRangeFormatPipe,
  ],
  templateUrl: './document-database-table.component.html',
  styleUrl: './document-database-table.component.scss',
  host: {
    '[class.column-dragging]': 'draggingColumn() !== null',
    '[class.column-resizing]': 'resizing() !== null',
  },
})
export class DocumentDatabaseTableComponent implements OnInit, OnDestroy {
  private databaseService = inject(DatabaseService);
  private documentService = inject(DocumentService);
  private trashService = inject(TrashService);
  private trashStore = inject(TrashStore);
  private realtimeService = inject(RealtimeService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);
  private realtimeCooldown = new RealtimeCooldown();

  // Inputs
  @Input() databaseId!: string;
  @Input() documentId!: string;
  @Input() config!: DatabaseConfig;
  @Input() storageMode: 'supabase' = 'supabase';
  @Input() defaultPageSize: number = 5;
  @Input() onDataChange?: (attrs: DatabaseNodeAttributes) => void;
  @Input() initialSearchQuery?: string;
  @Input() set linkedDatabase(value: boolean) {
    this.isLinked.set(value);
  }

  // State signals
  isLoading = signal(false);
  isInitializing = signal(true);
  error = signal<string | null>(null);

  // Database state
  databaseConfig = signal<DatabaseConfig>(DEFAULT_DATABASE_CONFIG);
  rows = signal<DatabaseRow[]>([]);
  currentView = signal<ViewType>('table');
  isCreatingDatabase = signal(false);
  isLinked = signal(false); // True if this database is a reference to another document's database

  // Filtering and sorting state
  activeFilters = signal<Filter[]>([]);
  activeSort = signal<{ columnId: string; order: SortOrder } | null>(null);
  activeSearchQuery = signal<string>('');

  // Pagination state
  pageSize = signal<number>(5);
  pageIndex = signal<number>(0);
  totalCount = signal<number>(0);
  pageSizeOptions = [5, 10, 20, 50, 100];

  // Kanban view state
  kanbanGroupByColumnId = signal<string | undefined>(undefined);

  // Calendar view state
  calendarDateColumnId = signal<string | undefined>(undefined);
  calendarDateRangeColumnId = signal<string | undefined>(undefined);

  // Timeline view state
  timelineStartDateColumnId = signal<string | undefined>(undefined);
  timelineEndDateColumnId = signal<string | undefined>(undefined);
  timelineDateRangeColumnId = signal<string | undefined>(undefined);
  timelineGranularity = signal<TimelineGranularity>('auto');

  // Computed
  columnCount = computed(() => this.databaseConfig().columns.length);
  rowCount = computed(() => this.totalCount()); // Use totalCount for accurate row count with pagination

  // Check if this is a task database
  isTaskDatabase = computed(() => {
    const config = this.databaseConfig() as { type?: string };
    return config.type === 'task';
  });

  // Sorted columns by order property, filtered to visible only
  sortedColumns = computed(() => {
    const columns = this.databaseConfig().columns.filter(col => col.visible !== false);
    return [...columns].sort((a, b) => a.order - b.order);
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

  // Column resize state
  columnWidths = signal<Record<string, number>>({});
  resizing = signal<{ columnId: string; startX: number; startWidth: number } | null>(null);
  isResizing = computed(() => this.resizing() !== null);

  // Column drag-and-drop state
  draggingColumn = signal<{ columnId: string; startX: number; currentX: number; isDragging: boolean } | null>(null);
  dragOverColumnId = signal<string | null>(null);
  dropPosition = signal<'before' | 'after' | null>(null);

  // Cell tooltip state
  tooltipState = signal<{ text: string; x: number; y: number; visible: boolean }>({ text: '', x: 0, y: 0, visible: false });
  private tooltipTimeout: ReturnType<typeof setTimeout> | null = null;

  // Database name editing
  isEditingName = signal(false);
  tempDatabaseName = signal('');

  private destroy$ = new Subject<void>();
  private changeSubject = new Subject<void>();

  /** Set a cooldown to ignore self-origin Realtime events */
  private setRealtimeCooldown(): void {
    this.realtimeCooldown.set();
  }

  ngOnInit() {
    // Set initial page size from input
    this.pageSize.set(this.defaultPageSize);
    this.restorePaginationSettings();

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

    // Realtime: reload rows when the underlying database_* table changes
    const tableName = `database_${this.databaseId.replace('db-', '').replace(/-/g, '_')}`;
    this.realtimeService.onTableChange(tableName).pipe(
      debounceTime(500),
      filter(() => !this.realtimeCooldown.isActive() && !this.isLoading()),
      takeUntil(this.destroy$),
    ).subscribe(() => {
      this.loadRowsWithFilters();
    });

    // Realtime: reload config when document_databases metadata changes (filtered by this database's ID)
    this.realtimeService.onTableChange('document_databases').pipe(
      debounceTime(500),
      filter((event) => event.recordId === this.databaseId && !this.realtimeCooldown.isActive()),
      takeUntil(this.destroy$),
    ).subscribe(() => {
      this.initializeDatabase();
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

        // Initialize column widths from config
        this.initializeColumnWidths(metadata.config.columns);

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

        // Apply defaultView from Supabase config (source of truth)
        if (metadata.config.defaultView) {
          this.currentView.set(metadata.config.defaultView);
        }

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

    const searchQuery = this.activeSearchQuery();
    const params: QueryRowsParams = {
      databaseId: this.databaseId,
      filters: this.activeFilters(),
      ...(searchQuery ? { searchQuery } : {}),
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

  private savePaginationSettings(): void {
    const settings: DatabasePaginationSettings = {
      pageSize: this.pageSize(),
      pageIndex: this.pageIndex(),
    };
    localStorage.setItem(`db_pagination_${this.databaseId}`, JSON.stringify(settings));
  }

  private restorePaginationSettings(): void {
    const saved = localStorage.getItem(`db_pagination_${this.databaseId}`);
    if (saved) {
      try {
        const settings: DatabasePaginationSettings = JSON.parse(saved);
        if (this.pageSizeOptions.includes(settings.pageSize)) {
          this.pageSize.set(settings.pageSize);
        }
        if (settings.pageIndex >= 0) {
          this.pageIndex.set(settings.pageIndex);
        }
      } catch {
        // Ignore corrupted localStorage data
      }
    }
  }

  /**
   * Handle page change from paginator
   */
  onPageChange(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.savePaginationSettings();
    this.loadRowsWithFilters();
  }


  /**
   * Add a new row
   * Creates a linked document if the database has a Name column (Notion-style)
   */
  onAddRow() {
    this.setRealtimeCooldown();
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
    this.setRealtimeCooldown();
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
   * Soft delete rows (move to trash)
   */
  onDeleteRows(rowIds: string[]) {
    const count = rowIds.length;
    const dialogRef = this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      {
        width: '500px',
        data: {
          title: 'Déplacer vers la corbeille',
          message: '',
          itemName: `${count} ligne(s)`,
        },
      },
    );

    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(confirmed => {
      if (!confirmed) return;
      this.executeDeleteRows(rowIds);
    });
  }

  private executeDeleteRows(rowIds: string[]) {
    this.setRealtimeCooldown();
    const dbConfig = this.databaseConfig();
    const tableName = `database_${this.databaseId.replace('db-', '').replace(/-/g, '_')}`;
    const databaseName = dbConfig.name || 'Base de données';

    // Soft-delete in the database table (sets deleted_at)
    this.databaseService
      .deleteRows({
        databaseId: this.databaseId,
        rowIds,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          // Remove from local view
          const deletedRows = this.rows().filter((row) => rowIds.includes(row.id));
          this.rows.update((rows) => rows.filter((row) => !rowIds.includes(row.id)));
          this.totalCount.update((count: number) => count - rowIds.length);

          // Register all rows in trash_items via batched forkJoin
          const nameCol = findNameColumn(dbConfig.columns);
          const trashInserts$ = rowIds.map(rowId => {
            const row = deletedRows.find(r => r.id === rowId);
            const displayName = (nameCol && row ? String(row.cells[nameCol.id] || '') : '') || `Ligne ${rowId.slice(0, 8)}`;
            return this.trashService.softDeleteTrashOnly(
              'database_row',
              rowId,
              tableName,
              displayName,
              { databaseName, databaseId: this.databaseId },
            );
          });

          (trashInserts$.length > 0 ? forkJoin(trashInserts$) : of([]))
            .pipe(takeUntil(this.destroy$))
            .subscribe(() => this.trashStore.loadTrashCount());

          const snackRef = this.snackBar.open(
            `${rowIds.length} ligne(s) déplacée(s) dans la corbeille`,
            'Annuler',
            { duration: 5000 },
          );

          snackRef.onAction().pipe(takeUntil(this.destroy$)).subscribe(() => {
            this.databaseService.restoreRows(this.databaseId, rowIds)
              .pipe(
                switchMap(() => this.trashService.removeTrashEntries('database_row', rowIds)),
                takeUntil(this.destroy$),
              )
              .subscribe(() => {
                this.loadRows();
                this.trashStore.loadTrashCount();
              });
          });
        },
        error: (err) => {
          console.error('Failed to soft-delete rows:', err);
          this.snackBar.open('Impossible de supprimer les lignes', 'OK', { duration: 3000 });
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

    const dialogRef = this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      {
        width: '500px',
        data: {
          title: 'Supprimer la colonne',
          message: `Voulez-vous supprimer la colonne "${column.name}" ? Toutes les données de cette colonne seront définitivement perdues.`,
        },
      },
    );

    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(confirmed => {
      if (!confirmed) return;

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
          this.snackBar.open('Impossible de supprimer la colonne', 'OK', { duration: 3000 });
        },
      });
    });
  }

  /**
   * Switch view type and persist as default
   */
  onSwitchView(viewType: ViewType) {
    this.currentView.set(viewType);
    // Update defaultView in config
    this.databaseConfig.update(config => ({
      ...config,
      defaultView: viewType,
    }));
    // Load view-specific config for the new view
    this.loadViewConfig();
    // Persist to Supabase
    this.saveCurrentViewConfig();
  }

  /**
   * Vérifie si l'import CSV est autorisé (aucune ligne uniquement)
   */
  canImportCsv(): boolean {
    return this.rows().length === 0;
  }

  /**
   * Vérifie si la connexion à une base existante est autorisée (aucune ligne uniquement)
   */
  canConnectToExisting(): boolean {
    return this.rows().length === 0;
  }

  /**
   * Ouvre le dialog pour connecter à une base de données existante
   */
  openConnectDatabaseDialog(): void {
    const dialogData: ConnectDatabaseDialogData = {
      currentDatabaseId: this.databaseId,
    };

    const dialogRef = this.dialog.open(ConnectDatabaseDialogComponent, {
      width: '500px',
      maxHeight: '80vh',
      data: dialogData,
    });

    dialogRef
      .afterClosed()
      .pipe(takeUntil(this.destroy$))
      .subscribe((result: ConnectDatabaseDialogResult | undefined) => {
        if (result) {
          this.connectToDatabase(result);
        }
      });
  }

  /**
   * Connecte à une base de données existante:
   * 1. Supprime la base de données vide actuelle
   * 2. Met à jour le nœud TipTap pour pointer vers la base sélectionnée
   * 3. Marque le bloc comme "lié" (isLinked) pour éviter la suppression des données
   */
  private connectToDatabase(result: ConnectDatabaseDialogResult): void {
    this.isLoading.set(true);

    // Supprimer la base de données vide actuelle
    this.databaseService
      .deleteDatabase(this.databaseId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          // Marquer comme base liée (référence à une autre base)
          this.isLinked.set(true);

          // Mettre à jour le nœud TipTap avec la nouvelle référence et le flag isLinked
          if (this.onDataChange) {
            this.onDataChange({
              databaseId: result.selectedDatabaseId,
              config: result.selectedDatabaseConfig,
              storageMode: 'supabase',
              isLinked: true,
            });
          }

          // Mettre à jour l'ID local et recharger
          this.databaseId = result.selectedDatabaseId;
          this.initializeDatabase();

          this.snackBar.open('Base de données connectée avec succès', 'OK', {
            duration: 3000,
          });
        },
        error: (err: unknown) => {
          this.isLoading.set(false);
          console.error('Failed to connect database:', err);
          this.snackBar.open('Erreur lors de la connexion', 'OK', {
            duration: 5000,
          });
        },
      });
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
   * Preserves isLinked flag to maintain linked database state
   */
  private syncToTipTap() {
    if (!this.onDataChange) return;

    const attrs: DatabaseNodeAttributes = {
      databaseId: this.databaseId,
      config: this.databaseConfig(),
      storageMode: 'supabase',
      isLinked: this.isLinked(),
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
      case 'date-range':
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
   * Open date range picker dialog
   */
  onOpenDateRangePicker(rowId: string, columnId: string): void {
    const column = this.databaseConfig().columns.find(col => col.id === columnId);
    if (!column || column.type !== 'date-range') return;

    const row = this.rows().find(r => r.id === rowId);
    if (!row) return;

    const currentValue = row.cells[columnId];
    const dateRangeValue = isDateRangeValue(currentValue) ? currentValue : null;

    const dialogData: DateRangePickerDialogData = {
      value: dateRangeValue,
      includeTime: hasIncludeTime(column),
    };

    const dialogRef = this.dialog.open(DateRangePickerDialogComponent, {
      width: '400px',
      data: dialogData,
    });

    dialogRef.afterClosed().subscribe((result: DateRangePickerDialogResult | undefined) => {
      if (result !== undefined) {
        this.onUpdateCell(rowId, columnId, result.value);
      }
    });
  }

  /**
   * Get DateRangeValue from cell value
   */
  getDateRangeValue(cellValue: CellValue): DateRangeValue | null {
    return isDateRangeValue(cellValue) ? cellValue : null;
  }

  /**
   * Check if column has includeTime option
   */
  columnHasIncludeTime(column: DatabaseColumn): boolean {
    return hasIncludeTime(column);
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

    this.onDeleteRows(selectedIds);
    this.selectedRowIds.set(new Set());
  }

  /**
   * Open database in full page view
   */
  onOpenFullPage(): void {
    if (this.databaseId) {
      this.router.navigate(['/bdd', this.databaseId]);
    }
  }

  /**
   * Delete entire database with confirmation
   * For linked databases: only removes the TipTap node (keeps data intact)
   * For owned databases: removes the PostgreSQL table, metadata, and TipTap node
   */
  openAddToEvent(): void {
    const item: LinkedItem = {
      type: 'database',
      id: this.databaseId,
      label: this.databaseConfig().name,
    };
    this.dialog.open(AddToEventDialogComponent, {
      width: '560px',
      maxHeight: '80vh',
      data: { item } as AddToEventDialogData,
    });
  }

  openAddToEventForRow(row: DatabaseRow): void {
    const columns = this.databaseConfig().columns;
    const nameColumn = findNameColumn(columns);
    const title = nameColumn ? (row.cells[nameColumn.id] as string) || 'Sans titre' : 'Sans titre';
    const itemType = this.isTaskDatabase() ? 'task' : 'document';

    let label = title;
    if (this.isTaskDatabase()) {
      const taskNumberCol = columns.find(c => c.name === 'Task Number');
      const taskNumber = taskNumberCol ? (row.cells[taskNumberCol.id] as string) : null;
      if (taskNumber) {
        label = `${taskNumber} — ${title}`;
      }
    }

    const item: LinkedItem = {
      type: itemType,
      id: row.id,
      databaseId: this.databaseId,
      label,
    };
    this.dialog.open(AddToEventDialogComponent, {
      width: '560px',
      maxHeight: '80vh',
      data: { item } as AddToEventDialogData,
    });
  }

  onDeleteDatabase(): void {
    const isLinkedDb = this.isLinked();

    const dialogRef = this.dialog.open<DeleteDatabaseDialogComponent, DeleteDatabaseDialogData, boolean>(
      DeleteDatabaseDialogComponent,
      {
        width: '500px',
        data: {
          databaseName: this.databaseConfig().name,
          rowCount: this.rowCount(),
          isLinked: isLinkedDb,
        },
      }
    );

    dialogRef.afterClosed()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (confirmed: boolean | undefined) => {
          if (confirmed) {
            if (isLinkedDb) {
              // Linked database: just remove the TipTap node, keep data
              this.unlinkDatabase();
            } else {
              // Original database: delete everything
              this.deleteOwnedDatabase();
            }
          }
        },
      });
  }

  /**
   * Soft-delete an owned database (moves to trash + removes TipTap node)
   */
  private deleteOwnedDatabase(): void {
    this.isLoading.set(true);
    const dbName = this.databaseConfig()?.name || 'Base de données';
    let dbUuid = '';

    this.databaseService
      .softDeleteDatabase(this.databaseId)
      .pipe(
        switchMap((metadata) => {
          dbUuid = metadata.id;
          return this.trashService.softDeleteTrashOnly(
            'database',
            metadata.id,
            'document_databases',
            dbName,
            { databaseId: this.databaseId, documentId: this.documentId },
          );
        }),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: () => {
          this.isLoading.set(false);
          this.trashStore.loadItems();

          const snackBarRef = this.snackBar.open(
            'Base de données déplacée dans la corbeille',
            'Annuler',
            { duration: 5000 },
          );

          snackBarRef.onAction().subscribe(() => {
            this.databaseService
              .restoreDatabase(dbUuid)
              .pipe(takeUntil(this.destroy$))
              .subscribe(() => this.trashStore.loadItems());
          });

          // Notify parent component (TipTap editor) to remove the node
          if (this.onDataChange) {
            this.onDataChange({
              databaseId: this.databaseId,
              config: this.databaseConfig(),
              storageMode: this.storageMode,
              deleted: true,
            });
          }
        },
        error: (err: unknown) => {
          this.isLoading.set(false);
          console.error('Failed to soft-delete database:', err);
          const errorMessage = err instanceof Error
            ? err.message
            : 'Erreur lors de la suppression de la base de données';
          this.snackBar.open(errorMessage, 'OK', { duration: 5000 });
        },
      });
  }

  /**
   * Unlink a connected database (removes the TipTap node without deleting data)
   */
  private unlinkDatabase(): void {
    // Simply remove the TipTap node - data stays in the original database
    if (this.onDataChange) {
      this.onDataChange({
        databaseId: this.databaseId,
        config: this.databaseConfig(),
        storageMode: this.storageMode,
        deleted: true,
        isLinked: true,
      });
    }

    this.snackBar.open('Bloc retiré (les données sont conservées)', 'OK', {
      duration: 3000,
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
   * Get display name for a view type
   */
  private getViewDisplayName(viewType: ViewType): string {
    const names: Record<ViewType, string> = {
      table: 'Vue tableau',
      kanban: 'Vue Kanban',
      calendar: 'Vue calendrier',
      timeline: 'Vue timeline',
    };
    return names[viewType] || viewType;
  }

  /**
   * Load filters and sort from current view config
   */
  private loadViewConfig(): void {
    // If initialSearchQuery is set, use it for OR search across all text columns
    if (this.initialSearchQuery) {
      this.activeSearchQuery.set(this.initialSearchQuery);
    }

    const currentView = this.getCurrentView();
    if (!this.initialSearchQuery && currentView?.config?.filters) {
      this.activeFilters.set(currentView.config.filters);
    }
    if (currentView?.config?.sortBy && this.currentView() !== 'timeline') {
      // Vérifier que la colonne existe avant d'appliquer le tri
      // Note: For timeline view, sortBy is used for endDateColumnId (legacy), so skip
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
    if (currentView?.config?.groupBy && this.currentView() === 'kanban') {
      this.kanbanGroupByColumnId.set(currentView.config.groupBy);
    }

    // Load calendar view config
    if (this.currentView() === 'calendar') {
      // Use dedicated fields first, fallback to legacy groupBy
      if (currentView?.config?.calendarDateColumnId) {
        this.calendarDateColumnId.set(currentView.config.calendarDateColumnId);
        this.calendarDateRangeColumnId.set(undefined);
      } else if (currentView?.config?.calendarDateRangeColumnId) {
        this.calendarDateRangeColumnId.set(currentView.config.calendarDateRangeColumnId);
        this.calendarDateColumnId.set(undefined);
      } else if (currentView?.config?.groupBy) {
        // Legacy: groupBy was used for date column
        this.calendarDateColumnId.set(currentView.config.groupBy);
      }
    }

    // Load timeline view config
    if (this.currentView() === 'timeline') {
      // Use dedicated fields first, fallback to legacy groupBy/sortBy
      if (currentView?.config?.timelineDateRangeColumnId) {
        this.timelineDateRangeColumnId.set(currentView.config.timelineDateRangeColumnId);
        this.timelineStartDateColumnId.set(undefined);
        this.timelineEndDateColumnId.set(undefined);
      } else if (currentView?.config?.timelineStartDateColumnId) {
        this.timelineStartDateColumnId.set(currentView.config.timelineStartDateColumnId);
        this.timelineEndDateColumnId.set(currentView.config?.timelineEndDateColumnId);
        this.timelineDateRangeColumnId.set(undefined);
      } else {
        // Legacy: groupBy was used for startDate, sortBy for endDate
        if (currentView?.config?.groupBy) {
          this.timelineStartDateColumnId.set(currentView.config.groupBy);
        }
        if (currentView?.config?.sortBy) {
          this.timelineEndDateColumnId.set(currentView.config.sortBy);
        }
      }

      // Load timeline granularity
      if (currentView?.config?.timelineGranularity) {
        this.timelineGranularity.set(currentView.config.timelineGranularity);
      } else {
        this.timelineGranularity.set('auto');
      }
    }
  }

  /**
   * Handle filter changes from DatabaseFiltersComponent
   */
  onFilterChange(filters: Filter[]): void {
    this.activeFilters.set(filters);
    this.pageIndex.set(0); // Reset to first page when filters change
    this.savePaginationSettings();
    this.loadRowsWithFilters();
    this.saveCurrentViewConfig();
  }

  /**
   * Clear all active filters
   */
  onClearAllFilters(): void {
    this.activeFilters.set([]);
    this.pageIndex.set(0);
    this.savePaginationSettings();
    this.loadRowsWithFilters();
    this.saveCurrentViewConfig();
  }

  clearSearchQuery(): void {
    this.activeSearchQuery.set('');
    this.pageIndex.set(0);
    this.loadRowsWithFilters();
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
    this.savePaginationSettings();
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
   * Creates view entry dynamically if it doesn't exist
   *
   * IMPORTANT: This method uses immutable updates to avoid triggering
   * unnecessary TipTap re-renders which can cause data loss.
   */
  private saveCurrentViewConfig(): void {
    const currentViewType = this.currentView();

    // Build the updated view config immutably
    this.databaseConfig.update(config => {
      // Find or create the view entry
      let viewIndex = config.views.findIndex(v => v.type === currentViewType);
      let views = [...config.views];

      if (viewIndex === -1) {
        // Create new view entry
        views.push({
          id: `${currentViewType}-view`,
          name: this.getViewDisplayName(currentViewType),
          type: currentViewType,
          config: {},
        });
        viewIndex = views.length - 1;
      }

      // Build updated view config
      const existingConfig = views[viewIndex].config;
      let updatedViewConfig: ViewConfig = {
        ...existingConfig,
        filters: this.activeFilters(),
      };

      // Save sort config only for non-timeline views (timeline uses sortBy for legacy endDate)
      if (currentViewType !== 'timeline') {
        const sort = this.activeSort();
        if (sort) {
          updatedViewConfig.sortBy = sort.columnId;
          updatedViewConfig.sortOrder = sort.order;
        } else {
          // Remove sort properties if no sort is active
          const { sortBy, sortOrder, ...rest } = updatedViewConfig;
          updatedViewConfig = rest;
        }
      }

      // Save kanban groupBy
      if (currentViewType === 'kanban') {
        updatedViewConfig.groupBy = this.kanbanGroupByColumnId();
      }

      // Save calendar view config using dedicated fields
      if (currentViewType === 'calendar') {
        updatedViewConfig.calendarDateColumnId = this.calendarDateColumnId();
        updatedViewConfig.calendarDateRangeColumnId = this.calendarDateRangeColumnId();
        // Keep legacy groupBy for backward compatibility
        updatedViewConfig.groupBy = this.calendarDateColumnId() || this.calendarDateRangeColumnId();
      }

      // Save timeline view config using dedicated fields
      if (currentViewType === 'timeline') {
        updatedViewConfig.timelineStartDateColumnId = this.timelineStartDateColumnId();
        updatedViewConfig.timelineEndDateColumnId = this.timelineEndDateColumnId();
        updatedViewConfig.timelineDateRangeColumnId = this.timelineDateRangeColumnId();
        updatedViewConfig.timelineGranularity = this.timelineGranularity();
        // Keep legacy fields for backward compatibility
        updatedViewConfig.groupBy = this.timelineStartDateColumnId() || this.timelineDateRangeColumnId();
        updatedViewConfig.sortBy = this.timelineEndDateColumnId();
      }

      // Update the view in the array immutably
      views[viewIndex] = {
        ...views[viewIndex],
        config: updatedViewConfig,
      };

      return {
        ...config,
        views,
      };
    });

    // Persist to Supabase only (don't sync to TipTap for view changes)
    // View preferences are stored in Supabase, not in the TipTap document
    // Syncing to TipTap can cause the component to be re-created, losing state
    const configToSave = this.databaseConfig();

    this.databaseService
      .updateDatabaseConfig(this.databaseId, configToSave)
      .subscribe({
        error: (err) => {
          console.error('Failed to save view config to Supabase:', err);
        },
      });
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

  /**
   * Handle column selection from Kanban column selector menu
   */
  onKanbanSelectGroupByColumn(columnId: string): void {
    this.kanbanGroupByColumnId.set(columnId);
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
    // First, check for date-range columns
    const dateRangeColumn = this.databaseConfig().columns.find(
      (col) => col.type === 'date-range'
    );

    if (dateRangeColumn) {
      this.calendarDateRangeColumnId.set(dateRangeColumn.id);
      this.calendarDateColumnId.set(undefined);
      this.saveCurrentViewConfig();
      return;
    }

    // Then check for regular date columns
    const dateColumn = this.databaseConfig().columns.find(
      (col) => col.type === 'date'
    );

    if (dateColumn) {
      this.calendarDateColumnId.set(dateColumn.id);
      this.calendarDateRangeColumnId.set(undefined);
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
    // Find all date and date-range columns
    const dateColumns = this.databaseConfig().columns.filter(
      (col) => col.type === 'date'
    );
    const dateRangeColumns = this.databaseConfig().columns.filter(
      (col) => col.type === 'date-range'
    );

    // Combine all date-related columns for cycling
    const allDateColumns = [...dateRangeColumns, ...dateColumns];

    if (allDateColumns.length === 0) {
      this.onAddColumn();
      return;
    }

    // Determine current selection
    const currentDateRangeCol = this.calendarDateRangeColumnId();
    const currentDateCol = this.calendarDateColumnId();
    const currentId = currentDateRangeCol || currentDateCol;

    // Find current index
    const currentIndex = allDateColumns.findIndex(
      (col) => col.id === currentId
    );
    const nextIndex = (currentIndex + 1) % allDateColumns.length;
    const nextColumn = allDateColumns[nextIndex];

    if (nextColumn.type === 'date-range') {
      // Use date-range column
      this.calendarDateRangeColumnId.set(nextColumn.id);
      this.calendarDateColumnId.set(undefined);
    } else {
      // Use regular date column
      this.calendarDateRangeColumnId.set(undefined);
      this.calendarDateColumnId.set(nextColumn.id);
    }

    this.saveCurrentViewConfig();
  }

  /**
   * Handle column selection from Calendar dropdown
   */
  onCalendarSelectDateColumn(event: { columnId: string; isDateRange: boolean }): void {
    if (event.isDateRange) {
      this.calendarDateRangeColumnId.set(event.columnId);
      this.calendarDateColumnId.set(undefined);
    } else {
      this.calendarDateRangeColumnId.set(undefined);
      this.calendarDateColumnId.set(event.columnId);
    }
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
    // First, check for date-range columns
    const dateRangeColumn = this.databaseConfig().columns.find(
      (col) => col.type === 'date-range'
    );

    if (dateRangeColumn) {
      this.timelineDateRangeColumnId.set(dateRangeColumn.id);
      this.timelineStartDateColumnId.set(undefined);
      this.timelineEndDateColumnId.set(undefined);
      this.saveCurrentViewConfig();
      return;
    }

    // Then check for regular date columns
    const dateColumn = this.databaseConfig().columns.find(
      (col) => col.type === 'date'
    );

    if (dateColumn) {
      this.timelineStartDateColumnId.set(dateColumn.id);
      this.timelineDateRangeColumnId.set(undefined);
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
    // Find all date and date-range columns
    const dateColumns = this.databaseConfig().columns.filter(
      (col) => col.type === 'date'
    );
    const dateRangeColumns = this.databaseConfig().columns.filter(
      (col) => col.type === 'date-range'
    );

    // Combine all date-related columns for cycling
    const allDateColumns = [...dateRangeColumns, ...dateColumns];

    if (allDateColumns.length === 0) {
      this.onAddColumn();
      return;
    }

    // Determine current selection
    const currentDateRangeCol = this.timelineDateRangeColumnId();
    const currentStartDateCol = this.timelineStartDateColumnId();
    const currentId = currentDateRangeCol || currentStartDateCol;

    // Find current index
    const currentIndex = allDateColumns.findIndex(
      (col) => col.id === currentId
    );
    const nextIndex = (currentIndex + 1) % allDateColumns.length;
    const nextColumn = allDateColumns[nextIndex];

    if (nextColumn.type === 'date-range') {
      // Use date-range column
      this.timelineDateRangeColumnId.set(nextColumn.id);
      this.timelineStartDateColumnId.set(undefined);
      this.timelineEndDateColumnId.set(undefined);
    } else {
      // Use regular date column
      this.timelineDateRangeColumnId.set(undefined);
      this.timelineStartDateColumnId.set(nextColumn.id);

      // Optionally set the next date column as end date
      if (dateColumns.length > 1) {
        const nextDateIdx = dateColumns.findIndex(col => col.id === nextColumn.id);
        const endIndex = (nextDateIdx + 1) % dateColumns.length;
        this.timelineEndDateColumnId.set(dateColumns[endIndex].id);
      }
    }

    this.saveCurrentViewConfig();
  }

  /**
   * Handle column selection from Timeline dropdown
   */
  onTimelineSelectDateColumn(event: { columnId: string; isDateRange: boolean }): void {
    if (event.isDateRange) {
      this.timelineDateRangeColumnId.set(event.columnId);
      this.timelineStartDateColumnId.set(undefined);
      this.timelineEndDateColumnId.set(undefined);
    } else {
      this.timelineDateRangeColumnId.set(undefined);
      this.timelineStartDateColumnId.set(event.columnId);
      // Clear end date when selecting a new start date column
      this.timelineEndDateColumnId.set(undefined);
    }
    this.saveCurrentViewConfig();
  }

  /**
   * Handle granularity change from Timeline view
   */
  onTimelineGranularityChange(granularity: TimelineGranularity): void {
    this.timelineGranularity.set(granularity);
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

  // =====================================================================
  // Column Resize Methods
  // =====================================================================

  /**
   * Initialize column widths from database config
   */
  private initializeColumnWidths(columns: DatabaseColumn[]): void {
    const widths: Record<string, number> = {};
    columns.forEach(col => {
      widths[col.id] = col.width ?? DEFAULT_COLUMN_WIDTHS[col.type] ?? 200;
    });
    this.columnWidths.set(widths);
  }

  /**
   * Get the width of a column
   */
  getColumnWidth(columnId: string): number {
    return this.columnWidths()[columnId] ?? 200;
  }

  /**
   * Start resizing a column
   */
  startColumnResize(event: MouseEvent, columnId: string): void {
    event.preventDefault();
    event.stopPropagation();

    const startWidth = this.getColumnWidth(columnId);
    this.resizing.set({ columnId, startX: event.clientX, startWidth });

    const onMouseMove = (e: MouseEvent) => this.onResizeMove(e);
    const onMouseUp = () => {
      this.onResizeEnd();
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  /**
   * Handle resize mouse move
   */
  private onResizeMove(event: MouseEvent): void {
    const state = this.resizing();
    if (!state) return;

    const delta = event.clientX - state.startX;
    const newWidth = Math.max(80, state.startWidth + delta);

    this.columnWidths.update(widths => ({
      ...widths,
      [state.columnId]: newWidth,
    }));
  }

  /**
   * Handle resize end — persist to Supabase
   */
  private onResizeEnd(): void {
    const state = this.resizing();
    if (!state) return;

    const newWidth = this.getColumnWidth(state.columnId);

    // Update local config
    this.databaseConfig.update(config => ({
      ...config,
      columns: config.columns.map(col =>
        col.id === state.columnId ? { ...col, width: newWidth } : col
      ),
    }));

    // Persist to Supabase
    this.databaseService
      .updateDatabaseConfig(this.databaseId, this.databaseConfig())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => this.syncToTipTap(),
        error: (err) => console.error('Failed to persist column width:', err),
      });

    this.resizing.set(null);
  }

  // =====================================================================
  // Column Drag-and-Drop Methods
  // =====================================================================

  /**
   * Start dragging a column header
   */
  startColumnDrag(event: MouseEvent, columnId: string): void {
    // Don't start drag if resizing
    if (this.isResizing()) return;

    // Only start on left click
    if (event.button !== 0) return;

    event.preventDefault();

    this.draggingColumn.set({
      columnId,
      startX: event.clientX,
      currentX: event.clientX,
      isDragging: false,
    });

    const onMouseMove = (e: MouseEvent) => this.onDragMove(e);
    const onMouseUp = () => {
      this.onDragEnd();
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  /**
   * Handle drag mouse move
   */
  private onDragMove(event: MouseEvent): void {
    const state = this.draggingColumn();
    if (!state) return;

    // Activate drag only after a 5px threshold
    if (!state.isDragging && Math.abs(event.clientX - state.startX) < 5) {
      return;
    }

    if (!state.isDragging) {
      this.draggingColumn.update(s => s ? { ...s, isDragging: true } : null);
    }

    this.draggingColumn.update(s => s ? { ...s, currentX: event.clientX } : null);

    // Find which column we're over
    const elements = document.elementsFromPoint(event.clientX, event.clientY);
    const headerEl = elements.find(el => el.classList.contains('column-header')) as HTMLElement | undefined;

    if (headerEl) {
      const colId = headerEl.getAttribute('data-column-id');
      if (colId && colId !== state.columnId) {
        const rect = headerEl.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        const position: 'before' | 'after' = event.clientX < midX ? 'before' : 'after';

        this.dragOverColumnId.set(colId);
        this.dropPosition.set(position);
      } else {
        this.dragOverColumnId.set(null);
        this.dropPosition.set(null);
      }
    } else {
      this.dragOverColumnId.set(null);
      this.dropPosition.set(null);
    }
  }

  /**
   * Handle drag end — reorder and persist
   */
  private onDragEnd(): void {
    const state = this.draggingColumn();
    const targetColumnId = this.dragOverColumnId();
    const position = this.dropPosition();

    // Reset drag state
    this.draggingColumn.set(null);
    this.dragOverColumnId.set(null);
    this.dropPosition.set(null);

    // If no valid drop target or drag wasn't activated, trigger header click for sorting
    if (!state?.isDragging || !targetColumnId || !position) {
      if (state && !state.isDragging) {
        // Was just a click, let the header click handler deal with it
        return;
      }
      return;
    }

    // Reorder columns
    this.reorderColumns(state.columnId, targetColumnId, position);
  }

  /**
   * Reorder columns: move source before/after target, then recalculate all orders
   */
  private reorderColumns(sourceId: string, targetId: string, position: 'before' | 'after'): void {
    const columns = [...this.sortedColumns()];
    const allColumns = [...this.databaseConfig().columns];

    const sourceIndex = columns.findIndex(c => c.id === sourceId);
    let targetIndex = columns.findIndex(c => c.id === targetId);

    if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return;

    // Remove source from array
    const [movedCol] = columns.splice(sourceIndex, 1);

    // Recalculate target index after removal
    targetIndex = columns.findIndex(c => c.id === targetId);
    const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;

    // Insert at new position
    columns.splice(insertIndex, 0, movedCol);

    // Recalculate order values for visible columns
    const orderMap = new Map<string, number>();
    columns.forEach((col, index) => {
      orderMap.set(col.id, index);
    });

    // Update all columns (visible and hidden) with new order values
    const updatedColumns = allColumns.map(col => {
      const newOrder = orderMap.get(col.id);
      if (newOrder !== undefined) {
        return { ...col, order: newOrder };
      }
      return col;
    });

    // Update local config
    this.databaseConfig.update(config => ({
      ...config,
      columns: updatedColumns,
    }));

    // Persist to Supabase
    this.databaseService
      .updateDatabaseConfig(this.databaseId, this.databaseConfig())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => this.syncToTipTap(),
        error: (err) => console.error('Failed to persist column order:', err),
      });
  }

  // ── Cell tooltip ──

  onCellMouseEnter(event: MouseEvent, value: CellValue): void {
    if (!value || typeof value !== 'string' || value.trim() === '') {
      return;
    }

    const target = event.target as HTMLInputElement;
    // Only show tooltip if text is actually truncated
    if (target.scrollWidth <= target.clientWidth) {
      return;
    }

    this.tooltipTimeout = setTimeout(() => {
      const rect = target.getBoundingClientRect();
      this.tooltipState.set({
        text: value,
        x: rect.left,
        y: rect.bottom + 6,
        visible: true,
      });
    }, 400);
  }

  onCellMouseLeave(): void {
    if (this.tooltipTimeout) {
      clearTimeout(this.tooltipTimeout);
      this.tooltipTimeout = null;
    }
    if (this.tooltipState().visible) {
      this.tooltipState.set({ text: '', x: 0, y: 0, visible: false });
    }
  }

  ngOnDestroy() {
    if (this.tooltipTimeout) {
      clearTimeout(this.tooltipTimeout);
    }
    this.destroy$.next();
    this.destroy$.complete();
  }
}
