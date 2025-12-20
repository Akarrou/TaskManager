import { Component, Input, Output, EventEmitter, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
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
 * Time granularity options for the timeline
 */
export type TimeGranularity = 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';

/**
 * Granularity option for display
 */
interface GranularityOption {
  value: TimeGranularity;
  label: string;
  icon: string;
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
  imports: [CommonModule, MatIconModule, MatButtonModule, MatTooltipModule, MatMenuModule, MatDividerModule],
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
  readonly BASE_TIMELINE_WIDTH = 1200;
  readonly TASK_COLUMN_WIDTH = 250;
  readonly ROW_HEIGHT = 40;
  readonly PADDING = 50;

  // Minimum width per time unit for readability (in pixels)
  readonly MIN_WIDTH_PER_UNIT: Record<TimeGranularity, number> = {
    hour: 80,    // 80px minimum per hour
    day: 100,    // 100px minimum per day
    week: 150,   // 150px minimum per week
    month: 120,  // 120px minimum per month
    quarter: 150, // 150px minimum per quarter
    year: 100,   // 100px minimum per year
  };

  // Expose Math for template
  readonly Math = Math;

  // Available granularity options
  readonly granularityOptions: GranularityOption[] = [
    { value: 'hour', label: 'Heure', icon: 'schedule' },
    { value: 'day', label: 'Jour', icon: 'today' },
    { value: 'week', label: 'Semaine', icon: 'view_week' },
    { value: 'month', label: 'Mois', icon: 'calendar_view_month' },
    { value: 'quarter', label: 'Trimestre', icon: 'date_range' },
    { value: 'year', label: 'Année', icon: 'calendar_today' },
  ];

  // Current granularity selection (default: auto-detect based on data range)
  currentGranularity = signal<TimeGranularity | 'auto'>('auto');

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

  // Get the current granularity label
  currentGranularityLabel = computed(() => {
    const granularity = this.currentGranularity();
    if (granularity === 'auto') {
      return 'Auto';
    }
    const option = this.granularityOptions.find((o) => o.value === granularity);
    return option?.label || 'Auto';
  });

  // Get the current granularity icon
  currentGranularityIcon = computed(() => {
    const granularity = this.currentGranularity();
    if (granularity === 'auto') {
      return 'auto_fix_high';
    }
    const option = this.granularityOptions.find((o) => o.value === granularity);
    return option?.icon || 'auto_fix_high';
  });

  // Computed: Get effective granularity (auto-detect if 'auto')
  effectiveGranularity = computed((): TimeGranularity => {
    const selected = this.currentGranularity();
    if (selected !== 'auto') {
      return selected;
    }

    // Auto-detect based on data range
    const range = this.dateRange();
    if (!range) return 'day';

    const totalTime = range.max.getTime() - range.min.getTime();
    const hours = totalTime / (1000 * 60 * 60);
    const days = hours / 24;

    if (hours <= 24) {
      return 'hour';
    } else if (days <= 14) {
      return 'day';
    } else if (days <= 90) {
      return 'week';
    } else if (days <= 365) {
      return 'month';
    } else if (days <= 730) {
      return 'quarter';
    } else {
      return 'year';
    }
  });

  // Computed: Calculate the number of time units in the range
  timeUnitsCount = computed((): number => {
    const range = this.dateRange();
    if (!range) return 0;

    const granularity = this.effectiveGranularity();
    const totalTime = range.max.getTime() - range.min.getTime();

    switch (granularity) {
      case 'hour':
        return Math.ceil(totalTime / (1000 * 60 * 60));
      case 'day':
        return Math.ceil(totalTime / (1000 * 60 * 60 * 24));
      case 'week':
        return Math.ceil(totalTime / (1000 * 60 * 60 * 24 * 7));
      case 'month':
        return Math.ceil(totalTime / (1000 * 60 * 60 * 24 * 30));
      case 'quarter':
        return Math.ceil(totalTime / (1000 * 60 * 60 * 24 * 91));
      case 'year':
        return Math.ceil(totalTime / (1000 * 60 * 60 * 24 * 365));
    }
  });

  // Computed: Calculate the dynamic dates area width based on granularity
  datesAreaWidth = computed((): number => {
    const granularity = this.effectiveGranularity();
    const unitsCount = this.timeUnitsCount();
    const minWidthPerUnit = this.MIN_WIDTH_PER_UNIT[granularity];

    // Calculate minimum required width for dates area
    const requiredWidth = unitsCount * minWidthPerUnit + 2 * this.PADDING;

    // Return the larger of the required width or the base width minus task column
    return Math.max(requiredWidth, this.BASE_TIMELINE_WIDTH - this.TASK_COLUMN_WIDTH);
  });

  // Computed: Calculate the total timeline width (including task column)
  timelineWidth = computed((): number => {
    return this.datesAreaWidth() + this.TASK_COLUMN_WIDTH;
  });

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
    const datesWidth = this.datesAreaWidth();

    // Need either date-range column or start date column
    if (!dateRangeColId && !startColumnId) return [];
    if (!range) return [];

    const totalTime = range.max.getTime() - range.min.getTime();
    const usableWidth = datesWidth - 2 * this.PADDING;

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

  // Computed: Generate time markers based on granularity
  timeMarkers = computed(() => {
    const range = this.dateRange();
    if (!range) return [];

    const datesWidth = this.datesAreaWidth();
    const totalTime = range.max.getTime() - range.min.getTime();
    const usableWidth = datesWidth - 2 * this.PADDING;
    const granularity = this.effectiveGranularity();

    // Get interval and format based on granularity
    const { interval, format, getNextDate } = this.getGranularityConfig(granularity);

    const markers: { x: number; label: string }[] = [];

    // Align start to granularity boundary
    let currentDate = this.alignToGranularity(range.min, granularity);

    while (currentDate.getTime() <= range.max.getTime()) {
      const offset = currentDate.getTime() - range.min.getTime();
      const x = this.PADDING + (offset / totalTime) * usableWidth;

      // Only add marker if it's within the visible range
      if (x >= this.PADDING && x <= datesWidth - this.PADDING) {
        markers.push({
          x,
          label: format(currentDate),
        });
      }

      // Move to next interval
      currentDate = getNextDate(currentDate);
    }

    return markers;
  });

  /**
   * Get configuration for a specific granularity
   */
  private getGranularityConfig(granularity: TimeGranularity): {
    interval: number;
    format: (date: Date) => string;
    getNextDate: (date: Date) => Date;
  } {
    switch (granularity) {
      case 'hour':
        return {
          interval: 1000 * 60 * 60,
          format: (d) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          getNextDate: (d) => new Date(d.getTime() + 1000 * 60 * 60),
        };
      case 'day':
        return {
          interval: 1000 * 60 * 60 * 24,
          format: (d) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
          getNextDate: (d) => {
            const next = new Date(d);
            next.setDate(next.getDate() + 1);
            return next;
          },
        };
      case 'week':
        return {
          interval: 1000 * 60 * 60 * 24 * 7,
          format: (d) => `S${this.getWeekNumber(d)} - ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`,
          getNextDate: (d) => {
            const next = new Date(d);
            next.setDate(next.getDate() + 7);
            return next;
          },
        };
      case 'month':
        return {
          interval: 1000 * 60 * 60 * 24 * 30,
          format: (d) => d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }),
          getNextDate: (d) => {
            const next = new Date(d);
            next.setMonth(next.getMonth() + 1);
            return next;
          },
        };
      case 'quarter':
        return {
          interval: 1000 * 60 * 60 * 24 * 91,
          format: (d) => `T${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`,
          getNextDate: (d) => {
            const next = new Date(d);
            next.setMonth(next.getMonth() + 3);
            return next;
          },
        };
      case 'year':
        return {
          interval: 1000 * 60 * 60 * 24 * 365,
          format: (d) => d.getFullYear().toString(),
          getNextDate: (d) => {
            const next = new Date(d);
            next.setFullYear(next.getFullYear() + 1);
            return next;
          },
        };
    }
  }

  /**
   * Align a date to the start of a granularity period
   */
  private alignToGranularity(date: Date, granularity: TimeGranularity): Date {
    const aligned = new Date(date);

    switch (granularity) {
      case 'hour':
        aligned.setMinutes(0, 0, 0);
        break;
      case 'day':
        aligned.setHours(0, 0, 0, 0);
        break;
      case 'week':
        // Align to Monday
        const dayOfWeek = aligned.getDay();
        const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        aligned.setDate(aligned.getDate() + diff);
        aligned.setHours(0, 0, 0, 0);
        break;
      case 'month':
        aligned.setDate(1);
        aligned.setHours(0, 0, 0, 0);
        break;
      case 'quarter':
        const quarterMonth = Math.floor(aligned.getMonth() / 3) * 3;
        aligned.setMonth(quarterMonth, 1);
        aligned.setHours(0, 0, 0, 0);
        break;
      case 'year':
        aligned.setMonth(0, 1);
        aligned.setHours(0, 0, 0, 0);
        break;
    }

    return aligned;
  }

  /**
   * Get ISO week number
   */
  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

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
   * Change the time granularity
   */
  onSelectGranularity(granularity: TimeGranularity | 'auto'): void {
    this.currentGranularity.set(granularity);
  }

  /**
   * Check if a granularity is currently selected
   */
  isGranularitySelected(granularity: TimeGranularity | 'auto'): boolean {
    return this.currentGranularity() === granularity;
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
