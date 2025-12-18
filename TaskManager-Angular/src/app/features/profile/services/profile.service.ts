import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';
import { Profile, UpdateProfileRequest } from '../models/profile.model';

@Injectable({
  providedIn: 'root'
})
export class ProfileService {
  private supabaseService = inject(SupabaseService);
  private authService = inject(AuthService);

  async getProfile(): Promise<{ profile: Profile | null; error: Error | null }> {
    const userId = this.authService.getCurrentUserId();
    if (!userId) {
      return { profile: null, error: new Error('Utilisateur non connecté') };
    }

    const user = this.authService.currentUser();
    if (!user) {
      return { profile: null, error: new Error('Utilisateur non connecté') };
    }

    // Return profile from auth user data
    const profile: Profile = {
      id: user.id,
      email: user.email || '',
      full_name: user.user_metadata?.['full_name'] || null,
      avatar_url: user.user_metadata?.['avatar_url'] || null,
      created_at: user.created_at || '',
      updated_at: user.updated_at || ''
    };

    return { profile, error: null };
  }

  async updateProfile(data: UpdateProfileRequest): Promise<{ error: Error | null }> {
    const { error } = await this.supabaseService.auth.updateUser({
      data: {
        full_name: data.full_name
      }
    });

    if (error) {
      return { error: new Error(error.message) };
    }

    return { error: null };
  }

  async changePassword(newPassword: string): Promise<{ error: Error | null }> {
    const { error } = await this.supabaseService.auth.updateUser({
      password: newPassword
    });

    if (error) {
      return { error: new Error(error.message) };
    }

    return { error: null };
  }

  async updateEmail(newEmail: string): Promise<{ error: Error | null }> {
    const { error } = await this.supabaseService.auth.updateUser({
      email: newEmail
    });

    if (error) {
      return { error: new Error(error.message) };
    }

    return { error: null };
  }
}
