import { Component, Input, Output, EventEmitter, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DatabaseRow, DatabaseColumn } from '../../models/database.model';

/**
 * Calendar day definition
 */
interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  rows: DatabaseRow[];
}

/**
 * DatabaseCalendarViewComponent
 *
 * Calendar view for database rows, grouped by date.
 * Features monthly grid with navigation.
 */
@Component({
  selector: 'app-database-calendar-view',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatTooltipModule],
  templateUrl: './database-calendar-view.html',
  styleUrl: './database-calendar-view.scss',
})
export class DatabaseCalendarView {
  @Input() rows: DatabaseRow[] = [];
  @Input() columns: DatabaseColumn[] = [];
  @Input() dateColumnId?: string;

  @Output() rowClick = new EventEmitter<string>();
  @Output() addDateColumn = new EventEmitter<void>();
  @Output() configureDateColumn = new EventEmitter<void>();

  // Current month signal
  currentMonth = signal(new Date());

  // Computed: Check if we have date columns
  hasDateColumn = computed(() => {
    return this.columns.some((col) => col.type === 'date');
  });

  // Computed: Get the date column
  dateColumn = computed(() => {
    const columnId = this.dateColumnId;
    if (!columnId) return null;
    return this.columns.find((col) => col.id === columnId) || null;
  });

  // Computed: Generate calendar grid
  calendarDays = computed((): CalendarDay[] => {
    const month = this.currentMonth();
    const dateColumnId = this.dateColumnId;

    if (!dateColumnId) {
      return [];
    }

    // Generate grid for the month
    const days = this.generateCalendarGrid(month);

    // Assign rows to days
    return days.map((day) => ({
      ...day,
      rows: this.rows.filter((row) => {
        const cellDate = row.cells[dateColumnId];
        if (!cellDate) return false;
        return this.isSameDay(new Date(cellDate as string), day.date);
      }),
    }));
  });

  // Computed: Get month name
  monthName = computed(() => {
    const date = this.currentMonth();
    return date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  });

  /**
   * Generate calendar grid for a given month
   * Returns 42 days (6 weeks x 7 days)
   */
  private generateCalendarGrid(month: Date): CalendarDay[] {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();

    // First day of the month
    const firstDay = new Date(year, monthIndex, 1);
    const firstDayOfWeek = (firstDay.getDay() + 6) % 7; // Monday = 0, Sunday = 6

    // Number of days in the month
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

    // Previous month info
    const prevMonth = new Date(year, monthIndex, 0);
    const prevMonthLastDay = prevMonth.getDate();

    const days: CalendarDay[] = [];
    const today = new Date();

    // Days from previous month
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const date = new Date(year, monthIndex - 1, prevMonthLastDay - i);
      days.push({
        date,
        isCurrentMonth: false,
        isToday: this.isSameDay(date, today),
        rows: [],
      });
    }

    // Days of current month
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, monthIndex, i);
      days.push({
        date,
        isCurrentMonth: true,
        isToday: this.isSameDay(date, today),
        rows: [],
      });
    }

    // Days from next month to fill the grid (42 days total)
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      const date = new Date(year, monthIndex + 1, i);
      days.push({
        date,
        isCurrentMonth: false,
        isToday: this.isSameDay(date, today),
        rows: [],
      });
    }

    return days;
  }

  /**
   * Check if two dates are the same day
   */
  private isSameDay(date1: Date, date2: Date): boolean {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }

  /**
   * Navigate to previous month
   */
  previousMonth(): void {
    this.currentMonth.update((date) => {
      const newDate = new Date(date);
      newDate.setMonth(newDate.getMonth() - 1);
      return newDate;
    });
  }

  /**
   * Navigate to next month
   */
  nextMonth(): void {
    this.currentMonth.update((date) => {
      const newDate = new Date(date);
      newDate.setMonth(newDate.getMonth() + 1);
      return newDate;
    });
  }

  /**
   * Go to today's month
   */
  today(): void {
    this.currentMonth.set(new Date());
  }

  /**
   * Get row title (first text column value)
   */
  getRowTitle(row: DatabaseRow): string {
    // Find first visible text column
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
   * For now, use a default color. Could be enhanced with a "status" or "priority" column
   */
  getEventColor(row: DatabaseRow): string {
    // Check if there's a select column we can use for color
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

    // Default color
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
   * Handle click on row
   */
  onRowClick(rowId: string): void {
    this.rowClick.emit(rowId);
  }

  /**
   * Handle "Add date column" from empty state
   */
  onAddDateColumn(): void {
    this.addDateColumn.emit();
  }

  /**
   * Handle "Configure date column"
   */
  onConfigureDateColumn(): void {
    this.configureDateColumn.emit();
  }
}
