import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private supabaseService = inject(SupabaseService);

  async getUsers(): Promise<{ id: string; email: string }[]> {
    const { data, error } = await this.supabaseService.client.rpc('get_all_users');

    if (error) {
      console.error('Error fetching users:', error);
      return [];
    }
    return data || [];
  }
} 