import { Component, Input, Output, EventEmitter, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { DatabaseRow, DatabaseColumn, isDateRangeValue } from '../../models/database.model';

/**
 * Timeline item definition
 */
interface TimelineItem {
  id: string;
  row: DatabaseRow;
  title: string;
  startDate: Date;
  endDate?: Date;
  color: string;
  x: number;
  width: number;
  y: number;
}

/**
 * DatabaseTimelineViewComponent
 *
 * Timeline view for database rows, displaying events on a horizontal time axis.
 * Supports single dates (points) and date ranges (bars).
 */
@Component({
  selector: 'app-database-timeline-view',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatTooltipModule, MatMenuModule],
  templateUrl: './database-timeline-view.html',
  styleUrl: './database-timeline-view.scss',
})
export class DatabaseTimelineView {
  @Input() rows: DatabaseRow[] = [];
  @Input() columns: DatabaseColumn[] = [];
  @Input() startDateColumnId?: string;
  @Input() endDateColumnId?: string;
  @Input() dateRangeColumnId?: string; // New: for date-range column type

  @Output() rowClick = new EventEmitter<string>();
  @Output() addDateColumn = new EventEmitter<void>();
  @Output() configureDateColumns = new EventEmitter<void>();
  @Output() selectDateColumn = new EventEmitter<{ columnId: string; isDateRange: boolean }>();

  // Timeline configuration
  readonly TIMELINE_HEIGHT = 400;
  readonly TIMELINE_WIDTH = 1200;
  readonly ROW_HEIGHT = 40;
  readonly PADDING = 50;

  // Expose Math for template
  readonly Math = Math;

  // Current zoom/pan state
  currentZoom = signal(1);
  currentPan = signal(0);

  // Computed: Check if we have date columns (including date-range)
  hasDateColumn = computed(() => {
    return this.columns.some((col) => col.type === 'date' || col.type === 'date-range');
  });

  // Computed: Check if we're using a date-range column
  isUsingDateRange = computed(() => {
    return !!this.dateRangeColumnId;
  });

  // Computed: Get the start date column
  startDateColumn = computed(() => {
    const columnId = this.startDateColumnId;
    if (!columnId) return null;
    return this.columns.find((col) => col.id === columnId) || null;
  });

  // Computed: Get all date columns (date and date-range)
  availableDateColumns = computed(() => {
    return this.columns.filter((col) => col.type === 'date' || col.type === 'date-range');
  });

  // Computed: Get the currently selected column name
  selectedColumnName = computed(() => {
    if (this.dateRangeColumnId) {
      const col = this.columns.find((c) => c.id === this.dateRangeColumnId);
      return col?.name || 'Plage de dates';
    }
    if (this.startDateColumnId) {
      const col = this.columns.find((c) => c.id === this.startDateColumnId);
      return col?.name || 'Date';
    }
    return 'Sélectionner une colonne';
  });

  // Check if a column is currently selected
  isColumnSelected(columnId: string): boolean {
    return this.startDateColumnId === columnId || this.dateRangeColumnId === columnId;
  }

  // Computed: Get date range (min and max dates from all rows)
  dateRange = computed(() => {
    const dateRangeColId = this.dateRangeColumnId;
    const startColumnId = this.startDateColumnId;

    // Need either a date-range column or a start date column
    if (!dateRangeColId && !startColumnId) return null;

    const dates: Date[] = [];

    this.rows.forEach((row) => {
      if (dateRangeColId) {
        // Using date-range column
        const cellValue = row.cells[dateRangeColId];
        if (isDateRangeValue(cellValue)) {
          if (cellValue.startDate) {
            dates.push(new Date(cellValue.startDate));
          }
          if (cellValue.endDate) {
            dates.push(new Date(cellValue.endDate));
          }
        }
      } else if (startColumnId) {
        // Using separate date columns
        const startDate = row.cells[startColumnId];
        if (startDate) {
          dates.push(new Date(startDate as string));
        }

        if (this.endDateColumnId) {
          const endDate = row.cells[this.endDateColumnId];
          if (endDate) {
            dates.push(new Date(endDate as string));
          }
        }
      }
    });

    if (dates.length === 0) return null;

    const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));

    // Add padding (10% on each side)
    const range = maxDate.getTime() - minDate.getTime();
    const padding = range * 0.1;

    return {
      min: new Date(minDate.getTime() - padding),
      max: new Date(maxDate.getTime() + padding),
    };
  });

  // Computed: Generate timeline items
  timelineItems = computed((): TimelineItem[] => {
    const dateRangeColId = this.dateRangeColumnId;
    const startColumnId = this.startDateColumnId;
    const endColumnId = this.endDateColumnId;
    const range = this.dateRange();

    // Need either date-range column or start date column
    if (!dateRangeColId && !startColumnId) return [];
    if (!range) return [];

    const totalTime = range.max.getTime() - range.min.getTime();
    const usableWidth = this.TIMELINE_WIDTH - 2 * this.PADDING;

    const items: TimelineItem[] = [];

    this.rows.forEach((row, index) => {
      let startDate: Date | undefined;
      let endDate: Date | undefined;

      if (dateRangeColId) {
        // Using date-range column
        const cellValue = row.cells[dateRangeColId];
        if (!isDateRangeValue(cellValue) || !cellValue.startDate) return;

        startDate = new Date(cellValue.startDate);
        if (cellValue.endDate) {
          endDate = new Date(cellValue.endDate);
        }
      } else if (startColumnId) {
        // Using separate date columns
        const startValue = row.cells[startColumnId];
        if (!startValue) return;

        startDate = new Date(startValue as string);
        const endValue = endColumnId ? row.cells[endColumnId] : null;
        endDate = endValue ? new Date(endValue as string) : undefined;
      }

      if (!startDate) return;

      // Calculate position
      const startOffset = startDate.getTime() - range.min.getTime();
      const x = this.PADDING + (startOffset / totalTime) * usableWidth;

      let width = 10; // Default width for point
      if (endDate && endDate > startDate) {
        const duration = endDate.getTime() - startDate.getTime();
        width = Math.max(20, (duration / totalTime) * usableWidth);
      }

      items.push({
        id: row.id,
        row,
        title: this.getRowTitle(row),
        startDate,
        endDate,
        color: this.getEventColor(row),
        x,
        width,
        y: index * this.ROW_HEIGHT + 20,
      });
    });

    return items;
  });

  // Computed: Generate time markers
  timeMarkers = computed(() => {
    const range = this.dateRange();
    if (!range) return [];

    const totalTime = range.max.getTime() - range.min.getTime();
    const usableWidth = this.TIMELINE_WIDTH - 2 * this.PADDING;

    // Determine appropriate interval (day, week, month, year)
    const days = totalTime / (1000 * 60 * 60 * 24);
    let interval: number;
    let format: (date: Date) => string;

    if (days <= 7) {
      // Show days
      interval = 1000 * 60 * 60 * 24; // 1 day
      format = (d) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    } else if (days <= 90) {
      // Show weeks
      interval = 1000 * 60 * 60 * 24 * 7; // 1 week
      format = (d) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    } else if (days <= 730) {
      // Show months
      interval = 1000 * 60 * 60 * 24 * 30; // ~1 month
      format = (d) => d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
    } else {
      // Show years
      interval = 1000 * 60 * 60 * 24 * 365; // ~1 year
      format = (d) => d.getFullYear().toString();
    }

    const markers: { x: number; label: string }[] = [];
    let currentTime = Math.ceil(range.min.getTime() / interval) * interval;

    while (currentTime <= range.max.getTime()) {
      const offset = currentTime - range.min.getTime();
      const x = this.PADDING + (offset / totalTime) * usableWidth;
      markers.push({
        x,
        label: format(new Date(currentTime)),
      });
      currentTime += interval;
    }

    return markers;
  });

  /**
   * Get row title (first text column value)
   */
  getRowTitle(row: DatabaseRow): string {
    const textColumn = this.columns.find(
      (col) => col.type === 'text' && col.visible !== false
    );
    if (!textColumn) {
      return 'Sans titre';
    }
    const value = row.cells[textColumn.id];
    return value ? String(value) : 'Sans titre';
  }

  /**
   * Get event color based on row data
   */
  getEventColor(row: DatabaseRow): string {
    const selectColumn = this.columns.find(
      (col) => col.type === 'select' && col.visible !== false
    );

    if (selectColumn && selectColumn.options?.choices) {
      const cellValue = row.cells[selectColumn.id];
      const choice = selectColumn.options.choices.find((c) => c.id === cellValue);
      if (choice) {
        return this.getChoiceColor(choice.color);
      }
    }

    return '#3b82f6';
  }

  /**
   * Get color for a choice - supports both Tailwind classes and hex colors
   */
  private getChoiceColor(color: string): string {
    // If it's already a hex color, return it directly
    if (color?.startsWith('#')) {
      return color;
    }

    const colorMap: Record<string, string> = {
      'bg-gray-200': '#9ca3af',
      'bg-gray-300': '#6b7280',
      'bg-red-200': '#ef4444',
      'bg-red-300': '#dc2626',
      'bg-orange-200': '#f97316',
      'bg-yellow-200': '#eab308',
      'bg-green-200': '#22c55e',
      'bg-teal-200': '#14b8a6',
      'bg-cyan-200': '#06b6d4',
      'bg-blue-200': '#3b82f6',
      'bg-indigo-200': '#6366f1',
      'bg-purple-200': '#a855f7',
      'bg-pink-200': '#ec4899',
    };
    return colorMap[color] || '#9ca3af';
  }

  /**
   * Handle click on timeline item
   */
  onItemClick(itemId: string): void {
    this.rowClick.emit(itemId);
  }

  /**
   * Handle "Add date column" from empty state
   */
  onAddDateColumn(): void {
    this.addDateColumn.emit();
  }

  /**
   * Handle "Configure date columns"
   */
  onConfigureDateColumns(): void {
    this.configureDateColumns.emit();
  }

  /**
   * Handle column selection from menu
   */
  onSelectColumn(column: DatabaseColumn): void {
    this.selectDateColumn.emit({
      columnId: column.id,
      isDateRange: column.type === 'date-range',
    });
  }

  /**
   * Zoom in
   */
  zoomIn(): void {
    this.currentZoom.update((zoom) => Math.min(zoom * 1.2, 5));
  }

  /**
   * Zoom out
   */
  zoomOut(): void {
    this.currentZoom.update((zoom) => Math.max(zoom / 1.2, 0.5));
  }

  /**
   * Reset zoom
   */
  resetZoom(): void {
    this.currentZoom.set(1);
    this.currentPan.set(0);
  }
}
