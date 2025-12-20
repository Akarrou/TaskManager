import { Pipe, PipeTransform } from '@angular/core';
import { DateRangeValue } from '../../features/documents/models/database.model';

/**
 * Pipe to format DateRangeValue for display
 * Transforms { startDate, endDate } into "1 avr. 2026 → 30 avr. 2026"
 * Supports includeTime option for displaying hours
 */
@Pipe({
  name: 'dateRangeFormat',
  standalone: true,
})
export class DateRangeFormatPipe implements PipeTransform {
  private readonly frenchMonths: string[] = [
    'janv.',
    'févr.',
    'mars',
    'avr.',
    'mai',
    'juin',
    'juil.',
    'août',
    'sept.',
    'oct.',
    'nov.',
    'déc.',
  ];

  /**
   * Transform a DateRangeValue to a formatted string
   * @param value - The date range value to format
   * @param includeTime - Whether to include time in the output
   * @returns Formatted string like "1 avr. 2026 → 30 avr. 2026" or "1 avr. 10:00 → 30 avr. 18:00"
   */
  transform(value: DateRangeValue | null | undefined, includeTime: boolean = false): string {
    if (!value) {
      return '';
    }

    const { startDate, endDate } = value;

    if (!startDate && !endDate) {
      return '';
    }

    const startFormatted = startDate ? this.formatDate(startDate, includeTime) : '...';
    const endFormatted = endDate ? this.formatDate(endDate, includeTime) : '...';

    return `${startFormatted} → ${endFormatted}`;
  }

  /**
   * Format a single ISO date string
   * @param isoDate - ISO date string (2026-04-01 or 2026-04-01T10:00:00)
   * @param includeTime - Whether to include time
   * @returns Formatted date string
   */
  private formatDate(isoDate: string, includeTime: boolean): string {
    const date = new Date(isoDate);

    if (isNaN(date.getTime())) {
      return isoDate;
    }

    const day = date.getDate();
    const month = this.frenchMonths[date.getMonth()];
    const year = date.getFullYear();

    let result = `${day} ${month} ${year}`;

    if (includeTime && isoDate.includes('T')) {
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      result = `${day} ${month} ${hours}:${minutes}`;
    }

    return result;
  }
}
