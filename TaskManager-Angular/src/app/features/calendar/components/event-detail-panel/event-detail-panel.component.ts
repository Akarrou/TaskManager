import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { EventEntry } from '../../../../core/services/event-database.service';
import { CATEGORY_LABELS, CATEGORY_COLORS, EventCategory } from '../../../../shared/models/event-constants';
import { LinkedItem } from '../../../documents/models/database.model';
import { RruleToTextPipe } from '../../pipes/rrule-to-text.pipe';
import { GoogleCalendarReminder } from '../../../google-calendar/models/google-calendar.model';

@Component({
  selector: 'app-event-detail-panel',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatDividerModule,
    MatTooltipModule,
    RruleToTextPipe,
  ],
  templateUrl: './event-detail-panel.component.html',
  styleUrls: ['./event-detail-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventDetailPanelComponent {
  @Input() set event(value: EventEntry | null) {
    this.eventSignal.set(value);
  }

  @Output() close = new EventEmitter<void>();
  @Output() edit = new EventEmitter<EventEntry>();
  @Output() deleted = new EventEmitter<{ databaseId: string; rowId: string }>();
  @Output() updated = new EventEmitter<{ databaseId: string; rowId: string; updates: Partial<EventEntry> }>();
  @Output() navigateToSource = new EventEmitter<{ databaseId: string; rowId: string; title: string }>();
  @Output() linkedItemClick = new EventEmitter<LinkedItem>();

  protected eventSignal = signal<EventEntry | null>(null);

  protected categoryLabel = computed(() => {
    const ev = this.eventSignal();
    if (!ev) return '';
    return CATEGORY_LABELS[ev.category as EventCategory] || ev.category;
  });

  protected categoryColors = computed(() => {
    const ev = this.eventSignal();
    if (!ev) return CATEGORY_COLORS.other;
    return CATEGORY_COLORS[ev.category as EventCategory] || CATEGORY_COLORS.other;
  });

  protected formattedStartDate = computed(() => {
    const ev = this.eventSignal();
    if (!ev) return '';
    return this.formatDateTime(ev.start_date, ev.all_day);
  });

  protected formattedEndDate = computed(() => {
    const ev = this.eventSignal();
    if (!ev) return '';
    return this.formatDateTime(ev.end_date, ev.all_day);
  });

  protected isMultiDay = computed(() => {
    const ev = this.eventSignal();
    if (!ev) return false;
    const start = new Date(ev.start_date);
    const end = new Date(ev.end_date);
    return start.toDateString() !== end.toDateString();
  });

  onClose(): void {
    this.close.emit();
  }

  onEdit(): void {
    const ev = this.eventSignal();
    if (ev) {
      this.edit.emit(ev);
    }
  }

  onDelete(): void {
    const ev = this.eventSignal();
    if (ev) {
      this.deleted.emit({ databaseId: ev.databaseId, rowId: ev.id });
    }
  }

  onNavigateToSource(): void {
    const ev = this.eventSignal();
    if (ev) {
      this.navigateToSource.emit({ databaseId: ev.databaseId, rowId: ev.id, title: ev.title });
    }
  }

  onLinkedItemClick(item: LinkedItem): void {
    this.linkedItemClick.emit(item);
  }

  getGoogleCalendarLink(googleEventId: string): string {
    const encodedId = btoa(googleEventId);
    return `https://calendar.google.com/calendar/event?eid=${encodedId}`;
  }

  formatReminder(reminder: GoogleCalendarReminder): string {
    const method = reminder.method === 'popup' ? 'Notification' : 'Email';
    if (reminder.minutes < 60) {
      return `${method} : ${reminder.minutes} min avant`;
    } else if (reminder.minutes < 1440) {
      const hours = Math.floor(reminder.minutes / 60);
      return `${method} : ${hours}h avant`;
    } else {
      const days = Math.floor(reminder.minutes / 1440);
      return `${method} : ${days} jour${days > 1 ? 's' : ''} avant`;
    }
  }

  private formatDateTime(isoDate: string, allDay: boolean): string {
    const date = new Date(isoDate);
    const dateOptions: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    };

    if (allDay) {
      return date.toLocaleDateString('fr-FR', dateOptions);
    }

    const timeOptions: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit',
    };

    const dateStr = date.toLocaleDateString('fr-FR', dateOptions);
    const timeStr = date.toLocaleTimeString('fr-FR', timeOptions);
    return `${dateStr} a ${timeStr}`;
  }
}
