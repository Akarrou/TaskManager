import { inject } from '@angular/core';
import { signalStore, withState, withMethods, withHooks, patchState } from '@ngrx/signals';
import { ProfileService } from '../services/profile.service';
import { ApiTokenService } from '../services/api-token.service';
import { Profile, UpdateProfileRequest } from '../models/profile.model';
import { ApiToken, CreateTokenRequest, CreateTokenResponse } from '../models/api-token.model';

interface ProfileStoreState {
  profile: Profile | null;
  tokens: ApiToken[];
  loading: boolean;
  tokenLoading: boolean;
  error: string | null;
}

export const ProfileStore = signalStore(
  { providedIn: 'root' },

  withState<ProfileStoreState>({
    profile: null,
    tokens: [],
    loading: false,
    tokenLoading: false,
    error: null,
  }),

  withMethods((
    store,
    profileService = inject(ProfileService),
    apiTokenService = inject(ApiTokenService),
  ) => ({
    async loadProfile(): Promise<void> {
      patchState(store, { loading: true, error: null });
      try {
        const { profile, error } = await profileService.getProfile();
        if (error) {
          patchState(store, { loading: false, error: error.message });
        } else {
          patchState(store, { profile, loading: false });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to load profile';
        patchState(store, { loading: false, error: message });
      }
    },

    async updateProfile(data: UpdateProfileRequest): Promise<{ success: boolean; error: string | null }> {
      patchState(store, { loading: true, error: null });
      try {
        const { error } = await profileService.updateProfile(data);
        if (error) {
          patchState(store, { loading: false, error: error.message });
          return { success: false, error: error.message };
        }
        // Reload profile to get updated data
        const { profile } = await profileService.getProfile();
        patchState(store, { profile, loading: false });
        return { success: true, error: null };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to update profile';
        patchState(store, { loading: false, error: message });
        return { success: false, error: message };
      }
    },

    async changePassword(newPassword: string): Promise<{ success: boolean; error: string | null }> {
      patchState(store, { error: null });
      try {
        const { error } = await profileService.changePassword(newPassword);
        if (error) {
          patchState(store, { error: error.message });
          return { success: false, error: error.message };
        }
        return { success: true, error: null };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to change password';
        patchState(store, { error: message });
        return { success: false, error: message };
      }
    },

    async loadTokens(): Promise<void> {
      patchState(store, { tokenLoading: true, error: null });
      try {
        const { tokens, error } = await apiTokenService.listTokens();
        if (error) {
          patchState(store, { tokenLoading: false, error: error.message });
        } else {
          patchState(store, { tokens, tokenLoading: false });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to load tokens';
        patchState(store, { tokenLoading: false, error: message });
      }
    },

    async createToken(request: CreateTokenRequest): Promise<CreateTokenResponse> {
      patchState(store, { tokenLoading: true, error: null });
      try {
        const response = await apiTokenService.createToken(request);
        if (response.success) {
          // Reload tokens list
          const { tokens } = await apiTokenService.listTokens();
          patchState(store, { tokens, tokenLoading: false });
        } else {
          patchState(store, { tokenLoading: false, error: response.error ?? null });
        }
        return response;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to create token';
        patchState(store, { tokenLoading: false, error: message });
        return { success: false, error: message };
      }
    },

    async revokeToken(tokenId: string): Promise<{ success: boolean; error: string | null }> {
      patchState(store, { tokenLoading: true, error: null });
      try {
        const result = await apiTokenService.revokeToken(tokenId);
        if (result.success) {
          // Reload tokens list
          const { tokens } = await apiTokenService.listTokens();
          patchState(store, { tokens, tokenLoading: false });
          return { success: true, error: null };
        }
        patchState(store, { tokenLoading: false, error: result.error ?? null });
        return { success: false, error: result.error ?? null };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to revoke token';
        patchState(store, { tokenLoading: false, error: message });
        return { success: false, error: message };
      }
    },
  })),

  withHooks({
    onInit(store) {
      store.loadProfile();
      store.loadTokens();
    },
  }),
);
