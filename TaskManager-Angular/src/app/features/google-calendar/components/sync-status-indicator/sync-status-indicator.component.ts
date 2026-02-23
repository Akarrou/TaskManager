import { Component, ChangeDetectionStrategy, inject, computed, output } from '@angular/core';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { GoogleCalendarStore } from '../../store/google-calendar.store';

type SyncStatusType = 'idle' | 'syncing' | 'error' | 'disconnected';

@Component({
  selector: 'app-sync-status-indicator',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
  ],
  templateUrl: './sync-status-indicator.component.html',
  styleUrls: ['./sync-status-indicator.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SyncStatusIndicatorComponent {
  private readonly store = inject(GoogleCalendarStore);

  readonly syncCompleted = output<void>();

  protected readonly syncStatus = this.store.syncStatus;
  protected readonly isConnected = this.store.isConnected;

  protected readonly tooltipText = computed(() => {
    const statusMap: Record<SyncStatusType, string> = {
      idle: 'Google Calendar synchronisé',
      syncing: 'Synchronisation en cours...',
      error: 'Erreur de synchronisation',
      disconnected: 'Google Calendar déconnecté',
    };
    return statusMap[this.syncStatus()];
  });

  protected readonly iconName = computed(() => {
    const iconMap: Record<SyncStatusType, string> = {
      idle: 'cloud_done',
      syncing: 'sync',
      error: 'sync_problem',
      disconnected: 'cloud_off',
    };
    return iconMap[this.syncStatus()];
  });

  async onClick(): Promise<void> {
    if (this.syncStatus() !== 'syncing') {
      await this.store.triggerSync();
      this.syncCompleted.emit();
    }
  }
}
