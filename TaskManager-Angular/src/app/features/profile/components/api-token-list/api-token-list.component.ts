import { Component, OnInit, inject, signal, output } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ApiTokenService } from '../../services/api-token.service';
import { ApiToken } from '../../models/api-token.model';

@Component({
  selector: 'app-api-token-list',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './api-token-list.component.html',
  styleUrls: ['./api-token-list.component.scss']
})
export class ApiTokenListComponent implements OnInit {
  private tokenService = inject(ApiTokenService);

  tokens = signal<ApiToken[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  revokingId = signal<string | null>(null);

  tokenRevoked = output<string>();

  ngOnInit(): void {
    this.loadTokens();
  }

  async loadTokens(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    const { tokens, error } = await this.tokenService.listTokens();

    if (error) {
      this.error.set(error.message);
    } else {
      this.tokens.set(tokens);
    }

    this.loading.set(false);
  }

  async revokeToken(token: ApiToken): Promise<void> {
    if (!confirm(`Etes-vous sur de vouloir revoquer le token "${token.name}" ?`)) {
      return;
    }

    this.revokingId.set(token.id);

    const result = await this.tokenService.revokeToken(token.id);

    if (result.success) {
      this.tokenRevoked.emit(token.id);
      await this.loadTokens();
    } else {
      this.error.set(result.error || 'Erreur lors de la revocation');
    }

    this.revokingId.set(null);
  }

  isExpired(token: ApiToken): boolean {
    if (!token.expires_at) return false;
    return new Date(token.expires_at) < new Date();
  }

  getActiveTokens(): ApiToken[] {
    return this.tokens().filter(t => t.is_active && !this.isExpired(t));
  }

  getRevokedTokens(): ApiToken[] {
    return this.tokens().filter(t => !t.is_active || this.isExpired(t));
  }
}
