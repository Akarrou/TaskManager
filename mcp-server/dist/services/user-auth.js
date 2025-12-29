/**
 * User Authentication Service
 *
 * Validates user credentials against Supabase auth.users table
 * and provides user context for MCP sessions.
 */
import { getSupabaseClient } from './supabase-client.js';
import { logger } from './logger.js';
/**
 * Session context storage - maps session IDs to authenticated users
 */
const sessionUsers = new Map();
/**
 * Global current user for the active request context
 * This is set per-request and used by tools
 */
let currentRequestUser = null;
/**
 * Authenticate a user by email and password using Supabase Auth
 * Returns the user info if successful, null otherwise
 */
export async function authenticateUser(email, password) {
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
    }
    catch (err) {
        logger.error({ email, error: err instanceof Error ? err.message : 'Unknown error' }, 'Authentication error');
        return null;
    }
}
/**
 * Set the authenticated user for a session
 */
export function setSessionUser(sessionId, user) {
    sessionUsers.set(sessionId, user);
    logger.debug({ sessionId, userId: user.id }, 'Session user set');
}
/**
 * Get the authenticated user for a session
 */
export function getSessionUser(sessionId) {
    return sessionUsers.get(sessionId) || null;
}
/**
 * Remove session user on disconnect
 */
export function clearSessionUser(sessionId) {
    sessionUsers.delete(sessionId);
    logger.debug({ sessionId }, 'Session user cleared');
}
/**
 * Set the current request user context
 * Called at the start of each request handling
 */
export function setCurrentRequestUser(user) {
    currentRequestUser = user;
}
/**
 * Get the current request user context
 * Used by tools to get the authenticated user
 */
export function getCurrentRequestUser() {
    return currentRequestUser;
}
/**
 * Get the current user ID for tools
 * Throws if no user is authenticated (security requirement)
 */
export function getCurrentUserId() {
    if (!currentRequestUser) {
        throw new Error('No authenticated user. Authentication required.');
    }
    return currentRequestUser.id;
}
/**
 * Authenticate a user by API token (Bearer token)
 * Validates the token against the user_api_tokens table via RPC function
 * Returns the user info if successful, null otherwise
 */
export async function authenticateByToken(token) {
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
    }
    catch (err) {
        logger.error({ error: err instanceof Error ? err.message : 'Unknown error' }, 'Token authentication error');
        return null;
    }
}
//# sourceMappingURL=user-auth.js.map