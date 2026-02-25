import { Component, inject, output } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ProfileStore } from '../../store/profile.store';
import { ApiToken } from '../../models/api-token.model';

@Component({
  selector: 'app-api-token-list',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './api-token-list.component.html',
  styleUrls: ['./api-token-list.component.scss']
})
export class ApiTokenListComponent {
  readonly profileStore = inject(ProfileStore);

  tokenRevoked = output<string>();

  async revokeToken(token: ApiToken): Promise<void> {
    if (!confirm(`Etes-vous sur de vouloir revoquer le token "${token.name}" ?`)) {
      return;
    }

    const result = await this.profileStore.revokeToken(token.id);

    if (result.success) {
      this.tokenRevoked.emit(token.id);
    }
  }

  isExpired(token: ApiToken): boolean {
    if (!token.expires_at) return false;
    return new Date(token.expires_at) < new Date();
  }

  getActiveTokens(): ApiToken[] {
    return this.profileStore.tokens().filter(t => t.is_active && !this.isExpired(t));
  }

  getRevokedTokens(): ApiToken[] {
    return this.profileStore.tokens().filter(t => !t.is_active || this.isExpired(t));
  }
}
