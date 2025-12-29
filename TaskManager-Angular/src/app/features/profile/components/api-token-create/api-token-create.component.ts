import { Component, inject, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiTokenService } from '../../services/api-token.service';
import {
  CreateTokenResponse,
  AVAILABLE_SCOPES,
  EXPIRATION_OPTIONS
} from '../../models/api-token.model';

@Component({
  selector: 'app-api-token-create',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './api-token-create.component.html',
  styleUrls: ['./api-token-create.component.scss']
})
export class ApiTokenCreateComponent {
  private tokenService = inject(ApiTokenService);

  // Form state
  tokenName = signal('');
  selectedScopes = signal<string[]>(['all']);
  expirationDays = signal<number | null>(null);

  // UI state
  isCreating = signal(false);
  error = signal<string | null>(null);
  newToken = signal<string | null>(null);
  tokenCopied = signal(false);

  // Outputs
  tokenCreated = output<CreateTokenResponse>();

  // Constants
  availableScopes = AVAILABLE_SCOPES;
  expirationOptions = EXPIRATION_OPTIONS;

  toggleScope(scope: string): void {
    const current = this.selectedScopes();

    if (scope === 'all') {
      this.selectedScopes.set(['all']);
      return;
    }

    // Remove 'all' if selecting specific scope
    let updated = current.filter(s => s !== 'all');

    if (current.includes(scope)) {
      updated = updated.filter(s => s !== scope);
    } else {
      updated.push(scope);
    }

    // If no scopes selected, default to 'all'
    if (updated.length === 0) {
      updated = ['all'];
    }

    this.selectedScopes.set(updated);
  }

  async createToken(): Promise<void> {
    if (!this.tokenName().trim()) {
      this.error.set('Le nom du token est requis');
      return;
    }

    this.isCreating.set(true);
    this.error.set(null);
    this.newToken.set(null);

    const expiresAt = this.expirationDays()
      ? new Date(Date.now() + this.expirationDays()! * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const result = await this.tokenService.createToken({
      name: this.tokenName().trim(),
      scopes: this.selectedScopes(),
      expires_at: expiresAt,
    });

    if (result.success && result.token) {
      this.newToken.set(result.token);
      this.tokenCreated.emit(result);
      this.resetForm();
    } else {
      this.error.set(result.error || 'Erreur lors de la creation du token');
    }

    this.isCreating.set(false);
  }

  async copyToken(): Promise<void> {
    const token = this.newToken();
    if (!token) return;

    try {
      await navigator.clipboard.writeText(token);
      this.tokenCopied.set(true);
      setTimeout(() => this.tokenCopied.set(false), 2000);
    } catch (err) {
      console.error('Failed to copy token:', err);
    }
  }

  dismissToken(): void {
    this.newToken.set(null);
    this.tokenCopied.set(false);
  }

  private resetForm(): void {
    this.tokenName.set('');
    this.selectedScopes.set(['all']);
    this.expirationDays.set(null);
  }
}
