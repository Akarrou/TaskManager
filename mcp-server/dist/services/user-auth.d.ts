/**
 * User Authentication Service
 *
 * Validates user credentials against Supabase auth.users table
 * and provides user context for MCP sessions.
 */
/**
 * User info returned after successful authentication
 */
export interface AuthenticatedUser {
    id: string;
    email: string;
}
/**
 * Authenticate a user by email and password using Supabase Auth
 * Returns the user info if successful, null otherwise
 */
export declare function authenticateUser(email: string, password: string): Promise<AuthenticatedUser | null>;
/**
 * Set the authenticated user for a session
 */
export declare function setSessionUser(sessionId: string, user: AuthenticatedUser): void;
/**
 * Get the authenticated user for a session
 */
export declare function getSessionUser(sessionId: string): AuthenticatedUser | null;
/**
 * Remove session user on disconnect
 */
export declare function clearSessionUser(sessionId: string): void;
/**
 * Run a callback within an isolated async context for the given user.
 * Use this in the HTTP transport to ensure each concurrent request
 * has its own user context that cannot leak to other requests.
 */
export declare function runWithUser<T>(user: AuthenticatedUser | null, callback: () => T): T;
/**
 * Set the current request user context (fallback for stdio transport).
 * In HTTP mode, prefer `runWithUser()` for proper request isolation.
 * This function still works: if called inside an AsyncLocalStorage context
 * it is a no-op warning; otherwise it sets the global fallback.
 */
export declare function setCurrentRequestUser(user: AuthenticatedUser | null): void;
/**
 * Get the current request user context.
 * Reads from AsyncLocalStorage first (HTTP mode), then falls back
 * to the global variable (stdio mode).
 */
export declare function getCurrentRequestUser(): AuthenticatedUser | null;
/**
 * Get the current user ID for tools.
 * Throws if no user is authenticated (security requirement).
 */
export declare function getCurrentUserId(): string;
/**
 * Authenticate a user by API token (Bearer token)
 * Validates the token against the user_api_tokens table via RPC function
 * Returns the user info if successful, null otherwise
 */
export declare function authenticateByToken(token: string): Promise<AuthenticatedUser | null>;
//# sourceMappingURL=user-auth.d.ts.map