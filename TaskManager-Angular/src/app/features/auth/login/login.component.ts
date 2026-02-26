import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth';
import { FormsModule } from '@angular/forms';
import { LogoComponent } from '../../../shared/components/logo/logo.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, LogoComponent],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  email = signal('');
  password = signal('');
  error = signal<string | null>(null);
  loading = signal(false);

  async handleLogin(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    if (!this.email() || !this.password()) {
      this.error.set('Veuillez renseigner l\'e-mail et le mot de passe.');
      this.loading.set(false);
      return;
    }
    
    try {
      const { error } = await this.authService.signInWithEmail(this.email(), this.password());
      if (error) {
        this.error.set('Échec de la connexion. Vérifiez vos identifiants.');
        console.error('Login error:', error);
      } else {
        this.router.navigate(['/dashboard']);
      }
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Une erreur inattendue est survenue.');
    } finally {
      this.loading.set(false);
    }
  }

  async handleSignup(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    if (!this.email() || !this.password()) {
      this.error.set('Veuillez renseigner l\'e-mail et le mot de passe.');
      this.loading.set(false);
      return;
    }

    try {
      const { error, user } = await this.authService.signUp(this.email(), this.password());
      if (error) {
        this.error.set(error.message);
      } else if (user && user.identities?.length === 0) {
        this.error.set('Ce compte existe déjà. Connectez-vous.');
      } else {
        // Success but check for email confirmation requirement
        if (!user?.email_confirmed_at) {
          this.error.set('Compte créé ! Veuillez vérifier vos emails pour confirmer.');
        } else {
           this.router.navigate(['/dashboard']);
        }
      }
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Erreur lors de l\'inscription.');
    } finally {
      this.loading.set(false);
    }
  }
} 