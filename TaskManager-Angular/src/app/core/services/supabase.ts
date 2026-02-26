import { Injectable, inject } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { EnvironmentService } from './environment.service';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private envService = inject(EnvironmentService);
  private supabase: SupabaseClient = createClient(
    this.envService.supabaseUrl,
    this.envService.supabaseAnonKey
  );

  get client() {
    return this.supabase;
  }

  get taskAttachments() {
    return this.supabase.from('task_attachments');
  }

  get auth() {
    return this.supabase.auth;
  }

  handleError(error: unknown): string {
    if (error && typeof error === 'object' && 'message' in error) {
      return (error as { message: string }).message;
    }
    return 'Une erreur est survenue';
  }
}
