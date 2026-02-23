import { Injectable } from '@angular/core';
import { EventInput } from '@fullcalendar/core';
import { EventEntry } from '../../../core/services/event-database.service';

@Injectable({ providedIn: 'root' })
export class FullCalendarAdapterService {

  /**
   * Convert EventEntry[] to FullCalendar EventInput[]
   */
  eventEntriesToCalendarEvents(entries: EventEntry[]): EventInput[] {
    return entries.map(entry => this.eventEntryToCalendarEvent(entry));
  }

  private eventEntryToCalendarEvent(entry: EventEntry): EventInput {
    const category = entry.category || 'other';

    const event: EventInput = {
      id: entry.id,
      title: entry.title,
      allDay: entry.all_day,
      extendedProps: {
        databaseId: entry.databaseId,
        category: entry.category,
        location: entry.location,
        description: entry.description,
        event_number: entry.event_number,
      },
    };

    // Color strategy: inline Google color if available, otherwise CSS class by category
    if (entry.color) {
      event.backgroundColor = this.hexToPastel(entry.color);
      event.borderColor = entry.color;
      event.textColor = this.darkenHex(entry.color);
      event.classNames = ['google-event'];
    } else {
      event.classNames = [`category-${category}`];
    }

    // Handle recurring events
    if (entry.recurrence) {
      try {
        event.rrule = entry.recurrence;
        event.duration = this.calculateDuration(entry.start_date, entry.end_date);
        if (!entry.recurrence.includes('DTSTART')) {
          event.rrule = `DTSTART:${this.toRRuleDateStr(entry.start_date)}\n${entry.recurrence}`;
        }
      } catch {
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
   * Blend hex color with 75% white for a pastel background
   */
  private hexToPastel(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    const pr = Math.round(r + (255 - r) * 0.75);
    const pg = Math.round(g + (255 - g) * 0.75);
    const pb = Math.round(b + (255 - b) * 0.75);

    return `#${pr.toString(16).padStart(2, '0')}${pg.toString(16).padStart(2, '0')}${pb.toString(16).padStart(2, '0')}`;
  }

  /**
   * Darken hex color to 30% for readable text
   */
  private darkenHex(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    const dr = Math.round(r * 0.3);
    const dg = Math.round(g * 0.3);
    const db = Math.round(b * 0.3);

    return `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}`;
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
