import { Component, ChangeDetectionStrategy, OnInit, inject, computed, effect } from '@angular/core';

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

  constructor() {
    // Reconcile existing configs missing calendar_color with available calendars
    effect(() => {
      const configs = this.syncConfigs();
      const calendars = this.availableCalendars();
      if (configs.length === 0 || calendars.length === 0) return;

      for (const config of configs) {
        if (config.calendar_color === null || config.calendar_color === undefined) {
          const calendar = calendars.find(c => c.id === config.google_calendar_id);
          if (calendar?.backgroundColor) {
            this.store.updateSyncConfig(config.id, { calendar_color: calendar.backgroundColor });
          }
        }
      }
    });
  }

  async ngOnInit(): Promise<void> {
    await this.store.loadConnection();
    this.store.loadCalendars();
    this.store.loadSyncConfigs();
  }

  isCalendarEnabled(calendarId: string): boolean {
    return this.syncConfigs().some(c => c.google_calendar_id === calendarId && c.is_enabled);
  }

  getConfigForCalendar(calendarId: string): GoogleCalendarSyncConfig | undefined {
    return this.syncConfigs().find(c => c.google_calendar_id === calendarId);
  }

  toggleCalendar(calendar: GoogleCalendarInfo, enabled: boolean): void {
    const existing = this.getConfigForCalendar(calendar.id);
    if (enabled) {
      if (existing) {
        this.store.updateSyncConfig(existing.id, { is_enabled: true });
      } else {
        const connectionId = this.store.connection()?.id;
        if (!connectionId) {
          return;
        }
        const isWritable = calendar.accessRole === 'owner' || calendar.accessRole === 'writer';
        this.store.createSyncConfig({
          connection_id: connectionId,
          google_calendar_id: calendar.id,
          google_calendar_name: calendar.summary,
          kodo_database_id: null,
          sync_direction: isWritable ? 'bidirectional' : 'from_google',
          is_enabled: true,
          last_sync_at: null,
          calendar_color: calendar.backgroundColor || null,
        });
      }
    } else if (existing) {
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
