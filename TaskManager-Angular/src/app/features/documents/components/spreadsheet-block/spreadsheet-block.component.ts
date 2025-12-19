import {
  Component,
  Input,
  OnInit,
  OnDestroy,
  AfterViewChecked,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
  ViewEncapsulation,
  ElementRef,
  ViewChildren,
  QueryList,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { Subject, debounceTime, takeUntil } from 'rxjs';

import { SpreadsheetService } from '../../services/spreadsheet.service';
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
} from '../../models/spreadsheet.model';

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
  ],
  templateUrl: './spreadsheet-block.component.html',
  styleUrl: './spreadsheet-block.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class SpreadsheetBlockComponent implements OnInit, OnDestroy, AfterViewChecked {
  private spreadsheetService = inject(SpreadsheetService);
  private formulaEngine = inject(FormulaEngineService);
  private destroy$ = new Subject<void>();

  // Reference to cell input for focus management
  @ViewChildren('cellInput') cellInputs!: QueryList<ElementRef<HTMLInputElement>>;
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

  // Grid dimensions (visible area)
  readonly visibleRowStart = signal(0);
  readonly visibleRowEnd = signal(50);
  readonly visibleColStart = signal(0);
  readonly visibleColEnd = signal(26); // A-Z

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

  // =====================================================================
  // Save Queue
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

  ngOnDestroy() {
    // Save any pending changes before destroying
    if (this.pendingUpdates.size > 0) {
      this.saveCells(Array.from(this.pendingUpdates.values()));
    }

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

        // Recursively update dependents of this cell
        this.updateDependentCells(dep.sheet || sheetId, dep.row, dep.col, cellsMap);
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

    // Update active cell
    this.activeCell.set({ row, col });

    // Update selection
    if (event?.shiftKey && this.activeCell()) {
      // Extend selection
      const anchor = this.selection()?.anchor || this.activeCell()!;
      this.selection.set({
        type: 'range',
        anchor,
        focus: { row, col },
      });
    } else {
      // Single cell selection
      this.selection.set({
        type: 'cell',
        anchor: { row, col },
        focus: { row, col },
      });
    }

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
}
