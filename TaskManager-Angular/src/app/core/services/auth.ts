import { Injectable, inject, signal, OnDestroy } from '@angular/core';
import { SupabaseService } from './supabase';
import { User, Session, AuthChangeEvent } from '@supabase/supabase-js';

@Injectable({
  providedIn: 'root'
})
export class AuthService implements OnDestroy {
  private supabaseService = inject(SupabaseService);
  get supabase() { return this.supabaseService; }
  
  readonly currentUser = signal<User | null>(null);
  readonly currentSession = signal<Session | null>(null);
  private authStateSubscription: { unsubscribe: () => void } | undefined = undefined;

  constructor() {
    this.initialize();
  }

  async initialize(): Promise<void> {
    console.log('AuthService: Initialisation...');
    try {
      const { data: { session }, error } = await this.supabaseService.auth.getSession();
      if (error) {
        console.error('AuthService: Erreur getSession initiale:', error.message);
      } else {
        this.currentSession.set(session);
        this.currentUser.set(session?.user ?? null);
        console.log('AuthService: Session initiale chargée, utilisateur:', this.currentUser()?.email);
      }
    } catch (e) {
      console.error('AuthService: Exception getSession initiale:', e);
    }

    // Écouter les changements d'état d'authentification
    const { data: authListener } = this.supabaseService.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        console.log('AuthService: onAuthStateChange event:', event);
        this.currentSession.set(session);
        this.currentUser.set(session?.user ?? null);
        console.log('AuthService: Nouvel utilisateur après AuthStateChange:', this.currentUser()?.email);
      }
    );
    
    if (authListener && authListener.subscription) {
        this.authStateSubscription = authListener.subscription;
    } else {
        console.warn('AuthService: Impossible de récupérer l\'abonnement onAuthStateChange.');
    }
    console.log('AuthService: Abonné aux changements d\'état d\'authentification.');
  }

  getCurrentUserId(): string | null {
    return this.currentUser()?.id || null;
  }

  async signInWithEmail(email: string, password: string): Promise<{ user: User | null, error: Error | null }> {
    console.log(`AuthService: Tentative de connexion pour ${email}...`);
    const { data, error } = await this.supabaseService.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('AuthService: Erreur de connexion:', error.message);
      return { user: null, error };
    }
    
    if (data.user) {
      console.log('AuthService: Connexion réussie, utilisateur:', data.user.email);
      // L'état est déjà mis à jour par onAuthStateChange, mais on peut forcer au cas où.
      this.currentUser.set(data.user);
      this.currentSession.set(data.session);
    }

    return { user: data.user, error: null };
  }

  async signOut(): Promise<{ error: Error | null }> {
    console.log('AuthService: Déconnexion...');
    const { error } = await this.supabaseService.auth.signOut();
    if (error) {
      console.error('AuthService: Erreur de déconnexion:', error.message);
    } else {
      console.log('AuthService: Déconnexion réussie.');
      // L'état est déjà mis à jour par onAuthStateChange.
    }
    return { error };
  }

  ngOnDestroy(): void {
    if (this.authStateSubscription) {
      this.authStateSubscription.unsubscribe();
      console.log('AuthService: Désabonné des changements d\'état d\'authentification.');
    }
  }
}
