import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { EnvironmentService } from './environment.service';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor(private envService: EnvironmentService) {
    this.supabase = createClient(
      this.envService.supabaseUrl,
      this.envService.supabaseAnonKey
    );

    // Log configuration in development
    if (!this.envService.production) {
      console.log('🔗 Supabase client initialized with:', {
        url: this.envService.supabaseUrl,
        key: this.envService.supabaseAnonKey.substring(0, 20) + '...'
      });
    }
  }

  get client() {
    return this.supabase;
  }

  async healthCheck() {
    try {
      const { data, error } = await this.supabase.from('tasks').select('count').limit(1);
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  }

  // Getters pour accès facile aux tables
  get tasks() {
    return this.supabase.from('tasks');
  }

  get taskComments() {
    return this.supabase.from('task_comments');
  }

  get taskAttachments() {
    return this.supabase.from('task_attachments');
  }

  get auth() {
    return this.supabase.auth;
  }

  handleError(error: any): string {
    return error?.message || 'Une erreur est survenue';
  }
}
