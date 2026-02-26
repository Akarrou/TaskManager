import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../../core/services/auth';
import { ProfileStore } from '../../store/profile.store';
import { ApiTokenListComponent } from '../../components/api-token-list/api-token-list.component';
import { ApiTokenCreateComponent } from '../../components/api-token-create/api-token-create.component';
import { GoogleCalendarConnectComponent } from '../../../google-calendar/components/google-calendar-connect/google-calendar-connect.component';
import { GoogleCalendarSettingsComponent } from '../../../google-calendar/components/google-calendar-settings/google-calendar-settings.component';
import { GoogleCalendarStore } from '../../../google-calendar/store/google-calendar.store';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ApiTokenListComponent, ApiTokenCreateComponent, GoogleCalendarConnectComponent, GoogleCalendarSettingsComponent],
  templateUrl: './profile-page.component.html',
  styleUrls: ['./profile-page.component.scss']
})
export class ProfilePageComponent implements OnInit {
  readonly profileStore = inject(ProfileStore);
  private authService = inject(AuthService);
  private router = inject(Router);
  readonly gcalStore = inject(GoogleCalendarStore);

  // Profile form
  fullName = signal('');
  profileLoading = signal(false);

  // Success/error for profile update
  success = signal<string | null>(null);

  // Password form
  newPassword = signal('');
  confirmPassword = signal('');
  passwordLoading = signal(false);
  passwordError = signal<string | null>(null);
  passwordSuccess = signal<string | null>(null);

  // MCP config
  copiedField = signal<string | null>(null);
  mcpPassword = signal('');
  showMcpPassword = signal(false);

  ngOnInit(): void {
    // ProfileStore auto-loads via onInit hook
    this.gcalStore.loadConnection();
    // Set initial fullName from store when profile loads
    const profile = this.profileStore.profile();
    if (profile) {
      this.fullName.set(profile.full_name || '');
    }
  }

  async updateProfile(): Promise<void> {
    this.profileLoading.set(true);
    this.success.set(null);

    const { success: _success, error } = await this.profileStore.updateProfile({
      full_name: this.fullName()
    });

    if (error) {
      // error is available via profileStore.error()
    } else {
      this.success.set('Profil mis à jour avec succès');
      const profile = this.profileStore.profile();
      if (profile) {
        this.fullName.set(profile.full_name || '');
      }
    }
    this.profileLoading.set(false);
  }

  async changePassword(): Promise<void> {
    this.passwordError.set(null);
    this.passwordSuccess.set(null);

    if (!this.newPassword() || !this.confirmPassword()) {
      this.passwordError.set('Veuillez remplir tous les champs');
      return;
    }

    if (this.newPassword() !== this.confirmPassword()) {
      this.passwordError.set('Les mots de passe ne correspondent pas');
      return;
    }

    if (this.newPassword().length < 6) {
      this.passwordError.set('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    this.passwordLoading.set(true);

    const { success: _success2, error } = await this.profileStore.changePassword(this.newPassword());

    if (error) {
      this.passwordError.set(error);
    } else {
      this.passwordSuccess.set('Mot de passe modifié avec succès');
      this.newPassword.set('');
      this.confirmPassword.set('');
    }
    this.passwordLoading.set(false);
  }

  goBack(): void {
    this.router.navigate(['/dashboard']);
  }

  // MCP Server configuration methods
  getMcpBasicAuthToken(): string {
    const email = this.profileStore.profile()?.email || '';
    const password = this.mcpPassword();
    if (!email || !password) return '';
    return btoa(`${email}:${password}`);
  }

  getMcpJsonConfig(): string {
    const token = this.getMcpBasicAuthToken();
    const authHeader = token ? `Basic ${token}` : 'Basic <votre-token>';
    return `{
  "mcpServers": {
    "kodo": {
      "type": "http",
      "url": "https://mcp.logicfractals.fr/mcp",
      "headers": {
        "Authorization": "${authHeader}"
      }
    }
  }
}`;
  }

  toggleMcpPasswordVisibility(): void {
    this.showMcpPassword.set(!this.showMcpPassword());
  }

  async copyToClipboard(text: string, fieldName: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copiedField.set(fieldName);
      setTimeout(() => {
        this.copiedField.set(null);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  }

  // API Token methods - now handled by store, just trigger reload
  onTokenCreated(): void {
    // Store auto-reloads tokens when createToken is called
    // This is kept for backwards compatibility with the event binding
  }
}
