import { Component, ChangeDetectionStrategy, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { GoogleCalendarStore } from '../../store/google-calendar.store';

@Component({
  selector: 'app-google-calendar-callback',
  standalone: true,
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './google-calendar-callback.component.html',
  styleUrls: ['./google-calendar-callback.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GoogleCalendarCallbackComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly store = inject(GoogleCalendarStore);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly processing = signal(true);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    const code = this.route.snapshot.queryParamMap.get('code');
    const state = this.route.snapshot.queryParamMap.get('state');

    if (!code || !state) {
      this.processing.set(false);
      this.error.set('Paramètres OAuth manquants. Veuillez réessayer la connexion.');
      return;
    }

    this.handleCallback(code, state);
  }

  private async handleCallback(code: string, state: string): Promise<void> {
    try {
      await this.store.handleOAuthCallback(code, state);
      this.snackBar.open('Google Calendar connecté avec succès', 'OK', { duration: 3000 });
      this.router.navigate(['/profile']);
    } catch (err) {
      this.processing.set(false);
      const message = err instanceof Error ? err.message : 'Erreur lors de la connexion à Google Calendar';
      this.error.set(message);
    }
  }
}
