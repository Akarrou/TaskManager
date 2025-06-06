import { inject, Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(
      environment.supabaseUrl,
      environment.supabaseAnonKey
    );
  }

  async getUsers(): Promise<{ id: string; email: string }[]> {
    const { data, error } = await this.supabase.rpc('get_all_users');

    if (error) {
      console.error('Error fetching users:', error);
      return [];
    }
    return data || [];
  }
} 