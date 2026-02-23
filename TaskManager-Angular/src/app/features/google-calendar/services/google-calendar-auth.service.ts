import { Injectable, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';

import { SupabaseService } from '../../../core/services/supabase';
import { GoogleCalendarConnection } from '../models/google-calendar.model';

const OAUTH_STATE_KEY = 'gcal_oauth_state';

@Injectable({
  providedIn: 'root',
})
export class GoogleCalendarAuthService {
  private supabase = inject(SupabaseService);
  private readonly document = inject(DOCUMENT);

  private get client() {
    return this.supabase.client;
  }

  async initiateConnection(): Promise<void> {
    const { data, error } = await this.client.functions.invoke('google-calendar-auth-url');

    if (error) {
      throw new Error(`Failed to get auth URL: ${error.message}`);
    }

    // I1: Validate data before cast
    if (!data || typeof data.url !== 'string') {
      throw new Error('No auth URL returned from edge function');
    }

    const url = data.url;

    // C5: Store state in sessionStorage before redirect
    try {
      const urlObj = new URL(url);
      const state = urlObj.searchParams.get('state');
      if (state) {
        sessionStorage.setItem(OAUTH_STATE_KEY, state);
      }
    } catch {
      // URL parsing failure is non-fatal for state storage
    }

    // C4: Use injected DOCUMENT instead of window
    this.document.location.href = url;
  }

  async handleCallback(code: string, state: string): Promise<{ email: string }> {
    const { data, error } = await this.client.functions.invoke('google-calendar-exchange-token', {
      body: { code, state },
    });

    if (error) {
      throw new Error(`Failed to exchange token: ${error.message}`);
    }

    // I1: Validate data before cast
    if (!data || typeof data.email !== 'string') {
      throw new Error('Invalid response from token exchange');
    }

    return { email: data.email };
  }

  // C5: Validate OAuth state parameter
  validateOAuthState(receivedState: string): void {
    const storedState = sessionStorage.getItem(OAUTH_STATE_KEY);
    sessionStorage.removeItem(OAUTH_STATE_KEY);

    if (!storedState) {
      throw new Error('No OAuth state found in session. Please restart the connection flow.');
    }

    if (storedState !== receivedState) {
      throw new Error('OAuth state mismatch. Possible CSRF attack. Please retry.');
    }
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
