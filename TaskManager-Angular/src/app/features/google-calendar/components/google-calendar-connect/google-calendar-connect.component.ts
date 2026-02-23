import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { DatePipe } from '@angular/common';

import { GoogleCalendarStore } from '../../store/google-calendar.store';

@Component({
  selector: 'app-google-calendar-connect',
  standalone: true,
  imports: [
    DatePipe,
  ],
  templateUrl: './google-calendar-connect.component.html',
  styleUrls: ['./google-calendar-connect.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GoogleCalendarConnectComponent {
  private readonly store = inject(GoogleCalendarStore);

  protected readonly connection = this.store.connection;
  protected readonly isConnected = this.store.isConnected;
  protected readonly loading = this.store.loading;

  connect(): void {
    this.store.connect();
  }

  disconnect(): void {
    if (confirm('Voulez-vous vraiment déconnecter Google Calendar ?')) {
      this.store.disconnect();
    }
  }
}
