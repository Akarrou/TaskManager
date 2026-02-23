import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { DatePipe } from '@angular/common';

import { MatDialog } from '@angular/material/dialog';

import { GoogleCalendarStore } from '../../store/google-calendar.store';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '../../../../shared/components/confirm-dialog/confirm-dialog.component';

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
  private readonly dialog = inject(MatDialog);

  protected readonly connection = this.store.connection;
  protected readonly isConnected = this.store.isConnected;
  protected readonly loading = this.store.loading;

  connect(): void {
    this.store.connect();
  }

  disconnect(): void {
    this.dialog
      .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
        data: {
          title: 'Déconnecter Google Calendar',
          message: 'Voulez-vous vraiment déconnecter Google Calendar ? Les configurations de synchronisation seront supprimées.',
        },
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) {
          this.store.disconnect();
        }
      });
  }
}
