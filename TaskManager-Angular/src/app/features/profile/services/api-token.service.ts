import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase';
import {
  ApiToken,
  CreateTokenRequest,
  CreateTokenResponse,
  RevokeTokenResponse
} from '../models/api-token.model';

@Injectable({
  providedIn: 'root'
})
export class ApiTokenService {
  private supabaseService = inject(SupabaseService);

  async listTokens(): Promise<{ tokens: ApiToken[]; error: Error | null }> {
    try {
      const { data, error } = await this.supabaseService.client.rpc('list_my_api_tokens');

      if (error) {
        return { tokens: [], error: new Error(error.message) };
      }

      return { tokens: data || [], error: null };
    } catch (err) {
      return { tokens: [], error: err as Error };
    }
  }

  async createToken(request: CreateTokenRequest): Promise<CreateTokenResponse> {
    try {
      const expiresAt = request.expires_at
        ? new Date(request.expires_at).toISOString()
        : null;

      const { data, error } = await this.supabaseService.client.rpc('create_api_token', {
        p_name: request.name,
        p_scopes: request.scopes || ['all'],
        p_expires_at: expiresAt,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return data as CreateTokenResponse;
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  async revokeToken(tokenId: string): Promise<RevokeTokenResponse> {
    try {
      const { data, error } = await this.supabaseService.client.rpc('revoke_api_token', {
        p_token_id: tokenId,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return data as RevokeTokenResponse;
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
