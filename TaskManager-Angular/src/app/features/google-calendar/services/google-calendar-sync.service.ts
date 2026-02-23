import { Injectable, inject, DestroyRef } from '@angular/core';

import { GoogleCalendarApiService } from './google-calendar-api.service';
import { GoogleCalendarStore } from '../store/google-calendar.store';

const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable({
  providedIn: 'root',
})
export class GoogleCalendarSyncService {
  private apiService = inject(GoogleCalendarApiService);
  private store = inject(GoogleCalendarStore);
  private destroyRef = inject(DestroyRef);

  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.stopAutoSync();
    });
  }

  startAutoSync(): void {
    if (this.intervalId !== null) {
      return;
    }

    this.intervalId = setInterval(() => {
      this.syncAll();
    }, AUTO_SYNC_INTERVAL_MS);
  }

  stopAutoSync(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async syncNow(): Promise<void> {
    await this.syncAll();
  }

  private async syncAll(): Promise<void> {
    try {
      const configs = await this.apiService.getSyncConfigs();
      const enabledConfigs = configs.filter(c => c.is_enabled);

      for (const config of enabledConfigs) {
        await this.store.triggerSync(config.id);
      }
    } catch (error) {
      console.error('[GoogleCalendarSyncService] syncAll failed:', error);
    }
  }
}
