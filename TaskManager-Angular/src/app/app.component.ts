import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SupabaseService } from './core/services/supabase';
import { AuthService } from './core/services/auth';
import { HeaderNavComponent } from './shared/components/header-nav/header-nav.component';
import { ToastComponent } from './shared/components/toast/toast.component';
import { Store } from '@ngrx/store';
import { AppState } from './app.state';
import * as ProjectActions from './features/projects/store/project.actions';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, HeaderNavComponent, ToastComponent],
  template: `
    <div class="app-container">
      <app-header-nav></app-header-nav>
      <main class="main-content">
        <router-outlet></router-outlet>
      </main>
      <app-toast></app-toast>
    </div>
  `,
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  title = 'Kōdo';

  private supabaseService = inject(SupabaseService);
  private authService = inject(AuthService);
  private store = inject(Store<AppState>);

  async ngOnInit() {
    // Charger les données initiales de l'application
    this.store.dispatch(ProjectActions.loadProjects());

    try {
      // Tester la connexion Supabase de base
      await this.testSupabaseConnection();
    } catch (error) {
      console.warn('⚠️ Initialisation avec erreurs...', error);
    }
  }

  private async testSupabaseConnection() {
    try {
      const supabase = this.supabaseService.client;
      if (supabase) {
      }

      // Test simple avec la méthode healthCheck du service
      const { data, error } = await this.supabaseService.healthCheck();

      if (error) {
        console.warn('⚠️ Erreur de connexion Supabase:', this.supabaseService.handleError(error));
      } else {
      }
    } catch (error) {
      console.warn('⚠️ Test Supabase échoué:', error);
    }
  }

  private async initializeSupabase(): Promise<void> {
    // Vérifier la connexion Supabase
    const { data, error } = await this.supabaseService.healthCheck();
    if (error) {
      console.warn('Avertissement connexion Supabase:', error);
    } else {
    }
  }

  private async initializeAuth(): Promise<void> {
    // Initialiser l'état d'authentification
    await this.authService.initialize();
  }
}
