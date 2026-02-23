import { Component, ChangeDetectionStrategy, OnInit, inject, computed } from '@angular/core';

import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';

import { GoogleCalendarStore } from '../../store/google-calendar.store';
import { GoogleCalendarInfo, GoogleCalendarSyncConfig, SyncDirection } from '../../models/google-calendar.model';

@Component({
  selector: 'app-google-calendar-settings',
  standalone: true,
  imports: [
    MatButtonToggleModule,
    MatIconModule,
    MatSlideToggleModule,
    MatTooltipModule,
  ],
  templateUrl: './google-calendar-settings.component.html',
  styleUrls: ['./google-calendar-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GoogleCalendarSettingsComponent implements OnInit {
  private readonly store = inject(GoogleCalendarStore);

  protected readonly availableCalendars = this.store.availableCalendars;
  protected readonly syncConfigs = this.store.syncConfigs;
  protected readonly loading = this.store.loading;

  protected readonly hasCalendars = computed(() => this.availableCalendars().length > 0);

  ngOnInit(): void {
    this.store.loadCalendars();
    this.store.loadSyncConfigs();
  }

  isCalendarEnabled(calendarId: string): boolean {
    return this.syncConfigs().some(c => c.google_calendar_id === calendarId);
  }

  getConfigForCalendar(calendarId: string): GoogleCalendarSyncConfig | undefined {
    return this.syncConfigs().find(c => c.google_calendar_id === calendarId);
  }

  toggleCalendar(calendar: GoogleCalendarInfo, enabled: boolean): void {
    const existing = this.getConfigForCalendar(calendar.id);
    if (enabled && !existing) {
      this.store.createSyncConfig({
        connection_id: '',
        google_calendar_id: calendar.id,
        google_calendar_name: calendar.summary,
        kodo_database_id: null,
        sync_direction: 'bidirectional',
        is_enabled: true,
        last_sync_at: null,
      });
    } else if (!enabled && existing) {
      this.store.updateSyncConfig(existing.id, { is_enabled: false });
    }
  }

  changeSyncDirection(configId: string, direction: SyncDirection): void {
    this.store.updateSyncConfig(configId, { sync_direction: direction });
  }

  changeDatabase(configId: string, databaseId: string): void {
    this.store.updateSyncConfig(configId, { kodo_database_id: databaseId });
  }

  syncNow(configId: string): void {
    this.store.triggerSync(configId);
  }

  refreshCalendars(): void {
    this.store.loadCalendars();
  }
}
