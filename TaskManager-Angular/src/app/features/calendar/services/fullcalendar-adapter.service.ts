import { Injectable } from '@angular/core';
import { EventInput } from '@fullcalendar/core';
import { EventEntry } from '../../../core/services/event-database.service';
import { CATEGORY_HEX_COLORS, EventCategory } from '../../../shared/models/event-constants';

@Injectable({ providedIn: 'root' })
export class FullCalendarAdapterService {

  /**
   * Convert EventEntry[] to FullCalendar EventInput[]
   */
  eventEntriesToCalendarEvents(entries: EventEntry[]): EventInput[] {
    return entries.map(entry => this.eventEntryToCalendarEvent(entry));
  }

  private eventEntryToCalendarEvent(entry: EventEntry): EventInput {
    const color = CATEGORY_HEX_COLORS[entry.category as EventCategory] || CATEGORY_HEX_COLORS.other;

    const event: EventInput = {
      id: entry.id,
      title: entry.title,
      allDay: entry.all_day,
      backgroundColor: color,
      borderColor: color,
      extendedProps: {
        databaseId: entry.databaseId,
        category: entry.category,
        location: entry.location,
        description: entry.description,
        event_number: entry.event_number,
      },
    };

    // Handle recurring events
    if (entry.recurrence) {
      try {
        // Parse the RRULE and provide it to FullCalendar's rrule plugin
        event.rrule = entry.recurrence;
        event.duration = this.calculateDuration(entry.start_date, entry.end_date);
        // dtstart is part of the rrule string or set separately
        if (!entry.recurrence.includes('DTSTART')) {
          event.rrule = `DTSTART:${this.toRRuleDateStr(entry.start_date)}\n${entry.recurrence}`;
        }
      } catch {
        // Fallback to non-recurring
        event.start = entry.start_date;
        event.end = entry.end_date;
      }
    } else {
      event.start = entry.start_date;
      event.end = entry.end_date;
    }

    return event;
  }

  /**
   * Calculate duration between start and end as ISO 8601 duration
   */
  private calculateDuration(start: string, end: string): string {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diffMs = endDate.getTime() - startDate.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  /**
   * Convert ISO date to RRULE DTSTART format
   */
  private toRRuleDateStr(isoDate: string): string {
    const date = new Date(isoDate);
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }
}
