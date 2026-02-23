import { Component, OnInit, inject, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ProfileService } from '../../services/profile.service';
import { AuthService } from '../../../../core/services/auth';
import { Profile } from '../../models/profile.model';
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
  private profileService = inject(ProfileService);
  private authService = inject(AuthService);
  private router = inject(Router);
  readonly gcalStore = inject(GoogleCalendarStore);

  @ViewChild(ApiTokenListComponent) tokenListComponent!: ApiTokenListComponent;

  profile = signal<Profile | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);
  success = signal<string | null>(null);

  // Profile form
  fullName = signal('');
  profileLoading = signal(false);

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
    this.loadProfile();
    this.gcalStore.loadConnection();
  }

  async loadProfile(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const { profile, error } = await this.profileService.getProfile();
      if (error) {
        this.error.set(error.message);
      } else if (profile) {
        this.profile.set(profile);
        this.fullName.set(profile.full_name || '');
      }
    } catch (err) {
      this.error.set('Erreur lors du chargement du profil');
    } finally {
      this.loading.set(false);
    }
  }

  async updateProfile(): Promise<void> {
    this.profileLoading.set(true);
    this.error.set(null);
    this.success.set(null);

    try {
      const { error } = await this.profileService.updateProfile({
        full_name: this.fullName()
      });

      if (error) {
        this.error.set(error.message);
      } else {
        this.success.set('Profil mis à jour avec succès');
        await this.loadProfile();
      }
    } catch (err) {
      this.error.set('Erreur lors de la mise à jour du profil');
    } finally {
      this.profileLoading.set(false);
    }
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

    try {
      const { error } = await this.profileService.changePassword(this.newPassword());

      if (error) {
        this.passwordError.set(error.message);
      } else {
        this.passwordSuccess.set('Mot de passe modifié avec succès');
        this.newPassword.set('');
        this.confirmPassword.set('');
      }
    } catch (err) {
      this.passwordError.set('Erreur lors du changement de mot de passe');
    } finally {
      this.passwordLoading.set(false);
    }
  }

  goBack(): void {
    this.router.navigate(['/dashboard']);
  }

  // MCP Server configuration methods
  getMcpBasicAuthToken(): string {
    const email = this.profile()?.email || '';
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

  // API Token methods
  onTokenCreated(): void {
    // Refresh the token list when a new token is created
    if (this.tokenListComponent) {
      this.tokenListComponent.loadTokens();
    }
  }
}
