import { Injectable, inject } from '@angular/core';

import { SupabaseService } from '../../../core/services/supabase';
import { GoogleCalendarConnection } from '../models/google-calendar.model';

@Injectable({
  providedIn: 'root',
})
export class GoogleCalendarAuthService {
  private supabase = inject(SupabaseService);

  private get client() {
    return this.supabase.client;
  }

  async initiateConnection(): Promise<void> {
    const { data, error } = await this.client.functions.invoke('google-calendar-auth-url');

    if (error) {
      throw new Error(`Failed to get auth URL: ${error.message}`);
    }

    const url = data?.url as string | undefined;
    if (!url) {
      throw new Error('No auth URL returned from edge function');
    }

    window.location.href = url;
  }

  async handleCallback(code: string, state: string): Promise<{ email: string }> {
    const { data, error } = await this.client.functions.invoke('google-calendar-exchange-token', {
      body: { code, state },
    });

    if (error) {
      throw new Error(`Failed to exchange token: ${error.message}`);
    }

    return { email: data.email as string };
  }

  async disconnect(): Promise<void> {
    const { error } = await this.client.functions.invoke('google-calendar-disconnect');

    if (error) {
      throw new Error(`Failed to disconnect: ${error.message}`);
    }
  }

  async getConnection(): Promise<GoogleCalendarConnection | null> {
    const { data: { user } } = await this.client.auth.getUser();
    if (!user) {
      return null;
    }

    const { data, error } = await this.client
      .from('google_calendar_connections')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to get connection: ${error.message}`);
    }

    return data as GoogleCalendarConnection | null;
  }
}
