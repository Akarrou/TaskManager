import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { EventEntry } from '../../../../core/services/event-database.service';
import { CATEGORY_LABELS, CATEGORY_COLORS, EventCategory } from '../../../../shared/models/event-constants';
import { RruleToTextPipe } from '../../pipes/rrule-to-text.pipe';

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
  @Output() navigateToSource = new EventEmitter<string>();

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
      this.navigateToSource.emit(ev.databaseId);
    }
  }

  onLinkedItemClick(item: { type: string; id: string; label: string }): void {
    // Navigation can be handled by the parent component via the updated output
    // For now, this is a placeholder for linked item navigation
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
