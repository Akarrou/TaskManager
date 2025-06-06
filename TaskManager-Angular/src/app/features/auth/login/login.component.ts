import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
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
        // Redirection vers le tableau de bord ou la page précédente
        this.router.navigate(['/dashboard']);
      }
    } catch (err: any) {
      this.error.set(err.message || 'Une erreur inattendue est survenue.');
    } finally {
      this.loading.set(false);
    }
  }
} 