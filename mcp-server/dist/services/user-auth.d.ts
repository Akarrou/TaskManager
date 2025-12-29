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
 * Set the current request user context
 * Called at the start of each request handling
 */
export declare function setCurrentRequestUser(user: AuthenticatedUser | null): void;
/**
 * Get the current request user context
 * Used by tools to get the authenticated user
 */
export declare function getCurrentRequestUser(): AuthenticatedUser | null;
/**
 * Get the current user ID for tools
 * Throws if no user is authenticated (security requirement)
 */
export declare function getCurrentUserId(): string;
/**
 * Authenticate a user by API token (Bearer token)
 * Validates the token against the user_api_tokens table via RPC function
 * Returns the user info if successful, null otherwise
 */
export declare function authenticateByToken(token: string): Promise<AuthenticatedUser | null>;
//# sourceMappingURL=user-auth.d.ts.map