/**
 * OAuth 2.0 Routes
 *
 * Handles OAuth 2.0 Authorization Code flow with PKCE
 * for Claude Desktop MCP integration.
 */
import { IncomingMessage, ServerResponse } from 'node:http';
/**
 * Handle OAuth metadata request
 * GET /.well-known/oauth-authorization-server
 */
export declare function handleOAuthMetadata(req: IncomingMessage, res: ServerResponse): Promise<void>;
/**
 * Handle authorization request
 * GET /authorize - Show login page
 * POST /authorize - Process login and redirect with code
 */
export declare function handleAuthorize(req: IncomingMessage, res: ServerResponse): Promise<void>;
/**
 * Handle token request
 * POST /token - Exchange code for access token or refresh token
 */
export declare function handleToken(req: IncomingMessage, res: ServerResponse): Promise<void>;
/**
 * Handle client registration
 * POST /register - Dynamic client registration
 */
export declare function handleRegister(req: IncomingMessage, res: ServerResponse): Promise<void>;
//# sourceMappingURL=oauth.d.ts.map