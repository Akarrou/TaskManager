import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private supabaseService = inject(SupabaseService);

  constructor() { }

  async initialize(): Promise<void> {
    // Initialisation du service d'authentification
    console.log('AuthService initialisé');
  }

  getCurrentUserId(): string | null {
    // Pour l'instant, retourne null - sera implémenté plus tard
    return null;
  }
}
