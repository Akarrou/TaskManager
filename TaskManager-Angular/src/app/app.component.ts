import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SupabaseService } from './core/services/supabase';
import { AuthService } from './core/services/auth';
import { HeaderNavComponent } from './shared/components/header-nav/header-nav.component';
import { ToastComponent } from './shared/components/toast/toast.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, HeaderNavComponent, ToastComponent],
  template: `
    <div class="app-container">
      @if (isInitialized()) {
        <app-header-nav></app-header-nav>
        <main class="main-content">
          <router-outlet></router-outlet>
        </main>
        <app-toast></app-toast>
      } @else {
        <div class="app-loading">
          <div class="loading-spinner">
            <div class="spinner">🔄</div>
          </div>
          <p class="loading-text">Initialisation de l'application...</p>
          <p class="loading-progress">{{ initStatus() }}</p>
        </div>
      }
    </div>
  `,
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  title = 'AgroFlow Task Manager';
  isInitialized = signal(false);
  initStatus = signal('Démarrage...');
  
  private supabaseService = inject(SupabaseService);
  private authService = inject(AuthService);

  async ngOnInit() {
    console.log('🚀 Début de l\'initialisation...');
    this.initStatus.set('🚀 Démarrage de l\'application...');
    
    try {
      // ÉTAPE 1: Tester la connexion Supabase de base
      this.initStatus.set('📡 Connexion à Supabase...');
      console.log('📡 Test de connexion Supabase...');
      await this.testSupabaseConnection();
      
      // ÉTAPE 2: Simuler une connexion utilisateur pour les tests
      this.initStatus.set('👤 Authentification de l\'utilisateur de test...');
      console.log('👤 Tentative de connexion de l\'utilisateur de test...');
      const { user, error: authError } = await this.authService.signInWithEmail('jeromevalette31@gmail.com', 'Hyna.321');
      if (authError || !user) {
        console.warn('⚠️ Échec de la connexion de l\'utilisateur de test:', authError?.message);
        // On peut décider de s'arrêter ici ou de continuer en mode "anonyme"
      } else {
        console.log(`✅ Utilisateur de test connecté: ${user.email}`);
      }
      
      this.initStatus.set('✅ Initialisation terminée !');
      console.log('✅ Initialisation réussie');
      
      // Petit délai pour voir le message de succès
      setTimeout(() => {
        this.isInitialized.set(true);
      }, 500);
      
    } catch (error) {
      console.error('❌ Erreur d\'initialisation:', error);
      console.log('🔄 Continuons quand même...');
      this.initStatus.set('⚠️ Initialisation avec erreurs...');
      
      setTimeout(() => {
        this.isInitialized.set(true);
      }, 1000);
    }
  }

  private async testSupabaseConnection() {
    try {
      const supabase = this.supabaseService.client;
      console.log('🔌 Client Supabase créé:', !!supabase);
      
      // Test simple avec la méthode healthCheck du service
      const { data, error } = await this.supabaseService.healthCheck();
      
      if (error) {
        console.warn('⚠️ Erreur de connexion Supabase:', this.supabaseService.handleError(error));
      } else {
        console.log('✅ Connexion Supabase réussie !', data ? 'Données récupérées' : 'Base accessible');
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
      console.log('✅ Supabase connecté avec succès');
    }
  }

  private async initializeAuth(): Promise<void> {
    // Initialiser l'état d'authentification
    await this.authService.initialize();
    console.log('✅ Service d\'authentification initialisé');
  }
} 