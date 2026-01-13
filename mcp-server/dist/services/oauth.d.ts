/**
 * OAuth 2.0 Service
 *
 * Implements OAuth 2.0 Authorization Code flow with PKCE
 * for Claude Desktop MCP integration.
 *
 * Flow:
 * 1. Client calls /authorize with PKCE challenge
 * 2. User authenticates via login form
 * 3. Server redirects to callback with authorization code
 * 4. Client exchanges code for access token via /token
 * 5. Client uses Bearer token for MCP requests
 */
export interface OAuthClient {
    client_id: string;
    client_secret?: string;
    redirect_uris: string[];
    client_name?: string;
    created_at: Date;
}
export interface AuthorizationCode {
    code: string;
    client_id: string;
    user_id: string;
    user_email: string;
    redirect_uri: string;
    code_challenge?: string;
    code_challenge_method?: 'S256' | 'plain';
    scope: string;
    expires_at: Date;
}
export interface AccessToken {
    access_token: string;
    token_type: 'Bearer';
    expires_in: number;
    refresh_token?: string;
    scope: string;
    user_id: string;
    user_email: string;
    created_at: Date;
    expires_at: Date;
}
export interface TokenValidation {
    valid: boolean;
    user_id?: string;
    user_email?: string;
    scope?: string;
}
/**
 * Register a new OAuth client (Dynamic Client Registration)
 */
export declare function registerClient(params: {
    redirect_uris: string[];
    client_name?: string;
}): OAuthClient;
/**
 * Get a registered client by ID
 */
export declare function getClient(client_id: string): OAuthClient | null;
/**
 * Validate redirect URI for a client
 */
export declare function validateRedirectUri(client: OAuthClient, redirect_uri: string): boolean;
/**
 * Create an authorization code after user authentication
 */
export declare function createAuthorizationCode(params: {
    client_id: string;
    user_id: string;
    user_email: string;
    redirect_uri: string;
    code_challenge?: string;
    code_challenge_method?: 'S256' | 'plain';
    scope?: string;
}): string;
/**
 * Exchange authorization code for access token
 */
export declare function exchangeCodeForToken(params: {
    code: string;
    client_id: string;
    redirect_uri: string;
    code_verifier?: string;
}): AccessToken | {
    error: string;
    error_description: string;
};
/**
 * Refresh an access token using a refresh token
 */
export declare function refreshAccessToken(refresh_token: string): AccessToken | {
    error: string;
    error_description: string;
};
/**
 * Validate an access token and return user info
 */
export declare function validateAccessToken(token: string): TokenValidation;
/**
 * Authenticate user with email/password for OAuth flow
 */
export declare function authenticateOAuthUser(email: string, password: string): Promise<{
    user_id: string;
    email: string;
} | null>;
/**
 * Get OAuth 2.0 server metadata
 */
export declare function getOAuthMetadata(baseUrl: string): Record<string, unknown>;
//# sourceMappingURL=oauth.d.ts.map