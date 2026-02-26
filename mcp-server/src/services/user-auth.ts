/**
 * User Authentication Service
 *
 * Validates user credentials against Supabase auth.users table
 * and provides user context for MCP sessions.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { getSupabaseClient } from './supabase-client.js';
import { logger } from './logger.js';

/**
 * User info returned after successful authentication
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
}

/**
 * Session context storage - maps session IDs to authenticated users
 */
const sessionUsers = new Map<string, AuthenticatedUser>();

/**
 * AsyncLocalStorage for request-scoped user context.
 * Each HTTP request runs inside its own async context, preventing
 * cross-user data leakage under concurrent requests.
 */
const userAsyncStorage = new AsyncLocalStorage<AuthenticatedUser | null>();

/**
 * Fallback global user for stdio transport where AsyncLocalStorage
 * context is not used (single-user, no concurrency concern).
 */
let fallbackUser: AuthenticatedUser | null = null;

/**
 * Authenticate a user by email and password using Supabase Auth
 * Returns the user info if successful, null otherwise
 */
export async function authenticateUser(email: string, password: string): Promise<AuthenticatedUser | null> {
  try {
    const supabase = getSupabaseClient();

    // Use Supabase Auth to verify credentials
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      logger.warn({ email, error: error?.message }, 'Authentication failed');
      return null;
    }

    logger.info({ email, userId: data.user.id }, 'User authenticated successfully');

    return {
      id: data.user.id,
      email: data.user.email || email,
    };
  } catch (err) {
    logger.error({ email, error: err instanceof Error ? err.message : 'Unknown error' }, 'Authentication error');
    return null;
  }
}

/**
 * Set the authenticated user for a session
 */
export function setSessionUser(sessionId: string, user: AuthenticatedUser): void {
  sessionUsers.set(sessionId, user);
  logger.debug({ sessionId, userId: user.id }, 'Session user set');
}

/**
 * Get the authenticated user for a session
 */
export function getSessionUser(sessionId: string): AuthenticatedUser | null {
  return sessionUsers.get(sessionId) || null;
}

/**
 * Remove session user on disconnect
 */
export function clearSessionUser(sessionId: string): void {
  sessionUsers.delete(sessionId);
  logger.debug({ sessionId }, 'Session user cleared');
}

/**
 * Run a callback within an isolated async context for the given user.
 * Use this in the HTTP transport to ensure each concurrent request
 * has its own user context that cannot leak to other requests.
 */
export function runWithUser<T>(user: AuthenticatedUser | null, callback: () => T): T {
  return userAsyncStorage.run(user, callback);
}

/**
 * Set the current request user context (fallback for stdio transport).
 * In HTTP mode, prefer `runWithUser()` for proper request isolation.
 * This function still works: if called inside an AsyncLocalStorage context
 * it is a no-op warning; otherwise it sets the global fallback.
 */
export function setCurrentRequestUser(user: AuthenticatedUser | null): void {
  fallbackUser = user;
}

/**
 * Get the current request user context.
 * Reads from AsyncLocalStorage first (HTTP mode), then falls back
 * to the global variable (stdio mode).
 */
export function getCurrentRequestUser(): AuthenticatedUser | null {
  const asyncUser = userAsyncStorage.getStore();
  // getStore() returns undefined when called outside any async context
  if (asyncUser !== undefined) {
    return asyncUser;
  }
  return fallbackUser;
}

/**
 * Get the current user ID for tools.
 * Throws if no user is authenticated (security requirement).
 */
export function getCurrentUserId(): string {
  const user = getCurrentRequestUser();
  if (!user) {
    throw new Error('No authenticated user. Authentication required.');
  }
  return user.id;
}

/**
 * Authenticate a user by API token (Bearer token)
 * Validates the token against the user_api_tokens table via RPC function
 * Returns the user info if successful, null otherwise
 */
export async function authenticateByToken(token: string): Promise<AuthenticatedUser | null> {
  try {
    // Quick format validation
    if (!token || !token.startsWith('kodo_')) {
      logger.warn('Invalid token format - must start with kodo_');
      return null;
    }

    const supabase = getSupabaseClient();

    // Call the validate_api_token function (uses service role, bypasses RLS)
    const { data, error } = await supabase.rpc('validate_api_token', {
      p_token: token,
    });

    if (error) {
      logger.warn({ error: error.message }, 'Token validation RPC failed');
      return null;
    }

    if (!data || data.length === 0) {
      logger.warn('Token authentication failed - invalid, expired, or revoked token');
      return null;
    }

    const result = data[0];
    logger.info({ userId: result.user_id, tokenName: result.token_name }, 'User authenticated via API token');

    return {
      id: result.user_id,
      email: result.email,
    };
  } catch (err) {
    logger.error({ error: err instanceof Error ? err.message : 'Unknown error' }, 'Token authentication error');
    return null;
  }
}
