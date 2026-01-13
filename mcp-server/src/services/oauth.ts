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

import { randomBytes, createHash } from 'crypto';
import { logger } from './logger.js';
import { authenticateUser } from './user-auth.js';

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// Storage (In-memory - consider Redis/DB for production)
// ============================================================================

const registeredClients = new Map<string, OAuthClient>();
const authorizationCodes = new Map<string, AuthorizationCode>();
const accessTokens = new Map<string, AccessToken>();
const refreshTokens = new Map<string, { access_token: string; user_id: string; user_email: string }>();

// ============================================================================
// Configuration
// ============================================================================

const TOKEN_EXPIRY_SECONDS = 3600; // 1 hour
const CODE_EXPIRY_SECONDS = 600; // 10 minutes
const REFRESH_TOKEN_EXPIRY_SECONDS = 86400 * 30; // 30 days

// ============================================================================
// Utility Functions
// ============================================================================

function generateToken(length: number = 32): string {
  return randomBytes(length).toString('hex');
}

function generateClientId(): string {
  return `client_${randomBytes(16).toString('hex')}`;
}

function generateClientSecret(): string {
  return `secret_${randomBytes(32).toString('hex')}`;
}

function hashCodeVerifier(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

// Clean up expired tokens periodically
setInterval(() => {
  const now = new Date();

  // Clean expired authorization codes
  for (const [code, data] of authorizationCodes.entries()) {
    if (data.expires_at < now) {
      authorizationCodes.delete(code);
    }
  }

  // Clean expired access tokens
  for (const [token, data] of accessTokens.entries()) {
    if (data.expires_at < now) {
      accessTokens.delete(token);
    }
  }
}, 60000); // Every minute

// ============================================================================
// Client Registration
// ============================================================================

/**
 * Register a new OAuth client (Dynamic Client Registration)
 */
export function registerClient(params: {
  redirect_uris: string[];
  client_name?: string;
}): OAuthClient {
  const client: OAuthClient = {
    client_id: generateClientId(),
    client_secret: generateClientSecret(),
    redirect_uris: params.redirect_uris,
    client_name: params.client_name,
    created_at: new Date(),
  };

  registeredClients.set(client.client_id, client);
  logger.info({ client_id: client.client_id, client_name: client.client_name }, 'OAuth client registered');

  return client;
}

/**
 * Get a registered client by ID
 */
export function getClient(client_id: string): OAuthClient | null {
  // For Claude Desktop, allow any client_id (public client)
  // In production, you might want stricter validation
  const client = registeredClients.get(client_id);
  if (client) return client;

  // Allow unregistered public clients (like Claude Desktop)
  // They can use any redirect_uri that matches Claude's callback
  return {
    client_id,
    redirect_uris: ['*'], // Allow any redirect for public clients
    created_at: new Date(),
  };
}

/**
 * Validate redirect URI for a client
 */
export function validateRedirectUri(client: OAuthClient, redirect_uri: string): boolean {
  // Allow any redirect for wildcard clients
  if (client.redirect_uris.includes('*')) return true;

  // Check if redirect_uri matches registered URIs
  return client.redirect_uris.some((uri) => {
    if (uri === redirect_uri) return true;
    // Allow pattern matching for registered URIs
    if (uri.endsWith('*')) {
      return redirect_uri.startsWith(uri.slice(0, -1));
    }
    return false;
  });
}

// ============================================================================
// Authorization Code
// ============================================================================

/**
 * Create an authorization code after user authentication
 */
export function createAuthorizationCode(params: {
  client_id: string;
  user_id: string;
  user_email: string;
  redirect_uri: string;
  code_challenge?: string;
  code_challenge_method?: 'S256' | 'plain';
  scope?: string;
}): string {
  const code = generateToken(32);

  const authCode: AuthorizationCode = {
    code,
    client_id: params.client_id,
    user_id: params.user_id,
    user_email: params.user_email,
    redirect_uri: params.redirect_uri,
    code_challenge: params.code_challenge,
    code_challenge_method: params.code_challenge_method || 'S256',
    scope: params.scope || 'mcp',
    expires_at: new Date(Date.now() + CODE_EXPIRY_SECONDS * 1000),
  };

  authorizationCodes.set(code, authCode);
  logger.info({ client_id: params.client_id, user_id: params.user_id }, 'Authorization code created');

  return code;
}

/**
 * Exchange authorization code for access token
 */
export function exchangeCodeForToken(params: {
  code: string;
  client_id: string;
  redirect_uri: string;
  code_verifier?: string;
}): AccessToken | { error: string; error_description: string } {
  const authCode = authorizationCodes.get(params.code);

  if (!authCode) {
    return { error: 'invalid_grant', error_description: 'Authorization code not found or expired' };
  }

  // Validate code hasn't expired
  if (authCode.expires_at < new Date()) {
    authorizationCodes.delete(params.code);
    return { error: 'invalid_grant', error_description: 'Authorization code expired' };
  }

  // Validate client_id matches
  if (authCode.client_id !== params.client_id) {
    return { error: 'invalid_grant', error_description: 'Client ID mismatch' };
  }

  // Validate redirect_uri matches
  if (authCode.redirect_uri !== params.redirect_uri) {
    return { error: 'invalid_grant', error_description: 'Redirect URI mismatch' };
  }

  // Validate PKCE code_verifier if code_challenge was provided
  if (authCode.code_challenge) {
    if (!params.code_verifier) {
      return { error: 'invalid_grant', error_description: 'Code verifier required' };
    }

    let computedChallenge: string;
    if (authCode.code_challenge_method === 'S256') {
      computedChallenge = hashCodeVerifier(params.code_verifier);
    } else {
      computedChallenge = params.code_verifier;
    }

    if (computedChallenge !== authCode.code_challenge) {
      return { error: 'invalid_grant', error_description: 'Code verifier mismatch' };
    }
  }

  // Delete the authorization code (single use)
  authorizationCodes.delete(params.code);

  // Create access token
  const access_token = `mcp_${generateToken(32)}`;
  const refresh_token = `mcp_refresh_${generateToken(32)}`;

  const token: AccessToken = {
    access_token,
    token_type: 'Bearer',
    expires_in: TOKEN_EXPIRY_SECONDS,
    refresh_token,
    scope: authCode.scope,
    user_id: authCode.user_id,
    user_email: authCode.user_email,
    created_at: new Date(),
    expires_at: new Date(Date.now() + TOKEN_EXPIRY_SECONDS * 1000),
  };

  accessTokens.set(access_token, token);
  refreshTokens.set(refresh_token, {
    access_token,
    user_id: authCode.user_id,
    user_email: authCode.user_email,
  });

  logger.info({ user_id: authCode.user_id }, 'Access token created');

  return token;
}

// ============================================================================
// Token Refresh
// ============================================================================

/**
 * Refresh an access token using a refresh token
 */
export function refreshAccessToken(refresh_token: string): AccessToken | { error: string; error_description: string } {
  const refreshData = refreshTokens.get(refresh_token);

  if (!refreshData) {
    return { error: 'invalid_grant', error_description: 'Invalid refresh token' };
  }

  // Delete old tokens
  accessTokens.delete(refreshData.access_token);
  refreshTokens.delete(refresh_token);

  // Create new access token
  const new_access_token = `mcp_${generateToken(32)}`;
  const new_refresh_token = `mcp_refresh_${generateToken(32)}`;

  const token: AccessToken = {
    access_token: new_access_token,
    token_type: 'Bearer',
    expires_in: TOKEN_EXPIRY_SECONDS,
    refresh_token: new_refresh_token,
    scope: 'mcp',
    user_id: refreshData.user_id,
    user_email: refreshData.user_email,
    created_at: new Date(),
    expires_at: new Date(Date.now() + TOKEN_EXPIRY_SECONDS * 1000),
  };

  accessTokens.set(new_access_token, token);
  refreshTokens.set(new_refresh_token, {
    access_token: new_access_token,
    user_id: refreshData.user_id,
    user_email: refreshData.user_email,
  });

  logger.info({ user_id: refreshData.user_id }, 'Access token refreshed');

  return token;
}

// ============================================================================
// Token Validation
// ============================================================================

/**
 * Validate an access token and return user info
 */
export function validateAccessToken(token: string): TokenValidation {
  // Handle OAuth tokens (mcp_...)
  if (token.startsWith('mcp_')) {
    const tokenData = accessTokens.get(token);

    if (!tokenData) {
      return { valid: false };
    }

    if (tokenData.expires_at < new Date()) {
      accessTokens.delete(token);
      return { valid: false };
    }

    return {
      valid: true,
      user_id: tokenData.user_id,
      user_email: tokenData.user_email,
      scope: tokenData.scope,
    };
  }

  return { valid: false };
}

// ============================================================================
// User Authentication (for /authorize endpoint)
// ============================================================================

/**
 * Authenticate user with email/password for OAuth flow
 */
export async function authenticateOAuthUser(
  email: string,
  password: string
): Promise<{ user_id: string; email: string } | null> {
  const user = await authenticateUser(email, password);

  if (!user) {
    return null;
  }

  return {
    user_id: user.id,
    email: user.email,
  };
}

// ============================================================================
// OAuth Metadata
// ============================================================================

/**
 * Get OAuth 2.0 server metadata
 */
export function getOAuthMetadata(baseUrl: string): Record<string, unknown> {
  return {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/authorize`,
    token_endpoint: `${baseUrl}/token`,
    registration_endpoint: `${baseUrl}/register`,
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    response_types_supported: ['code'],
    code_challenge_methods_supported: ['S256', 'plain'],
    scopes_supported: ['mcp', 'openid'],
    service_documentation: `${baseUrl}/`,
  };
}
