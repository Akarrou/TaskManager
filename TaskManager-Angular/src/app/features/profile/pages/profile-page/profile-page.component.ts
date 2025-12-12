import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ProfileService } from '../../services/profile.service';
import { AuthService } from '../../../../core/services/auth';
import { Profile } from '../../models/profile.model';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile-page.component.html',
  styleUrls: ['./profile-page.component.scss']
})
export class ProfilePageComponent implements OnInit {
  private profileService = inject(ProfileService);
  private authService = inject(AuthService);
  private router = inject(Router);

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

  ngOnInit(): void {
    this.loadProfile();
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
}
