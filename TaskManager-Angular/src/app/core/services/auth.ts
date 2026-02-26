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
    try {
      const { data: { session }, error } = await this.supabaseService.auth.getSession();
      if (error) {
        // Authentication check - silently ignore session retrieval errors
      } else {
        this.currentSession.set(session);
        this.currentUser.set(session?.user ?? null);
      }
    } catch {
      // Authentication check - silently ignore errors
    }

    // Écouter les changements d'état d'authentification
    const { data: authListener } = this.supabaseService.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        this.currentSession.set(session);
        this.currentUser.set(session?.user ?? null);
      }
    );
    
    if (authListener && authListener.subscription) {
        this.authStateSubscription = authListener.subscription;
    } else {
      // Auth listener not available - silently ignore
    }
  }

  getCurrentUserId(): string | null {
    return this.currentUser()?.id || null;
  }

  async signInWithEmail(email: string, password: string): Promise<{ user: User | null, error: Error | null }> {
    const { data, error } = await this.supabaseService.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { user: null, error };
    }
    
    if (data.user) {
      this.currentUser.set(data.user);
      this.currentSession.set(data.session);
    }

    return { user: data.user, error: null };
  }

  async signUp(email: string, password: string): Promise<{ user: User | null, error: Error | null }> {
    const { data, error } = await this.supabaseService.auth.signUp({
      email,
      password,
    });

    if (error) {
      return { user: null, error };
    }

    return { user: data.user, error: null };
  }

  async signOut(): Promise<{ error: Error | null }> {
    const { error } = await this.supabaseService.auth.signOut();
    return { error };
  }

  ngOnDestroy(): void {
    if (this.authStateSubscription) {
      this.authStateSubscription.unsubscribe();
    }
  }
}
