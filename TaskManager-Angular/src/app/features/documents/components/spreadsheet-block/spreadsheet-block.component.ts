import {
  Component,
  Input,
  OnInit,
  OnDestroy,
  AfterViewChecked,
  AfterViewInit,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ViewEncapsulation,
  ElementRef,
  ViewChildren,
  ViewChild,
  QueryList,
  NgZone,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Subject, debounceTime, takeUntil } from 'rxjs';

import { SpreadsheetService } from '../../services/spreadsheet.service';
import { SpreadsheetIOService } from '../../services/spreadsheet-io.service';
import { FormulaEngineService, FormulaFunction } from '../../services/formula-engine.service';
import {
  SpreadsheetConfig,
  SpreadsheetCell,
  SpreadsheetNodeAttributes,
  SpreadsheetSheet,
  CellAddress,
  SelectionState,
  EditingState,
  getCellKey,
  createDefaultSpreadsheetConfig,
  SpreadsheetCellUpdate,
  SpreadsheetCellValue,
  CellErrorType,
  CellFormat,
  NumberFormatPattern,
  normalizeRange,
  DEFAULT_BORDER_STYLE,
} from '../../models/spreadsheet.model';
import { FormattingToolbarComponent, FormatAction } from './formatting-toolbar/formatting-toolbar.component';
import { SpreadsheetImportDialogComponent } from './import-dialog/import-dialog.component';
import { SpreadsheetImportResult } from '../../models/spreadsheet.model';

/**
 * SpreadsheetBlockComponent
 *
 * Main orchestrator component for the Excel-like spreadsheet.
 * Handles initialization, state management, and coordination between sub-components.
 */
@Component({
  selector: 'app-spreadsheet-block',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatDialogModule,
    FormattingToolbarComponent,
  ],
  templateUrl: './spreadsheet-block.component.html',
  styleUrl: './spreadsheet-block.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class SpreadsheetBlockComponent implements OnInit, OnDestroy, AfterViewChecked, AfterViewInit {
  private spreadsheetService = inject(SpreadsheetService);
  private formulaEngine = inject(FormulaEngineService);
  private ioService = inject(SpreadsheetIOService);
  private dialog = inject(MatDialog);
  private ngZone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);
  private destroy$ = new Subject<void>();

  // Reference to cell input for focus management
  @ViewChildren('cellInput') cellInputs!: QueryList<ElementRef<HTMLInputElement>>;
  @ViewChild('gridWrapper') gridWrapperRef!: ElementRef<HTMLDivElement>;
  private shouldFocusInput = false;

  // =====================================================================
  // Inputs
  // =====================================================================

  @Input() spreadsheetId = '';
  @Input() documentId = '';
  @Input() config: SpreadsheetConfig = createDefaultSpreadsheetConfig();
  @Input() storageMode: 'supabase' = 'supabase';
  @Input() onDataChange?: (attrs: SpreadsheetNodeAttributes) => void;

  // =====================================================================
  // State Signals
  // =====================================================================

  // Loading state
  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly error = signal<string | null>(null);

  // Cell data
  readonly cells = signal<Map<string, SpreadsheetCell>>(new Map());
  // Version signal to force re-render when cells change
  readonly cellsVersion = signal(0);

  // Selection state
  readonly activeCell = signal<CellAddress | null>(null);
  readonly selection = signal<SelectionState | null>(null);

  // Editing state
  readonly editingCell = signal<EditingState | null>(null);
  readonly formulaBarValue = signal('');

  // Formula autocompletion state
  readonly showFormulaAutocomplete = signal(false);
  readonly formulaSuggestions = signal<FormulaFunction[]>([]);
  readonly selectedSuggestionIndex = signal(0);

  // Sheet state
  readonly activeSheetId = signal('');
  readonly sheets = signal<SpreadsheetSheet[]>([]);

  // =====================================================================
  // Virtual Scrolling State
  // =====================================================================

  // Viewport dimensions
  readonly viewportHeight = signal(600);
  readonly viewportWidth = signal(800);
  readonly scrollTop = signal(0);
  readonly scrollLeft = signal(0);

  // Default dimensions
  private readonly DEFAULT_ROW_HEIGHT = 24;
  private readonly DEFAULT_COL_WIDTH = 100;
  private readonly ROW_HEADER_WIDTH = 50;
  private readonly COL_HEADER_HEIGHT = 24;
  private readonly BUFFER_ROWS = 5; // Extra rows for smooth scrolling
  private readonly BUFFER_COLS = 2; // Extra columns for smooth scrolling

  // Total grid dimensions (for scrollable area)
  readonly totalRows = signal(1000); // Can be dynamically adjusted
  readonly totalCols = signal(26); // A-Z initially

  // Computed visible range based on scroll position
  readonly visibleRowStart = computed(() => {
    const rowHeight = this.activeSheet()?.defaultRowHeight || this.DEFAULT_ROW_HEIGHT;
    return Math.max(0, Math.floor(this.scrollTop() / rowHeight) - this.BUFFER_ROWS);
  });

  readonly visibleRowEnd = computed(() => {
    const rowHeight = this.activeSheet()?.defaultRowHeight || this.DEFAULT_ROW_HEIGHT;
    const visibleCount = Math.ceil(this.viewportHeight() / rowHeight);
    return Math.min(
      this.visibleRowStart() + visibleCount + this.BUFFER_ROWS * 2,
      this.totalRows()
    );
  });

  readonly visibleColStart = computed(() => {
    const colWidth = this.activeSheet()?.defaultColWidth || this.DEFAULT_COL_WIDTH;
    return Math.max(0, Math.floor(this.scrollLeft() / colWidth) - this.BUFFER_COLS);
  });

  readonly visibleColEnd = computed(() => {
    const colWidth = this.activeSheet()?.defaultColWidth || this.DEFAULT_COL_WIDTH;
    const visibleCount = Math.ceil(this.viewportWidth() / colWidth);
    return Math.min(
      this.visibleColStart() + visibleCount + this.BUFFER_COLS * 2,
      this.totalCols()
    );
  });

  // Total grid size for scrollable container
  readonly totalGridHeight = computed(() => {
    const rowHeight = this.activeSheet()?.defaultRowHeight || this.DEFAULT_ROW_HEIGHT;
    return this.totalRows() * rowHeight;
  });

  readonly totalGridWidth = computed(() => {
    const colWidth = this.activeSheet()?.defaultColWidth || this.DEFAULT_COL_WIDTH;
    return this.totalCols() * colWidth;
  });

  // Offset for positioning visible cells
  readonly offsetY = computed(() => {
    const rowHeight = this.activeSheet()?.defaultRowHeight || this.DEFAULT_ROW_HEIGHT;
    return this.visibleRowStart() * rowHeight;
  });

  readonly offsetX = computed(() => {
    const colWidth = this.activeSheet()?.defaultColWidth || this.DEFAULT_COL_WIDTH;
    return this.visibleColStart() * colWidth;
  });

  // =====================================================================
  // Computed Values
  // =====================================================================

  readonly activeSheet = computed(() => {
    const sheetId = this.activeSheetId();
    return this.sheets().find(s => s.id === sheetId) || this.sheets()[0];
  });

  readonly activeCellData = computed(() => {
    const cell = this.activeCell();
    if (!cell) return null;

    const key = getCellKey({ ...cell, sheet: this.activeSheetId() });
    return this.cells().get(key) || null;
  });

  readonly activeCellDisplayValue = computed(() => {
    const cellData = this.activeCellData();
    if (!cellData) return '';

    // Show formula if exists, otherwise raw value
    if (cellData.formula) {
      return cellData.formula;
    }
    return cellData.raw_value?.toString() || '';
  });

  // Visible rows array for rendering
  readonly visibleRows = computed(() => {
    const start = this.visibleRowStart();
    const end = this.visibleRowEnd();
    return Array.from({ length: end - start }, (_, i) => start + i);
  });

  // Visible columns array for rendering
  readonly visibleCols = computed(() => {
    const start = this.visibleColStart();
    const end = this.visibleColEnd();
    return Array.from({ length: end - start }, (_, i) => start + i);
  });

  // Active cell format for toolbar
  readonly activeCellFormat = computed(() => {
    return this.activeCellData()?.format;
  });

  // Check if current selection has multiple cells
  readonly hasMultiCellSelection = computed(() => {
    const sel = this.selection();
    if (!sel) return false;
    return sel.anchor.row !== sel.focus.row || sel.anchor.col !== sel.focus.col;
  });

  // Check if active cell is merged
  readonly isActiveCellMerged = computed(() => {
    const cellData = this.activeCellData();
    return !!(cellData?.merge && (cellData.merge.rowSpan > 1 || cellData.merge.colSpan > 1));
  });

  // =====================================================================
  // Save Queue & Dirty Cell Tracking
  // =====================================================================

  private saveQueue = new Subject<{
    sheetId: string;
    row: number;
    col: number;
    update: SpreadsheetCellUpdate;
  }[]>();

  private pendingUpdates: Map<string, {
    sheetId: string;
    row: number;
    col: number;
    update: SpreadsheetCellUpdate;
  }> = new Map();

  // Track cells that need recalculation (dirty cells)
  private dirtyCells = new Set<string>();
  private recalculationScheduled = false;

  // Lazy loading state - tracks loaded cell ranges
  private loadedRanges = signal<Array<{
    rowStart: number;
    rowEnd: number;
    colStart: number;
    colEnd: number;
  }>>([]);
  private isLazyLoading = signal(false);
  private pendingLazyLoad: { rowStart: number; rowEnd: number; colStart: number; colEnd: number } | null = null;
  private readonly LAZY_LOAD_BUFFER = 20; // Buffer around viewport for preloading

  constructor() {
    // Setup debounced save
    this.saveQueue.pipe(
      debounceTime(2000),
      takeUntil(this.destroy$)
    ).subscribe(updates => {
      this.saveCells(updates);
    });

    // Track dirty state (pendingUpdates is tracked internally)
  }

  // =====================================================================
  // Lifecycle
  // =====================================================================

  ngOnInit() {
    this.initializeSpreadsheet();
  }

  ngAfterViewChecked() {
    // Focus cell input after view updates
    if (this.shouldFocusInput && this.cellInputs?.first) {
      this.cellInputs.first.nativeElement.focus();
      this.shouldFocusInput = false;
    }
  }

  ngAfterViewInit() {
    // Initialize viewport dimensions and scroll listeners
    this.initializeVirtualScroll();
  }

  ngOnDestroy() {
    // Save any pending changes before destroying
    if (this.pendingUpdates.size > 0) {
      this.saveCells(Array.from(this.pendingUpdates.values()));
    }

    // Cleanup virtual scroll resources
    this.cleanupVirtualScroll();

    // Destroy formula engine
    this.formulaEngine.destroy();

    this.destroy$.next();
    this.destroy$.complete();
  }

  // =====================================================================
  // Initialization
  // =====================================================================

  async initializeSpreadsheet() {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      // Check if spreadsheet needs to be created (lazy creation)
      if (!this.spreadsheetId) {
        await this.createNewSpreadsheet();
      } else {
        await this.loadExistingSpreadsheet();
      }

      // Initialize sheets from config
      this.sheets.set(this.config.sheets || []);
      this.activeSheetId.set(this.config.activeSheetId || this.config.sheets?.[0]?.id || '');

      // Load cells for active sheet
      await this.loadCellsForActiveSheet();

      this.isLoading.set(false);
    } catch (err) {
      console.error('[SpreadsheetBlock] Initialization error:', err);
      this.error.set(err instanceof Error ? err.message : 'Failed to initialize spreadsheet');
      this.isLoading.set(false);
    }
  }

  private async createNewSpreadsheet() {
    return new Promise<void>((resolve, reject) => {
      this.spreadsheetService.createSpreadsheet({
        documentId: this.documentId,
        config: this.config,
      }).subscribe({
        next: (response) => {
          this.spreadsheetId = response.spreadsheetId;

          // Notify parent (TipTap) of the new ID
          this.notifyDataChange();

          resolve();
        },
        error: reject,
      });
    });
  }

  private async loadExistingSpreadsheet() {
    return new Promise<void>((resolve, reject) => {
      this.spreadsheetService.getSpreadsheetMetadata(this.spreadsheetId).subscribe({
        next: (metadata) => {
          this.config = metadata.config as SpreadsheetConfig;
          resolve();
        },
        error: (err) => {
          // If not found, create new
          if (err.code === 'PGRST116') {
            this.createNewSpreadsheet().then(resolve).catch(reject);
          } else {
            reject(err);
          }
        },
      });
    });
  }

  private async loadCellsForActiveSheet() {
    const sheetId = this.activeSheetId();
    if (!sheetId) return;

    return new Promise<void>((resolve, reject) => {
      this.spreadsheetService.loadCells(this.spreadsheetId, sheetId).subscribe({
        next: (cellMap) => {
          this.cells.set(cellMap);

          // Load cells into formula engine for calculation
          this.formulaEngine.loadCells(sheetId, cellMap);

          // Recalculate all formulas and update computed values
          this.recalculateFormulas();

          resolve();
        },
        error: reject,
      });
    });
  }

  /**
   * Recalculate all formulas and update cell computed values
   */
  private recalculateFormulas(): void {
    const computedValues = this.formulaEngine.recalculate();

    if (computedValues.size === 0) return;

    // Update cells with computed values
    const currentCells = this.cells();
    const newCells = new Map(currentCells);

    computedValues.forEach((value, key) => {
      const cell = newCells.get(key);
      if (cell) {
        newCells.set(key, {
          ...cell,
          computed_value: value,
        });
      }
    });

    this.cells.set(newCells);
  }

  /**
   * Mark a cell as dirty and schedule recalculation
   */
  private markCellDirty(sheetId: string, row: number, col: number): void {
    const key = getCellKey({ row, col, sheet: sheetId });
    this.dirtyCells.add(key);

    // Schedule recalculation on next microtask (batches multiple changes)
    if (!this.recalculationScheduled) {
      this.recalculationScheduled = true;
      queueMicrotask(() => this.processDirtyCells());
    }
  }

  /**
   * Process all dirty cells and recalculate their values
   */
  private processDirtyCells(): void {
    if (this.dirtyCells.size === 0) {
      this.recalculationScheduled = false;
      return;
    }

    // Convert dirty cells to array format
    const cellsToRecalculate: Array<{ sheetId: string; row: number; col: number }> = [];
    this.dirtyCells.forEach(key => {
      const [sheetId, rowStr, colStr] = key.split(':');
      cellsToRecalculate.push({
        sheetId,
        row: parseInt(rowStr, 10),
        col: parseInt(colStr, 10),
      });
    });

    // Clear dirty cells
    this.dirtyCells.clear();
    this.recalculationScheduled = false;

    // Use optimized recalculation
    const computedValues = this.formulaEngine.recalculateCells(cellsToRecalculate);

    if (computedValues.size === 0) return;

    // Update cells with computed values
    const currentCells = this.cells();
    const newCells = new Map(currentCells);

    computedValues.forEach((value, key) => {
      const cell = newCells.get(key);
      if (cell) {
        newCells.set(key, {
          ...cell,
          computed_value: value,
        });
      }
    });

    this.cells.set(newCells);
  }

  // =====================================================================
  // Cell Operations
  // =====================================================================

  /**
   * Get cell value for display
   */
  getCellValue(row: number, col: number): string {
    const key = getCellKey({ row, col, sheet: this.activeSheetId() });
    const cell = this.cells().get(key);

    if (!cell) return '';

    // Show computed value if formula exists
    if (cell.formula && cell.computed_value !== undefined) {
      return cell.computed_value?.toString() || '';
    }

    return cell.raw_value?.toString() || '';
  }

  /**
   * Update cell value
   */
  updateCellValue(row: number, col: number, value: SpreadsheetCellValue) {
    const sheetId = this.activeSheetId();
    const key = getCellKey({ row, col, sheet: sheetId });

    // Determine if value is a formula
    const isFormula = typeof value === 'string' && value.startsWith('=');

    // Create or update cell in local state
    const existingCell = this.cells().get(key);
    const update: SpreadsheetCellUpdate = isFormula
      ? { formula: value as string, raw_value: null }
      : { raw_value: value, formula: null };

    // Update formula engine
    this.formulaEngine.setCellValue(sheetId, row, col, value ?? '');

    // Get computed value from formula engine if it's a formula
    let computedValue: SpreadsheetCellValue | CellErrorType = null;
    if (isFormula) {
      computedValue = this.formulaEngine.getCellValue(sheetId, row, col);
    }

    const updatedCell: SpreadsheetCell = {
      id: existingCell?.id || crypto.randomUUID(),
      spreadsheet_id: this.spreadsheetId,
      sheet_id: sheetId,
      row,
      col,
      raw_value: update.raw_value ?? existingCell?.raw_value ?? null,
      formula: update.formula ?? existingCell?.formula,
      computed_value: isFormula ? computedValue : value,
      format: existingCell?.format,
      created_at: existingCell?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Update local state immediately (optimistic update)
    const newCells = new Map(this.cells());
    newCells.set(key, updatedCell);

    // Recalculate dependent cells
    this.updateDependentCells(sheetId, row, col, newCells);

    this.cells.set(newCells);

    // Queue for save
    this.queueCellUpdate(sheetId, row, col, update);
  }

  /**
   * Update cells that depend on the changed cell
   * Uses the optimized dirty cell tracking system
   */
  private updateDependentCells(
    sheetId: string,
    row: number,
    col: number,
    cellsMap: Map<string, SpreadsheetCell>
  ): void {
    // Get cells that depend on this cell
    const dependents = this.formulaEngine.getCellDependents(sheetId, row, col);

    dependents.forEach(dep => {
      const depKey = getCellKey({ row: dep.row, col: dep.col, sheet: dep.sheet || sheetId });
      const depCell = cellsMap.get(depKey);

      if (depCell && depCell.formula) {
        // Get recalculated value from formula engine
        const newValue = this.formulaEngine.getCellValue(dep.sheet || sheetId, dep.row, dep.col);

        cellsMap.set(depKey, {
          ...depCell,
          computed_value: newValue,
          updated_at: new Date().toISOString(),
        });

        // Mark dependent for further recalculation (catches nested dependencies)
        this.markCellDirty(dep.sheet || sheetId, dep.row, dep.col);
      }
    });
  }

  /**
   * Queue cell update for debounced save
   */
  private queueCellUpdate(
    sheetId: string,
    row: number,
    col: number,
    update: SpreadsheetCellUpdate
  ) {
    const key = `${sheetId}:${row}:${col}`;
    this.pendingUpdates.set(key, { sheetId, row, col, update });

    // Trigger save queue
    this.saveQueue.next(Array.from(this.pendingUpdates.values()));
  }

  /**
   * Save cells to database
   */
  private saveCells(updates: Array<{
    sheetId: string;
    row: number;
    col: number;
    update: SpreadsheetCellUpdate;
  }>) {
    if (updates.length === 0) return;

    this.isSaving.set(true);

    this.spreadsheetService.batchUpdateCells(this.spreadsheetId, updates).subscribe({
      next: () => {
        // Clear saved updates from pending
        updates.forEach(u => {
          const key = `${u.sheetId}:${u.row}:${u.col}`;
          this.pendingUpdates.delete(key);
        });

        this.isSaving.set(false);
      },
      error: (err) => {
        console.error('[SpreadsheetBlock] Save error:', err);
        this.isSaving.set(false);
        // Keep updates in pending for retry
      },
    });
  }

  // =====================================================================
  // Selection & Navigation
  // =====================================================================

  /**
   * Handle cell click
   */
  onCellClick(row: number, col: number, event?: MouseEvent) {
    // Exit editing mode if clicking different cell
    if (this.editingCell()) {
      this.exitEditMode();
    }

    // Update selection
    if (event?.shiftKey) {
      // Extend selection from current anchor (or active cell if no selection)
      const currentSelection = this.selection();
      const anchor = currentSelection?.anchor || this.activeCell() || { row, col };
      this.selection.set({
        type: 'range',
        anchor,
        focus: { row, col },
      });
    } else {
      // Single cell selection - set new anchor
      this.selection.set({
        type: 'cell',
        anchor: { row, col },
        focus: { row, col },
      });
    }

    // Update active cell AFTER handling selection
    this.activeCell.set({ row, col });

    // Update formula bar
    this.updateFormulaBar();
  }

  /**
   * Handle cell double-click to enter edit mode
   */
  onCellDoubleClick(row: number, col: number) {
    this.enterEditMode(row, col, 'input');
  }

  /**
   * Enter edit mode for a cell
   */
  enterEditMode(row: number, col: number, mode: 'input' | 'formula') {
    const value = this.activeCellDisplayValue();
    this.editingCell.set({
      cell: { row, col },
      value,
      mode,
    });
    // Trigger focus on next view check
    this.shouldFocusInput = true;
  }

  /**
   * Exit edit mode and save value
   */
  exitEditMode(save = true) {
    const editing = this.editingCell();
    if (!editing) return;

    if (save) {
      this.updateCellValue(editing.cell.row, editing.cell.col, editing.value);
    }

    this.editingCell.set(null);
  }

  /**
   * Update formula bar with active cell value
   */
  private updateFormulaBar() {
    this.formulaBarValue.set(this.activeCellDisplayValue());
  }

  // =====================================================================
  // Keyboard Navigation
  // =====================================================================

  /**
   * Handle keyboard events
   */
  onKeyDown(event: KeyboardEvent) {
    const editing = this.editingCell();

    if (editing) {
      this.handleEditingKeyDown(event);
    } else {
      this.handleNavigationKeyDown(event);
    }
  }

  /**
   * Handle keydown on cell input - stop propagation for regular typing
   */
  onCellInputKeyDown(event: KeyboardEvent) {
    // Handle special keys
    switch (event.key) {
      case 'Enter':
        this.exitEditMode(true);
        this.moveActiveCell(1, 0);
        event.preventDefault();
        event.stopPropagation();
        break;
      case 'Tab':
        this.exitEditMode(true);
        this.moveActiveCell(0, event.shiftKey ? -1 : 1);
        event.preventDefault();
        event.stopPropagation();
        break;
      case 'Escape':
        this.exitEditMode(false);
        event.preventDefault();
        event.stopPropagation();
        break;
      case 'ArrowUp':
      case 'ArrowDown':
        // Handle autocompletion navigation
        if (this.showFormulaAutocomplete()) {
          this.navigateAutocomplete(event.key === 'ArrowUp' ? 'up' : 'down');
          event.preventDefault();
        }
        event.stopPropagation();
        break;
      default:
        // Let all other keys through for typing, but stop propagation
        // to prevent the container keydown from handling them
        event.stopPropagation();
    }
  }

  private handleEditingKeyDown(event: KeyboardEvent) {
    // Handle autocompletion navigation first
    if (this.showFormulaAutocomplete()) {
      switch (event.key) {
        case 'ArrowUp':
          this.navigateAutocomplete('up');
          event.preventDefault();
          return;
        case 'ArrowDown':
          this.navigateAutocomplete('down');
          event.preventDefault();
          return;
        case 'Tab':
        case 'Enter':
          if (this.confirmAutocompleteSelection()) {
            event.preventDefault();
            return;
          }
          break;
        case 'Escape':
          this.hideFormulaAutocomplete();
          event.preventDefault();
          return;
      }
    }

    switch (event.key) {
      case 'Enter':
        this.exitEditMode(true);
        this.moveActiveCell(1, 0); // Move down
        event.preventDefault();
        break;
      case 'Tab':
        this.exitEditMode(true);
        this.moveActiveCell(0, event.shiftKey ? -1 : 1);
        event.preventDefault();
        break;
      case 'Escape':
        this.exitEditMode(false);
        event.preventDefault();
        break;
    }
  }

  private handleNavigationKeyDown(event: KeyboardEvent) {
    const active = this.activeCell();
    if (!active) return;

    switch (event.key) {
      case 'ArrowUp':
        this.moveActiveCell(-1, 0);
        event.preventDefault();
        break;
      case 'ArrowDown':
        this.moveActiveCell(1, 0);
        event.preventDefault();
        break;
      case 'ArrowLeft':
        this.moveActiveCell(0, -1);
        event.preventDefault();
        break;
      case 'ArrowRight':
        this.moveActiveCell(0, 1);
        event.preventDefault();
        break;
      case 'Enter':
        this.enterEditMode(active.row, active.col, 'input');
        event.preventDefault();
        break;
      case 'Tab':
        this.moveActiveCell(0, event.shiftKey ? -1 : 1);
        event.preventDefault();
        break;
      case 'F2':
        this.enterEditMode(active.row, active.col, 'input');
        event.preventDefault();
        break;
      case 'Delete':
      case 'Backspace':
        this.clearActiveCell();
        event.preventDefault();
        break;
      default:
        // Start typing to enter edit mode
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
          this.enterEditMode(active.row, active.col, 'input');
          // Let the key event propagate to the input
        }
    }
  }

  private moveActiveCell(rowDelta: number, colDelta: number) {
    const active = this.activeCell();
    if (!active) return;

    const newRow = Math.max(0, active.row + rowDelta);
    const newCol = Math.max(0, active.col + colDelta);

    this.onCellClick(newRow, newCol);
  }

  private clearActiveCell() {
    const active = this.activeCell();
    if (!active) return;

    this.updateCellValue(active.row, active.col, null);
  }

  // =====================================================================
  // Sheet Operations
  // =====================================================================

  /**
   * Switch to a different sheet
   */
  switchSheet(sheetId: string) {
    if (sheetId === this.activeSheetId()) return;

    // Save pending changes for current sheet
    if (this.pendingUpdates.size > 0) {
      this.saveCells(Array.from(this.pendingUpdates.values()));
    }

    // Clear current cells and selection
    this.cells.set(new Map());
    this.activeCell.set(null);
    this.selection.set(null);
    this.editingCell.set(null);

    // Clear loaded ranges for lazy loading
    this.clearLoadedRanges();

    // Switch sheet
    this.activeSheetId.set(sheetId);

    // Load cells for new sheet
    this.loadCellsForActiveSheet();

    // Update config
    this.config.activeSheetId = sheetId;
    this.notifyDataChange();
  }

  /**
   * Add a new sheet
   */
  addSheet() {
    this.spreadsheetService.addSheet(this.spreadsheetId).subscribe({
      next: (newSheet) => {
        this.sheets.update(sheets => [...sheets, newSheet]);
        this.config.sheets = this.sheets();
        this.notifyDataChange();
      },
      error: (err) => {
        console.error('[SpreadsheetBlock] Failed to add sheet:', err);
      },
    });
  }

  // =====================================================================
  // TipTap Integration
  // =====================================================================

  /**
   * Notify parent (TipTap) of configuration changes
   */
  private notifyDataChange() {
    if (this.onDataChange) {
      this.onDataChange({
        spreadsheetId: this.spreadsheetId,
        config: this.config,
        storageMode: this.storageMode,
      });
    }
  }

  /**
   * Delete this spreadsheet
   */
  deleteSpreadsheet() {
    if (!this.spreadsheetId) return;

    this.spreadsheetService.deleteSpreadsheet(this.spreadsheetId).subscribe({
      next: () => {
        // Notify parent to remove the node
        if (this.onDataChange) {
          this.onDataChange({
            spreadsheetId: this.spreadsheetId,
            config: this.config,
            storageMode: this.storageMode,
            deleted: true,
          });
        }
      },
      error: (err) => {
        console.error('[SpreadsheetBlock] Failed to delete spreadsheet:', err);
      },
    });
  }

  // =====================================================================
  // Cell Formatting
  // =====================================================================

  /**
   * Handle format action from toolbar
   */
  onFormatChange(action: FormatAction): void {
    console.log('[onFormatChange] Called with action:', action.type);
    const active = this.activeCell();
    if (!active) {
      console.log('[onFormatChange] No active cell - aborting');
      return;
    }

    const sel = this.selection();
    console.log('[onFormatChange] Active cell:', active, 'Selection:', sel);

    // Get all cells to format (single cell or range)
    const cellsToFormat = this.getSelectedCellAddresses(sel);
    console.log('[onFormatChange] Cells to format:', cellsToFormat);

    switch (action.type) {
      case 'bold':
        this.toggleFormatProperty(cellsToFormat, 'fontWeight', 'bold', 'normal');
        break;
      case 'italic':
        this.toggleFormatProperty(cellsToFormat, 'fontStyle', 'italic', 'normal');
        break;
      case 'underline':
        this.toggleFormatProperty(cellsToFormat, 'textDecoration', 'underline', 'none');
        break;
      case 'strikethrough':
        this.toggleFormatProperty(cellsToFormat, 'textDecoration', 'line-through', 'none');
        break;
      case 'textColor':
        this.setFormatProperty(cellsToFormat, 'textColor', action.color);
        break;
      case 'backgroundColor':
        this.setFormatProperty(cellsToFormat, 'backgroundColor', action.color);
        break;
      case 'textAlign':
        this.setFormatProperty(cellsToFormat, 'textAlign', action.align);
        break;
      case 'verticalAlign':
        this.setFormatProperty(cellsToFormat, 'verticalAlign', action.align);
        break;
      case 'numberFormat':
        this.setFormatProperty(cellsToFormat, 'numberFormat', action.format);
        break;
      case 'fontSize':
        this.setFormatProperty(cellsToFormat, 'fontSize', action.size);
        break;
      case 'borders':
        this.applyBorders(cellsToFormat, action.style);
        break;
      case 'borderColor':
        this.applyBorderColor(cellsToFormat, action.color);
        break;
      case 'merge':
        this.mergeCells(sel);
        break;
      case 'unmerge':
        this.unmergeCells(cellsToFormat);
        break;
      case 'wrapText':
        this.toggleFormatProperty(cellsToFormat, 'wrapText', true, false);
        break;
    }
  }

  /**
   * Get all cell addresses in current selection
   */
  private getSelectedCellAddresses(sel: SelectionState | null): CellAddress[] {
    const active = this.activeCell();
    if (!sel && active) {
      return [active];
    }
    if (!sel) return [];

    const range = normalizeRange({ start: sel.anchor, end: sel.focus });
    const addresses: CellAddress[] = [];

    for (let row = range.start.row; row <= range.end.row; row++) {
      for (let col = range.start.col; col <= range.end.col; col++) {
        addresses.push({ row, col });
      }
    }

    return addresses;
  }

  /**
   * Toggle a format property between two values
   */
  private toggleFormatProperty<K extends keyof CellFormat>(
    cells: CellAddress[],
    property: K,
    valueOn: CellFormat[K],
    valueOff: CellFormat[K]
  ): void {
    // Check if all cells have the "on" value
    const sheetId = this.activeSheetId();
    const allHaveValue = cells.every(addr => {
      const key = getCellKey({ ...addr, sheet: sheetId });
      const cell = this.cells().get(key);
      return cell?.format?.[property] === valueOn;
    });

    // Toggle: if all have value, turn off; otherwise turn on
    const newValue = allHaveValue ? valueOff : valueOn;
    this.setFormatProperty(cells, property, newValue);
  }

  /**
   * Set a format property on selected cells
   */
  private setFormatProperty<K extends keyof CellFormat>(
    cells: CellAddress[],
    property: K,
    value: CellFormat[K]
  ): void {
    const sheetId = this.activeSheetId();
    const newCells = new Map(this.cells());

    cells.forEach(addr => {
      const key = getCellKey({ ...addr, sheet: sheetId });
      const existingCell = newCells.get(key);

      const updatedFormat: CellFormat = {
        ...(existingCell?.format || {}),
        [property]: value,
      };

      const updatedCell: SpreadsheetCell = {
        id: existingCell?.id || crypto.randomUUID(),
        spreadsheet_id: this.spreadsheetId,
        sheet_id: sheetId,
        row: addr.row,
        col: addr.col,
        raw_value: existingCell?.raw_value ?? null,
        formula: existingCell?.formula,
        computed_value: existingCell?.computed_value,
        format: updatedFormat,
        created_at: existingCell?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      newCells.set(key, updatedCell);

      // Queue for save
      this.queueCellUpdate(sheetId, addr.row, addr.col, { format: updatedFormat });
    });

    this.cells.set(newCells);
  }

  /**
   * Apply borders to selected cells
   */
  private applyBorders(cells: CellAddress[], style: 'all' | 'outer' | 'none' | 'top' | 'bottom' | 'left' | 'right'): void {
    console.log('[applyBorders] Called with', cells.length, 'cells, style:', style);
    if (cells.length === 0) {
      console.log('[applyBorders] No cells - returning');
      return;
    }

    const sheetId = this.activeSheetId();
    const newCells = new Map(this.cells());

    // Calculate range from cells array (works even without selection)
    const minRow = Math.min(...cells.map(c => c.row));
    const maxRow = Math.max(...cells.map(c => c.row));
    const minCol = Math.min(...cells.map(c => c.col));
    const maxCol = Math.max(...cells.map(c => c.col));

    const range = {
      start: { row: minRow, col: minCol },
      end: { row: maxRow, col: maxCol },
    };

    cells.forEach(addr => {
      const key = getCellKey({ ...addr, sheet: sheetId });
      const existingCell = newCells.get(key);
      const existingFormat = existingCell?.format || {};

      let newFormat: CellFormat = { ...existingFormat };

      const border = { ...DEFAULT_BORDER_STYLE };

      switch (style) {
        case 'all':
          newFormat.borderTop = border;
          newFormat.borderRight = border;
          newFormat.borderBottom = border;
          newFormat.borderLeft = border;
          break;
        case 'outer':
          // Top row
          if (addr.row === range.start.row) newFormat.borderTop = border;
          // Bottom row
          if (addr.row === range.end.row) newFormat.borderBottom = border;
          // Left column
          if (addr.col === range.start.col) newFormat.borderLeft = border;
          // Right column
          if (addr.col === range.end.col) newFormat.borderRight = border;
          break;
        case 'top':
          newFormat.borderTop = border;
          break;
        case 'bottom':
          newFormat.borderBottom = border;
          break;
        case 'left':
          newFormat.borderLeft = border;
          break;
        case 'right':
          newFormat.borderRight = border;
          break;
        case 'none':
          delete newFormat.borderTop;
          delete newFormat.borderRight;
          delete newFormat.borderBottom;
          delete newFormat.borderLeft;
          break;
      }

      const updatedCell: SpreadsheetCell = {
        id: existingCell?.id || crypto.randomUUID(),
        spreadsheet_id: this.spreadsheetId,
        sheet_id: sheetId,
        row: addr.row,
        col: addr.col,
        raw_value: existingCell?.raw_value ?? null,
        formula: existingCell?.formula,
        computed_value: existingCell?.computed_value,
        format: newFormat,
        created_at: existingCell?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      newCells.set(key, updatedCell);
      console.log('[applyBorders] Stored cell with format:', key, newFormat);
      this.queueCellUpdate(sheetId, addr.row, addr.col, { format: newFormat });
    });

    this.cells.set(newCells);
    // Increment version to force template re-render
    this.cellsVersion.update(v => v + 1);
    console.log('[applyBorders] Done. Cells signal updated, version:', this.cellsVersion());
    // Force immediate change detection since we use OnPush
    this.cdr.detectChanges();
  }

  /**
   * Apply border color to existing borders on selected cells
   */
  private applyBorderColor(cells: CellAddress[], color: string): void {
    if (cells.length === 0) return;

    const sheetId = this.activeSheetId();
    const newCells = new Map(this.cells());

    cells.forEach(addr => {
      const key = getCellKey({ ...addr, sheet: sheetId });
      const existingCell = newCells.get(key);
      const existingFormat = existingCell?.format || {};

      const newFormat: CellFormat = { ...existingFormat };

      // Update color on existing borders, or create new borders with the color
      if (newFormat.borderTop) {
        newFormat.borderTop = { ...newFormat.borderTop, color };
      }
      if (newFormat.borderRight) {
        newFormat.borderRight = { ...newFormat.borderRight, color };
      }
      if (newFormat.borderBottom) {
        newFormat.borderBottom = { ...newFormat.borderBottom, color };
      }
      if (newFormat.borderLeft) {
        newFormat.borderLeft = { ...newFormat.borderLeft, color };
      }

      // If no borders exist, create all borders with the selected color
      if (!newFormat.borderTop && !newFormat.borderRight && !newFormat.borderBottom && !newFormat.borderLeft) {
        const border = { ...DEFAULT_BORDER_STYLE, color };
        newFormat.borderTop = border;
        newFormat.borderRight = border;
        newFormat.borderBottom = border;
        newFormat.borderLeft = border;
      }

      const updatedCell: SpreadsheetCell = {
        id: existingCell?.id || crypto.randomUUID(),
        spreadsheet_id: this.spreadsheetId,
        sheet_id: sheetId,
        row: addr.row,
        col: addr.col,
        raw_value: existingCell?.raw_value ?? null,
        formula: existingCell?.formula,
        computed_value: existingCell?.computed_value,
        format: newFormat,
        created_at: existingCell?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      newCells.set(key, updatedCell);
      this.queueCellUpdate(sheetId, addr.row, addr.col, { format: newFormat });
    });

    this.cells.set(newCells);
    this.cellsVersion.update(v => v + 1);
    this.cdr.detectChanges();
  }

  /**
   * Merge selected cells
   */
  private mergeCells(sel: SelectionState | null): void {
    if (!sel) return;

    const range = normalizeRange({ start: sel.anchor, end: sel.focus });
    const rowSpan = range.end.row - range.start.row + 1;
    const colSpan = range.end.col - range.start.col + 1;

    if (rowSpan === 1 && colSpan === 1) return; // Nothing to merge

    const sheetId = this.activeSheetId();
    const newCells = new Map(this.cells());

    // Set merge on top-left cell
    const topLeftKey = getCellKey({ ...range.start, sheet: sheetId });
    const topLeftCell = newCells.get(topLeftKey);

    const mergedCell: SpreadsheetCell = {
      id: topLeftCell?.id || crypto.randomUUID(),
      spreadsheet_id: this.spreadsheetId,
      sheet_id: sheetId,
      row: range.start.row,
      col: range.start.col,
      raw_value: topLeftCell?.raw_value ?? null,
      formula: topLeftCell?.formula,
      computed_value: topLeftCell?.computed_value,
      format: topLeftCell?.format,
      merge: { rowSpan, colSpan },
      created_at: topLeftCell?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    newCells.set(topLeftKey, mergedCell);
    this.queueCellUpdate(sheetId, range.start.row, range.start.col, {
      merge: { rowSpan, colSpan },
    });

    this.cells.set(newCells);
  }

  /**
   * Unmerge cells
   */
  private unmergeCells(cells: CellAddress[]): void {
    const sheetId = this.activeSheetId();
    const newCells = new Map(this.cells());

    cells.forEach(addr => {
      const key = getCellKey({ ...addr, sheet: sheetId });
      const existingCell = newCells.get(key);

      if (existingCell?.merge) {
        const updatedCell: SpreadsheetCell = {
          ...existingCell,
          merge: undefined,
          updated_at: new Date().toISOString(),
        };

        newCells.set(key, updatedCell);
        this.queueCellUpdate(sheetId, addr.row, addr.col, { merge: null });
      }
    });

    this.cells.set(newCells);
  }

  /**
   * Get cell inline styles based on format as a style string
   * Returns a CSS string like "border-top: 2px solid red; color: blue;"
   */
  getCellStyleString(row: number, col: number): string {
    const key = getCellKey({ row, col, sheet: this.activeSheetId() });
    const cell = this.cells().get(key);
    const format = cell?.format;

    if (!format) return '';

    const parts: string[] = [];

    // Text styling
    if (format.fontFamily) parts.push(`font-family: ${format.fontFamily}`);
    if (format.fontSize) parts.push(`font-size: ${format.fontSize}px`);
    if (format.fontWeight) parts.push(`font-weight: ${format.fontWeight}`);
    if (format.fontStyle) parts.push(`font-style: ${format.fontStyle}`);
    if (format.textDecoration) parts.push(`text-decoration: ${format.textDecoration}`);
    if (format.textColor) parts.push(`color: ${format.textColor}`);

    // Cell styling
    if (format.backgroundColor && format.backgroundColor !== 'transparent') {
      parts.push(`background-color: ${format.backgroundColor}`);
    }
    if (format.textAlign) {
      parts.push(`justify-content: ${format.textAlign === 'left' ? 'flex-start' : format.textAlign === 'right' ? 'flex-end' : 'center'}`);
    }
    if (format.verticalAlign) {
      parts.push(`align-items: ${format.verticalAlign === 'top' ? 'flex-start' : format.verticalAlign === 'bottom' ? 'flex-end' : 'center'}`);
    }

    // Borders
    if (format.borderTop) {
      parts.push(`border-top: ${format.borderTop.width}px ${format.borderTop.style} ${format.borderTop.color}`);
    }
    if (format.borderRight) {
      parts.push(`border-right: ${format.borderRight.width}px ${format.borderRight.style} ${format.borderRight.color}`);
    }
    if (format.borderBottom) {
      parts.push(`border-bottom: ${format.borderBottom.width}px ${format.borderBottom.style} ${format.borderBottom.color}`);
    }
    if (format.borderLeft) {
      parts.push(`border-left: ${format.borderLeft.width}px ${format.borderLeft.style} ${format.borderLeft.color}`);
    }

    // Wrap text
    if (format.wrapText) {
      parts.push('white-space: normal');
      parts.push('word-wrap: break-word');
    }

    const result = parts.join('; ');
    if (format.borderTop || format.borderRight || format.borderBottom || format.borderLeft) {
      console.log('[getCellStyleString] Style for', row, col, ':', result);
    }
    return result;
  }

  /**
   * Get individual border styles for direct binding
   */
  getCellBorderTop(row: number, col: number): string | null {
    const key = getCellKey({ row, col, sheet: this.activeSheetId() });
    const cell = this.cells().get(key);
    const border = cell?.format?.borderTop;
    if (!border) return null;
    const style = `${border.width}px ${border.style} ${border.color}`;
    console.log('[getCellBorderTop]', row, col, style);
    return style;
  }

  getCellBorderRight(row: number, col: number): string | null {
    const key = getCellKey({ row, col, sheet: this.activeSheetId() });
    const cell = this.cells().get(key);
    const border = cell?.format?.borderRight;
    if (!border) return null;
    return `${border.width}px ${border.style} ${border.color}`;
  }

  getCellBorderBottom(row: number, col: number): string | null {
    const key = getCellKey({ row, col, sheet: this.activeSheetId() });
    const cell = this.cells().get(key);
    const border = cell?.format?.borderBottom;
    if (!border) return null;
    return `${border.width}px ${border.style} ${border.color}`;
  }

  getCellBorderLeft(row: number, col: number): string | null {
    const key = getCellKey({ row, col, sheet: this.activeSheetId() });
    const cell = this.cells().get(key);
    const border = cell?.format?.borderLeft;
    if (!border) return null;
    return `${border.width}px ${border.style} ${border.color}`;
  }

  getCellBackgroundColor(row: number, col: number): string | null {
    const key = getCellKey({ row, col, sheet: this.activeSheetId() });
    const cell = this.cells().get(key);
    const bg = cell?.format?.backgroundColor;
    if (!bg || bg === 'transparent') return null;
    return bg;
  }

  getCellTextColor(row: number, col: number): string | null {
    const key = getCellKey({ row, col, sheet: this.activeSheetId() });
    const cell = this.cells().get(key);
    return cell?.format?.textColor || null;
  }

  /**
   * Get cell inline styles based on format
   * Note: reading cellsVersion() to ensure this is re-evaluated when cells change
   */
  getCellStyles(row: number, col: number): Record<string, string> {
    // Read version signal to trigger re-evaluation when cells change
    const _version = this.cellsVersion();
    const key = getCellKey({ row, col, sheet: this.activeSheetId() });
    const cell = this.cells().get(key);
    const format = cell?.format;

    if (!format) return {};

    const styles: Record<string, string> = {};

    // Text styling
    if (format.fontFamily) styles['font-family'] = format.fontFamily;
    if (format.fontSize) styles['font-size'] = `${format.fontSize}px`;
    if (format.fontWeight) styles['font-weight'] = format.fontWeight;
    if (format.fontStyle) styles['font-style'] = format.fontStyle;
    if (format.textDecoration) styles['text-decoration'] = format.textDecoration;
    if (format.textColor) styles['color'] = format.textColor;

    // Cell styling
    if (format.backgroundColor && format.backgroundColor !== 'transparent') {
      styles['background-color'] = format.backgroundColor;
    }
    if (format.textAlign) styles['justify-content'] = format.textAlign === 'left' ? 'flex-start' : format.textAlign === 'right' ? 'flex-end' : 'center';
    if (format.verticalAlign) styles['align-items'] = format.verticalAlign === 'top' ? 'flex-start' : format.verticalAlign === 'bottom' ? 'flex-end' : 'center';

    // Borders - override CSS defaults
    if (format.borderTop) {
      styles['border-top'] = `${format.borderTop.width}px ${format.borderTop.style} ${format.borderTop.color}`;
      console.log('[getCellStyles] Adding border-top:', styles['border-top']);
    }
    if (format.borderRight) {
      styles['border-right'] = `${format.borderRight.width}px ${format.borderRight.style} ${format.borderRight.color}`;
    }
    if (format.borderBottom) {
      styles['border-bottom'] = `${format.borderBottom.width}px ${format.borderBottom.style} ${format.borderBottom.color}`;
    }
    if (format.borderLeft) {
      styles['border-left'] = `${format.borderLeft.width}px ${format.borderLeft.style} ${format.borderLeft.color}`;
    }

    if (format.borderTop || format.borderRight || format.borderBottom || format.borderLeft) {
      console.log('[getCellStyles] Final styles with borders:', styles);
    }

    // Wrap text
    if (format.wrapText) {
      styles['white-space'] = 'normal';
      styles['word-wrap'] = 'break-word';
    }

    return styles;
  }

  /**
   * Format cell value for display based on number format
   */
  formatCellValue(value: SpreadsheetCellValue, format?: CellFormat): string {
    if (value === null || value === undefined) return '';

    const numberFormat = format?.numberFormat || 'general';

    if (typeof value === 'number') {
      switch (numberFormat) {
        case 'number':
          return value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        case 'currency':
          return value.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
        case 'percentage':
          return (value * 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
        case 'scientific':
          return value.toExponential(2);
        default:
          return value.toString();
      }
    }

    if (value instanceof Date) {
      switch (numberFormat) {
        case 'date-short':
          return value.toLocaleDateString('fr-FR');
        case 'date-long':
          return value.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
        case 'time':
          return value.toLocaleTimeString('fr-FR');
        case 'datetime':
          return value.toLocaleString('fr-FR');
        default:
          return value.toLocaleDateString('fr-FR');
      }
    }

    return value.toString();
  }

  // =====================================================================
  // Formula Autocompletion
  // =====================================================================

  /**
   * Handle formula input changes for autocompletion
   */
  onFormulaInput(value: string): void {
    const editing = this.editingCell();
    if (!editing) return;

    // Update the editing value
    this.editingCell.set({ ...editing, value });

    // Check for formula autocompletion
    if (value.startsWith('=')) {
      this.checkFormulaAutocomplete(value);
    } else {
      this.hideFormulaAutocomplete();
    }
  }

  /**
   * Check if we should show formula autocompletion
   */
  private checkFormulaAutocomplete(formula: string): void {
    // Extract the last token after = or operators
    const match = formula.match(/[=+\-*/,(;]\s*([A-Z]+)$/i);

    if (match && match[1]) {
      const query = match[1].toUpperCase();
      const suggestions = this.formulaEngine.searchFunctions(query);

      if (suggestions.length > 0) {
        this.formulaSuggestions.set(suggestions.slice(0, 8)); // Limit to 8 suggestions
        this.selectedSuggestionIndex.set(0);
        this.showFormulaAutocomplete.set(true);
      } else {
        this.hideFormulaAutocomplete();
      }
    } else {
      this.hideFormulaAutocomplete();
    }
  }

  /**
   * Hide formula autocompletion
   */
  private hideFormulaAutocomplete(): void {
    this.showFormulaAutocomplete.set(false);
    this.formulaSuggestions.set([]);
    this.selectedSuggestionIndex.set(0);
  }

  /**
   * Select a formula suggestion
   */
  selectFormulaSuggestion(fn: FormulaFunction): void {
    const editing = this.editingCell();
    if (!editing) return;

    // Replace the partial function name with the complete one
    const value = editing.value;
    const newValue = value.replace(/([A-Z]+)$/i, fn.name + '(');

    this.editingCell.set({ ...editing, value: newValue });
    this.hideFormulaAutocomplete();
  }

  /**
   * Navigate autocompletion with keyboard
   */
  navigateAutocomplete(direction: 'up' | 'down'): void {
    const suggestions = this.formulaSuggestions();
    if (suggestions.length === 0) return;

    const current = this.selectedSuggestionIndex();
    if (direction === 'up') {
      this.selectedSuggestionIndex.set(current > 0 ? current - 1 : suggestions.length - 1);
    } else {
      this.selectedSuggestionIndex.set(current < suggestions.length - 1 ? current + 1 : 0);
    }
  }

  /**
   * Confirm autocompletion selection
   */
  confirmAutocompleteSelection(): boolean {
    const suggestions = this.formulaSuggestions();
    if (suggestions.length === 0 || !this.showFormulaAutocomplete()) return false;

    const selected = suggestions[this.selectedSuggestionIndex()];
    if (selected) {
      this.selectFormulaSuggestion(selected);
      return true;
    }
    return false;
  }

  /**
   * Check if a cell contains an error
   */
  isCellError(row: number, col: number): boolean {
    const key = getCellKey({ row, col, sheet: this.activeSheetId() });
    const cell = this.cells().get(key);
    if (!cell?.computed_value) return false;

    const errorTypes = ['#VALUE!', '#REF!', '#DIV/0!', '#NAME?', '#N/A', '#NUM!', '#NULL!', '#ERROR!'];
    return errorTypes.includes(String(cell.computed_value));
  }

  /**
   * Check if a cell contains a formula
   */
  cellHasFormula(row: number, col: number): boolean {
    const key = getCellKey({ row, col, sheet: this.activeSheetId() });
    const cell = this.cells().get(key);
    return !!cell?.formula;
  }

  // =====================================================================
  // Column Label Helper
  // =====================================================================

  /**
   * Convert column index to Excel-style letter (0 -> A, 25 -> Z, 26 -> AA)
   */
  getColumnLabel(index: number): string {
    let label = '';
    let temp = index;
    while (temp >= 0) {
      label = String.fromCharCode(65 + (temp % 26)) + label;
      temp = Math.floor(temp / 26) - 1;
    }
    return label;
  }

  // =====================================================================
  // Cell State Checks
  // =====================================================================

  isActiveCell(row: number, col: number): boolean {
    const active = this.activeCell();
    return active?.row === row && active?.col === col;
  }

  isEditingCell(row: number, col: number): boolean {
    const editing = this.editingCell();
    return editing?.cell.row === row && editing?.cell.col === col;
  }

  isCellSelected(row: number, col: number): boolean {
    const sel = this.selection();
    if (!sel) return false;

    const minRow = Math.min(sel.anchor.row, sel.focus.row);
    const maxRow = Math.max(sel.anchor.row, sel.focus.row);
    const minCol = Math.min(sel.anchor.col, sel.focus.col);
    const maxCol = Math.max(sel.anchor.col, sel.focus.col);

    return row >= minRow && row <= maxRow && col >= minCol && col <= maxCol;
  }

  isColumnSelected(col: number): boolean {
    const sel = this.selection();
    if (!sel) return false;

    const minCol = Math.min(sel.anchor.col, sel.focus.col);
    const maxCol = Math.max(sel.anchor.col, sel.focus.col);

    return col >= minCol && col <= maxCol;
  }

  isRowSelected(row: number): boolean {
    const sel = this.selection();
    if (!sel) return false;

    const minRow = Math.min(sel.anchor.row, sel.focus.row);
    const maxRow = Math.max(sel.anchor.row, sel.focus.row);

    return row >= minRow && row <= maxRow;
  }

  // =====================================================================
  // Column/Row Resizing
  // =====================================================================

  // Resize state
  private resizing = signal<{
    type: 'column' | 'row';
    index: number;
    startPos: number;
    startSize: number;
  } | null>(null);

  // Local column widths (override sheet config)
  private columnWidths = signal<Record<number, number>>({});
  private rowHeights = signal<Record<number, number>>({});

  /**
   * Get column width (from local state, sheet config, or default)
   */
  getColumnWidth(col: number): number {
    const localWidths = this.columnWidths();
    if (localWidths[col] !== undefined) return localWidths[col];

    const sheet = this.activeSheet();
    if (sheet?.columnWidths?.[col] !== undefined) return sheet.columnWidths[col];

    return sheet?.defaultColWidth || 100;
  }

  /**
   * Get row height (from local state, sheet config, or default)
   */
  getRowHeight(row: number): number {
    const localHeights = this.rowHeights();
    if (localHeights[row] !== undefined) return localHeights[row];

    const sheet = this.activeSheet();
    if (sheet?.rowHeights?.[row] !== undefined) return sheet.rowHeights[row];

    return sheet?.defaultRowHeight || 24;
  }

  /**
   * Start column resize operation
   */
  startColumnResize(event: MouseEvent, col: number): void {
    event.preventDefault();
    event.stopPropagation();

    this.resizing.set({
      type: 'column',
      index: col,
      startPos: event.clientX,
      startSize: this.getColumnWidth(col),
    });

    // Add global mouse listeners
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
   * Start row resize operation
   */
  startRowResize(event: MouseEvent, row: number): void {
    event.preventDefault();
    event.stopPropagation();

    this.resizing.set({
      type: 'row',
      index: row,
      startPos: event.clientY,
      startSize: this.getRowHeight(row),
    });

    // Add global mouse listeners
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
    const resize = this.resizing();
    if (!resize) return;

    if (resize.type === 'column') {
      const delta = event.clientX - resize.startPos;
      const newWidth = Math.max(20, Math.min(500, resize.startSize + delta)); // Min 20, max 500

      this.columnWidths.update(widths => ({
        ...widths,
        [resize.index]: newWidth,
      }));
    } else {
      const delta = event.clientY - resize.startPos;
      const newHeight = Math.max(16, Math.min(400, resize.startSize + delta)); // Min 16, max 400

      this.rowHeights.update(heights => ({
        ...heights,
        [resize.index]: newHeight,
      }));
    }
  }

  /**
   * End resize operation and persist to sheet config
   */
  private onResizeEnd(): void {
    const resize = this.resizing();
    if (!resize) return;

    const sheet = this.activeSheet();
    if (!sheet) {
      this.resizing.set(null);
      return;
    }

    // Update sheet config
    if (resize.type === 'column') {
      const newWidth = this.columnWidths()[resize.index];
      if (newWidth !== undefined) {
        const updatedColumnWidths = {
          ...sheet.columnWidths,
          [resize.index]: newWidth,
        };

        this.spreadsheetService.updateSheetConfig(
          this.spreadsheetId,
          sheet.id,
          { columnWidths: updatedColumnWidths }
        ).subscribe({
          next: () => {
            // Update local sheets config
            this.sheets.update(sheets =>
              sheets.map(s =>
                s.id === sheet.id
                  ? { ...s, columnWidths: updatedColumnWidths }
                  : s
              )
            );
          },
          error: (err) => console.error('[SpreadsheetBlock] Failed to save column width:', err),
        });
      }
    } else {
      const newHeight = this.rowHeights()[resize.index];
      if (newHeight !== undefined) {
        const updatedRowHeights = {
          ...sheet.rowHeights,
          [resize.index]: newHeight,
        };

        this.spreadsheetService.updateSheetConfig(
          this.spreadsheetId,
          sheet.id,
          { rowHeights: updatedRowHeights }
        ).subscribe({
          next: () => {
            // Update local sheets config
            this.sheets.update(sheets =>
              sheets.map(s =>
                s.id === sheet.id
                  ? { ...s, rowHeights: updatedRowHeights }
                  : s
              )
            );
          },
          error: (err) => console.error('[SpreadsheetBlock] Failed to save row height:', err),
        });
      }
    }

    this.resizing.set(null);
  }

  // =====================================================================
  // Freeze Panes
  // =====================================================================

  /**
   * Check if current sheet has frozen panes
   */
  hasFrozenPanes(): boolean {
    const sheet = this.activeSheet();
    return !!(sheet?.frozenRows && sheet.frozenRows > 0) || !!(sheet?.frozenCols && sheet.frozenCols > 0);
  }

  /**
   * Get number of frozen rows
   */
  getFrozenRows(): number {
    return this.activeSheet()?.frozenRows || 0;
  }

  /**
   * Get number of frozen columns
   */
  getFrozenCols(): number {
    return this.activeSheet()?.frozenCols || 0;
  }

  /**
   * Freeze at current active cell position
   */
  freezeAtCurrentCell(): void {
    const active = this.activeCell();
    if (!active) return;

    this.setFreezePanes(active.row, active.col);
  }

  /**
   * Freeze first row only
   */
  freezeFirstRow(): void {
    this.setFreezePanes(1, 0);
  }

  /**
   * Freeze first column only
   */
  freezeFirstColumn(): void {
    this.setFreezePanes(0, 1);
  }

  /**
   * Remove all frozen panes
   */
  unfreeze(): void {
    this.setFreezePanes(0, 0);
  }

  /**
   * Set freeze panes configuration
   */
  private setFreezePanes(rows: number, cols: number): void {
    const sheet = this.activeSheet();
    if (!sheet) return;

    this.spreadsheetService.updateSheetConfig(
      this.spreadsheetId,
      sheet.id,
      { frozenRows: rows, frozenCols: cols }
    ).subscribe({
      next: () => {
        // Update local sheets config
        this.sheets.update(sheets =>
          sheets.map(s =>
            s.id === sheet.id
              ? { ...s, frozenRows: rows, frozenCols: cols }
              : s
          )
        );
      },
      error: (err) => console.error('[SpreadsheetBlock] Failed to set freeze panes:', err),
    });
  }

  /**
   * Check if a row is frozen
   */
  isRowFrozen(row: number): boolean {
    const frozenRows = this.getFrozenRows();
    return row < frozenRows;
  }

  /**
   * Check if a column is frozen
   */
  isColumnFrozen(col: number): boolean {
    const frozenCols = this.getFrozenCols();
    return col < frozenCols;
  }

  // =====================================================================
  // Import/Export
  // =====================================================================

  /**
   * Export spreadsheet to Excel file
   */
  exportToExcel(): void {
    const fileName = `${this.config.name || 'spreadsheet'}.xlsx`;
    this.ioService.downloadExcel(this.config, this.cells(), fileName, {
      target: 'xlsx',
      includeFormulas: true,
      includeFormatting: true,
    });
  }

  /**
   * Export current sheet to CSV
   */
  exportToCSV(): void {
    const sheet = this.activeSheet();
    if (!sheet) return;

    const fileName = `${sheet.name || 'sheet'}.csv`;
    this.ioService.downloadCSV(sheet.id, this.cells(), this.config, fileName);
  }

  /**
   * Open import dialog
   */
  openImportDialog(): void {
    const dialogRef = this.dialog.open(SpreadsheetImportDialogComponent, {
      width: '500px',
      disableClose: false,
    });

    dialogRef.afterClosed().subscribe((result: SpreadsheetImportResult | null) => {
      if (result) {
        this.applyImportResult(result);
      }
    });
  }

  /**
   * Apply imported data to the spreadsheet
   */
  private applyImportResult(result: SpreadsheetImportResult): void {
    // Update config with imported sheets
    this.config = result.config;
    this.sheets.set(result.config.sheets);

    if (result.config.sheets.length > 0) {
      this.activeSheetId.set(result.config.activeSheetId);
    }

    // Convert imported cells to Map
    const newCells = new Map<string, SpreadsheetCell>();

    Object.entries(result.sheets).forEach(([sheetId, cells]) => {
      cells.forEach(cell => {
        const key = getCellKey({ row: cell.row, col: cell.col, sheet: sheetId });
        // Update the spreadsheet_id for imported cells
        newCells.set(key, {
          ...cell,
          spreadsheet_id: this.spreadsheetId,
        });
      });
    });

    this.cells.set(newCells);

    // Save all imported data
    this.saveImportedData(result);

    // Notify parent of changes
    this.notifyDataChange();
  }

  /**
   * Save imported data to the database
   */
  private saveImportedData(result: SpreadsheetImportResult): void {
    // Update spreadsheet config
    this.spreadsheetService.updateSpreadsheetConfig(this.spreadsheetId, this.config).subscribe({
      error: (err) => console.error('[SpreadsheetBlock] Failed to save imported config:', err),
    });

    // Save cells for each sheet
    Object.entries(result.sheets).forEach(([sheetId, cells]) => {
      if (cells.length === 0) return;

      const updates = cells.map(cell => ({
        sheetId,
        row: cell.row,
        col: cell.col,
        update: {
          raw_value: cell.raw_value,
          formula: cell.formula,
          format: cell.format,
        },
      }));

      this.spreadsheetService.batchUpdateCells(this.spreadsheetId, updates).subscribe({
        error: (err) => console.error('[SpreadsheetBlock] Failed to save imported cells:', err),
      });
    });
  }

  // =====================================================================
  // Virtual Scrolling
  // =====================================================================

  private scrollListener: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;

  /**
   * Initialize virtual scrolling by setting up scroll listeners and resize observer
   */
  private initializeVirtualScroll(): void {
    // Wait for next tick to ensure view is ready
    setTimeout(() => {
      const wrapper = this.gridWrapperRef?.nativeElement;
      if (!wrapper) return;

      // Set initial viewport dimensions
      this.updateViewportDimensions(wrapper);

      // Setup scroll listener outside Angular zone for performance
      this.ngZone.runOutsideAngular(() => {
        this.scrollListener = () => {
          const scrollTop = wrapper.scrollTop;
          const scrollLeft = wrapper.scrollLeft;

          // Only update if scroll position changed significantly (reduces updates)
          if (Math.abs(scrollTop - this.scrollTop()) > 2 || Math.abs(scrollLeft - this.scrollLeft()) > 2) {
            this.ngZone.run(() => {
              this.scrollTop.set(scrollTop);
              this.scrollLeft.set(scrollLeft);

              // Trigger lazy loading check when scroll position changes
              this.checkAndTriggerLazyLoad();
            });
          }
        };

        wrapper.addEventListener('scroll', this.scrollListener, { passive: true });
      });

      // Setup resize observer
      this.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.target === wrapper) {
            this.ngZone.run(() => {
              this.updateViewportDimensions(wrapper);
            });
          }
        }
      });

      this.resizeObserver.observe(wrapper);
    });
  }

  /**
   * Update viewport dimensions based on container size
   */
  private updateViewportDimensions(wrapper: HTMLElement): void {
    // Subtract header heights from viewport
    const height = wrapper.clientHeight - this.COL_HEADER_HEIGHT;
    const width = wrapper.clientWidth - this.ROW_HEADER_WIDTH;

    this.viewportHeight.set(height > 0 ? height : 600);
    this.viewportWidth.set(width > 0 ? width : 800);
  }

  /**
   * Cleanup virtual scroll resources
   */
  private cleanupVirtualScroll(): void {
    if (this.scrollListener && this.gridWrapperRef?.nativeElement) {
      this.gridWrapperRef.nativeElement.removeEventListener('scroll', this.scrollListener);
      this.scrollListener = null;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  /**
   * Scroll to make a specific cell visible
   */
  scrollToCell(row: number, col: number): void {
    const wrapper = this.gridWrapperRef?.nativeElement;
    if (!wrapper) return;

    const rowHeight = this.activeSheet()?.defaultRowHeight || this.DEFAULT_ROW_HEIGHT;
    const colWidth = this.activeSheet()?.defaultColWidth || this.DEFAULT_COL_WIDTH;

    const cellTop = row * rowHeight;
    const cellLeft = col * colWidth;
    const cellBottom = cellTop + rowHeight;
    const cellRight = cellLeft + colWidth;

    const viewTop = wrapper.scrollTop;
    const viewLeft = wrapper.scrollLeft;
    const viewBottom = viewTop + wrapper.clientHeight - this.COL_HEADER_HEIGHT;
    const viewRight = viewLeft + wrapper.clientWidth - this.ROW_HEADER_WIDTH;

    // Scroll vertically if needed
    if (cellTop < viewTop) {
      wrapper.scrollTop = cellTop;
    } else if (cellBottom > viewBottom) {
      wrapper.scrollTop = cellBottom - (wrapper.clientHeight - this.COL_HEADER_HEIGHT);
    }

    // Scroll horizontally if needed
    if (cellLeft < viewLeft) {
      wrapper.scrollLeft = cellLeft;
    } else if (cellRight > viewRight) {
      wrapper.scrollLeft = cellRight - (wrapper.clientWidth - this.ROW_HEADER_WIDTH);
    }
  }

  /**
   * Expand grid size dynamically based on data
   */
  expandGridIfNeeded(row: number, col: number): void {
    // Expand rows if needed (add 100 buffer)
    if (row >= this.totalRows() - 10) {
      this.totalRows.update(r => r + 100);
    }

    // Expand columns if needed (add 10 buffer)
    if (col >= this.totalCols() - 2) {
      this.totalCols.update(c => c + 10);
    }
  }

  // =====================================================================
  // Lazy Loading for Cell Data
  // =====================================================================

  /**
   * Check if a range needs to be loaded
   */
  private needsLazyLoad(rowStart: number, rowEnd: number, colStart: number, colEnd: number): boolean {
    const ranges = this.loadedRanges();

    // Check if any part of the requested range is not covered by loaded ranges
    return !ranges.some(range =>
      range.rowStart <= rowStart &&
      range.rowEnd >= rowEnd &&
      range.colStart <= colStart &&
      range.colEnd >= colEnd
    );
  }

  /**
   * Trigger lazy loading for the current viewport
   */
  private checkAndTriggerLazyLoad(): void {
    if (this.isLazyLoading()) return;

    const rowStart = this.visibleRowStart();
    const rowEnd = this.visibleRowEnd();
    const colStart = this.visibleColStart();
    const colEnd = this.visibleColEnd();

    // Expand with buffer for smoother scrolling
    const bufferedRowStart = Math.max(0, rowStart - this.LAZY_LOAD_BUFFER);
    const bufferedRowEnd = rowEnd + this.LAZY_LOAD_BUFFER;
    const bufferedColStart = Math.max(0, colStart - this.LAZY_LOAD_BUFFER);
    const bufferedColEnd = colEnd + this.LAZY_LOAD_BUFFER;

    if (this.needsLazyLoad(bufferedRowStart, bufferedRowEnd, bufferedColStart, bufferedColEnd)) {
      this.lazyLoadCells(bufferedRowStart, bufferedRowEnd, bufferedColStart, bufferedColEnd);
    }
  }

  /**
   * Load cells for a specific range (lazy loading)
   */
  private lazyLoadCells(rowStart: number, rowEnd: number, colStart: number, colEnd: number): void {
    const sheetId = this.activeSheetId();
    if (!sheetId || !this.spreadsheetId) return;

    // Store pending load request
    this.pendingLazyLoad = { rowStart, rowEnd, colStart, colEnd };
    this.isLazyLoading.set(true);

    this.spreadsheetService.loadCellsForViewport(
      this.spreadsheetId,
      sheetId,
      rowStart,
      rowEnd,
      colStart,
      colEnd,
      0 // Buffer is already applied
    ).subscribe({
      next: (newCells) => {
        // Merge new cells with existing cells
        const currentCells = this.cells();
        const mergedCells = new Map(currentCells);

        newCells.forEach((cell, key) => {
          mergedCells.set(key, cell);
        });

        this.cells.set(mergedCells);

        // Update loaded ranges
        this.loadedRanges.update(ranges => {
          // Merge overlapping ranges for efficiency
          const newRange = { rowStart, rowEnd, colStart, colEnd };
          const mergedRanges = this.mergeRanges([...ranges, newRange]);
          return mergedRanges;
        });

        // Load into formula engine for calculation
        this.formulaEngine.loadCells(sheetId, mergedCells);

        // Recalculate formulas for newly loaded cells
        const cellsToRecalc: Array<{ sheetId: string; row: number; col: number }> = [];
        newCells.forEach((cell) => {
          if (cell.formula) {
            cellsToRecalc.push({ sheetId, row: cell.row, col: cell.col });
          }
        });

        if (cellsToRecalc.length > 0) {
          const computedValues = this.formulaEngine.recalculateCells(cellsToRecalc);

          if (computedValues.size > 0) {
            const updatedCells = new Map(this.cells());
            computedValues.forEach((value, key) => {
              const existingCell = updatedCells.get(key);
              if (existingCell) {
                updatedCells.set(key, { ...existingCell, computed_value: value });
              }
            });
            this.cells.set(updatedCells);
          }
        }

        this.isLazyLoading.set(false);
        this.pendingLazyLoad = null;

        // Check if we need to load more (in case user scrolled during load)
        this.checkAndTriggerLazyLoad();
      },
      error: (err) => {
        console.error('[SpreadsheetBlock] Lazy load error:', err);
        this.isLazyLoading.set(false);
        this.pendingLazyLoad = null;
      },
    });
  }

  /**
   * Merge overlapping ranges for efficient tracking
   */
  private mergeRanges(ranges: Array<{
    rowStart: number;
    rowEnd: number;
    colStart: number;
    colEnd: number;
  }>): Array<{
    rowStart: number;
    rowEnd: number;
    colStart: number;
    colEnd: number;
  }> {
    if (ranges.length <= 1) return ranges;

    // Sort by rowStart, then colStart
    const sorted = [...ranges].sort((a, b) => {
      if (a.rowStart !== b.rowStart) return a.rowStart - b.rowStart;
      return a.colStart - b.colStart;
    });

    const merged: typeof ranges = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i];
      const last = merged[merged.length - 1];

      // Check if ranges overlap or are adjacent
      if (
        current.rowStart <= last.rowEnd + 1 &&
        current.colStart <= last.colEnd + 1 &&
        current.rowEnd >= last.rowStart - 1 &&
        current.colEnd >= last.colStart - 1
      ) {
        // Merge ranges
        last.rowStart = Math.min(last.rowStart, current.rowStart);
        last.rowEnd = Math.max(last.rowEnd, current.rowEnd);
        last.colStart = Math.min(last.colStart, current.colStart);
        last.colEnd = Math.max(last.colEnd, current.colEnd);
      } else {
        merged.push(current);
      }
    }

    // Limit number of tracked ranges to prevent memory bloat
    if (merged.length > 10) {
      // Consolidate into a single large range
      const minRowStart = Math.min(...merged.map(r => r.rowStart));
      const maxRowEnd = Math.max(...merged.map(r => r.rowEnd));
      const minColStart = Math.min(...merged.map(r => r.colStart));
      const maxColEnd = Math.max(...merged.map(r => r.colEnd));

      return [{ rowStart: minRowStart, rowEnd: maxRowEnd, colStart: minColStart, colEnd: maxColEnd }];
    }

    return merged;
  }

  /**
   * Clear loaded ranges when switching sheets
   */
  private clearLoadedRanges(): void {
    this.loadedRanges.set([]);
    this.pendingLazyLoad = null;
  }
}
