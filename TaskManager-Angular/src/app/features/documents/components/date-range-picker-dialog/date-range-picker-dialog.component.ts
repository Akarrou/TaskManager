import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  MAT_DIALOG_DATA,
  MatDialogRef,
  MatDialogModule,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';

import { DateRangeValue } from '../../models/database.model';

/**
 * Dialog data interface
 */
export interface DateRangePickerDialogData {
  value: DateRangeValue | null;
  includeTime: boolean;
}

/**
 * Dialog result interface
 */
export interface DateRangePickerDialogResult {
  value: DateRangeValue | null;
}

/**
 * Date Range Picker Dialog Component
 * Displays a calendar where user clicks twice to select start and end dates.
 * Optionally allows time selection.
 */
@Component({
  selector: 'app-date-range-picker-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './date-range-picker-dialog.component.html',
  styleUrl: './date-range-picker-dialog.component.scss',
})
export class DateRangePickerDialogComponent {
  private dialogRef = inject(MatDialogRef<DateRangePickerDialogComponent>);
  private data = inject<DateRangePickerDialogData>(MAT_DIALOG_DATA);

  // French locale
  readonly weekDays = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];
  readonly monthNames = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];

  // State
  currentMonth = signal(new Date());
  startDate = signal<Date | null>(null);
  endDate = signal<Date | null>(null);
  startTime = signal('09:00');
  endTime = signal('18:00');
  selectionPhase = signal<'start' | 'end'>('start');

  // Config
  includeTime = this.data.includeTime;

  // Computed
  currentMonthName = computed(() => {
    const date = this.currentMonth();
    return `${this.monthNames[date.getMonth()]} ${date.getFullYear()}`;
  });

  calendarDays = computed(() => {
    return this.generateCalendarDays(this.currentMonth());
  });

  constructor() {
    this.initializeFromData();
  }

  /**
   * Initialize dates from dialog data
   */
  private initializeFromData(): void {
    if (this.data.value) {
      if (this.data.value.startDate) {
        const start = new Date(this.data.value.startDate);
        this.startDate.set(start);
        if (this.data.value.startDate.includes('T')) {
          const hours = start.getHours().toString().padStart(2, '0');
          const minutes = start.getMinutes().toString().padStart(2, '0');
          this.startTime.set(`${hours}:${minutes}`);
        }
        // Start with month of start date
        this.currentMonth.set(new Date(start.getFullYear(), start.getMonth(), 1));
      }
      if (this.data.value.endDate) {
        const end = new Date(this.data.value.endDate);
        this.endDate.set(end);
        if (this.data.value.endDate.includes('T')) {
          const hours = end.getHours().toString().padStart(2, '0');
          const minutes = end.getMinutes().toString().padStart(2, '0');
          this.endTime.set(`${hours}:${minutes}`);
        }
      }
      // If both dates are set, we're ready for editing
      if (this.data.value.startDate && this.data.value.endDate) {
        this.selectionPhase.set('end');
      }
    }
  }

  /**
   * Generate calendar days for a given month
   */
  private generateCalendarDays(monthDate: Date): (Date | null)[][] {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();

    // First day of month (0 = Sunday, adjust for Monday start)
    const firstDay = new Date(year, month, 1);
    let startOffset = firstDay.getDay() - 1;
    if (startOffset < 0) startOffset = 6; // Sunday becomes 6

    // Number of days in month
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Generate weeks
    const weeks: (Date | null)[][] = [];
    let currentWeek: (Date | null)[] = [];

    // Add empty cells for days before month starts
    for (let i = 0; i < startOffset; i++) {
      currentWeek.push(null);
    }

    // Add days of month
    for (let day = 1; day <= daysInMonth; day++) {
      currentWeek.push(new Date(year, month, day));
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }

    // Fill remaining days of last week
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }
      weeks.push(currentWeek);
    }

    return weeks;
  }

  /**
   * Navigate to previous month
   */
  previousMonth(): void {
    const current = this.currentMonth();
    this.currentMonth.set(new Date(current.getFullYear(), current.getMonth() - 1, 1));
  }

  /**
   * Navigate to next month
   */
  nextMonth(): void {
    const current = this.currentMonth();
    this.currentMonth.set(new Date(current.getFullYear(), current.getMonth() + 1, 1));
  }

  /**
   * Handle day click
   */
  onDayClick(day: Date): void {
    if (this.selectionPhase() === 'start') {
      // First click: set start date
      this.startDate.set(day);
      this.endDate.set(null);
      this.selectionPhase.set('end');
    } else {
      // Second click: set end date
      const start = this.startDate();
      if (start && day < start) {
        // If clicked before start, swap them
        this.endDate.set(start);
        this.startDate.set(day);
      } else {
        this.endDate.set(day);
      }
      this.selectionPhase.set('start');
    }
  }

  /**
   * Check if a day is the start date
   */
  isStartDate(day: Date): boolean {
    const start = this.startDate();
    return start !== null && this.isSameDay(day, start);
  }

  /**
   * Check if a day is the end date
   */
  isEndDate(day: Date): boolean {
    const end = this.endDate();
    return end !== null && this.isSameDay(day, end);
  }

  /**
   * Check if a day is in the selected range
   */
  isInRange(day: Date): boolean {
    const start = this.startDate();
    const end = this.endDate();
    if (!start || !end) return false;
    return day > start && day < end;
  }

  /**
   * Check if a day is today
   */
  isToday(day: Date): boolean {
    return this.isSameDay(day, new Date());
  }

  /**
   * Helper to compare dates (ignoring time)
   */
  private isSameDay(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  /**
   * Get instruction text based on selection phase
   */
  getInstructionText(): string {
    if (this.selectionPhase() === 'start') {
      return 'Cliquez pour sélectionner la date de début';
    }
    return 'Cliquez pour sélectionner la date de fin';
  }

  /**
   * Clear selection
   */
  clear(): void {
    this.startDate.set(null);
    this.endDate.set(null);
    this.startTime.set('09:00');
    this.endTime.set('18:00');
    this.selectionPhase.set('start');
  }

  /**
   * Cancel and close dialog
   */
  cancel(): void {
    this.dialogRef.close();
  }

  /**
   * Confirm selection and close dialog
   */
  confirm(): void {
    const start = this.startDate();
    const end = this.endDate();

    if (!start && !end) {
      this.dialogRef.close({ value: null });
      return;
    }

    let startDateStr: string | null = null;
    let endDateStr: string | null = null;

    if (start) {
      if (this.includeTime) {
        const [hours, minutes] = this.startTime().split(':');
        start.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
        startDateStr = start.toISOString();
      } else {
        startDateStr = this.formatDateOnly(start);
      }
    }

    if (end) {
      if (this.includeTime) {
        const [hours, minutes] = this.endTime().split(':');
        end.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
        endDateStr = end.toISOString();
      } else {
        endDateStr = this.formatDateOnly(end);
      }
    }

    this.dialogRef.close({
      value: {
        startDate: startDateStr,
        endDate: endDateStr,
      },
    });
  }

  /**
   * Format date as YYYY-MM-DD
   */
  private formatDateOnly(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
