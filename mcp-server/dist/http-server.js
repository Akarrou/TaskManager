#!/usr/bin/env node
/**
 * Kodo MCP Server - HTTP Transport
 *
 * This is the entry point for remote HTTP access.
 * Supports both:
 * - StreamableHTTP transport (recommended, /mcp endpoint)
 * - SSE transport (deprecated, /sse endpoint for backwards compatibility)
 */
import { createServer } from 'node:http';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createMcpServer, MCP_VERSION } from './server.js';
import { testConnection } from './services/supabase-client.js';
import { env } from './config.js';
import { logger, createSessionLogger } from './services/logger.js';
import { checkRateLimit, getRateLimitInfo } from './middleware/rate-limiter.js';
import { authenticateUser, authenticateByToken, setSessionUser, clearSessionUser, runWithUser, } from './services/user-auth.js';
import { handleOAuthMetadata, handleAuthorize, handleToken, handleRegister, } from './routes/oauth.js';
import { validateAccessToken } from './services/oauth.js';
// Store active transports for session management
const sseTransports = new Map();
const httpTransports = new Map();
// Store session to user mapping for request context
const sessionUserMap = new Map();
// Capability counts resolved at startup
let capabilityCounts = { tools: 0, resources: 0, prompts: 0 };
function resolveCapabilityCounts() {
    const server = createMcpServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const internal = server;
    capabilityCounts = {
        tools: Object.keys(internal._registeredTools ?? {}).length,
        resources: Object.keys(internal._registeredResources ?? {}).length,
        prompts: Object.keys(internal._registeredPrompts ?? {}).length,
    };
}
/**
 * Parsed set of trusted proxy IPs (from TRUSTED_PROXIES env)
 */
const trustedProxies = new Set((env.TRUSTED_PROXIES || '').split(',').map(s => s.trim()).filter(Boolean));
/**
 * Parsed set of allowed CORS origins (from ALLOWED_ORIGINS env or APP_URL fallback)
 */
const allowedOrigins = new Set((env.ALLOWED_ORIGINS || env.APP_URL).split(',').map(s => s.trim()).filter(Boolean));
/**
 * Get client IP from request.
 * Only trusts X-Forwarded-For when the direct connection comes from a trusted proxy.
 */
function getClientIp(req) {
    const directIp = req.socket.remoteAddress || 'unknown';
    // Only parse X-Forwarded-For if the request comes from a trusted proxy
    if (trustedProxies.size > 0 && trustedProxies.has(directIp)) {
        const forwarded = req.headers['x-forwarded-for'];
        if (typeof forwarded === 'string') {
            const clientIp = forwarded.split(',')[0].trim();
            if (clientIp)
                return clientIp;
        }
    }
    return directIp;
}
/**
 * Parse Basic Auth credentials from request
 * Returns { email, password } or null if invalid
 */
function parseBasicAuth(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Basic '))
        return null;
    const base64 = authHeader.slice(6);
    const decoded = Buffer.from(base64, 'base64').toString('utf-8');
    const colonIndex = decoded.indexOf(':');
    if (colonIndex === -1)
        return null;
    const email = decoded.slice(0, colonIndex);
    const password = decoded.slice(colonIndex + 1);
    return { email, password };
}
/**
 * Parse Bearer token from request
 * Returns token string or null if invalid/not present
 * Supports both API tokens (kodo_...) and OAuth tokens (mcp_...)
 */
function parseBearerToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer '))
        return null;
    const token = authHeader.slice(7).trim();
    if (!token)
        return null;
    // Accept both kodo_ (API tokens) and mcp_ (OAuth tokens)
    if (token.startsWith('kodo_') || token.startsWith('mcp_')) {
        return token;
    }
    return null;
}
/**
 * Authenticate user via Bearer Token OR Basic Auth against Supabase
 * Tries Bearer token first (API tokens or OAuth tokens), falls back to Basic Auth
 * Returns authenticated user or null
 */
async function authenticateRequest(req) {
    if (!env.AUTH_ENABLED) {
        // If auth disabled, use DEFAULT_USER_ID from env
        if (env.DEFAULT_USER_ID) {
            return { id: env.DEFAULT_USER_ID, email: 'default@localhost' };
        }
        return null;
    }
    // Try Bearer token first
    const bearerToken = parseBearerToken(req);
    if (bearerToken) {
        // Handle OAuth tokens (mcp_...)
        if (bearerToken.startsWith('mcp_')) {
            const validation = validateAccessToken(bearerToken);
            if (validation.valid && validation.user_id && validation.user_email) {
                return { id: validation.user_id, email: validation.user_email };
            }
            return null;
        }
        // Handle API tokens (kodo_...)
        return await authenticateByToken(bearerToken);
    }
    // Fall back to Basic Auth (email/password)
    const credentials = parseBasicAuth(req);
    if (!credentials)
        return null;
    return await authenticateUser(credentials.email, credentials.password);
}
/**
 * Send 401 Unauthorized response
 */
function sendUnauthorized(res, ip) {
    logger.warn({ ip }, 'Unauthorized request');
    res.setHeader('WWW-Authenticate', 'Bearer realm="MCP Server", Basic realm="MCP Server"');
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        error: 'Unauthorized',
        message: 'Valid Bearer token (kodo_...) or Basic Auth credentials required',
    }));
}
/**
 * Send 429 Rate Limited response
 */
function sendRateLimited(res, ip) {
    const info = getRateLimitInfo(ip);
    logger.warn({ ip, resetAt: info?.resetAt }, 'Rate limit exceeded');
    res.setHeader('Retry-After', Math.ceil(((info?.resetAt || Date.now()) - Date.now()) / 1000).toString());
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        error: 'Too many requests',
        retryAfter: info?.resetAt ? new Date(info.resetAt).toISOString() : undefined,
    }));
}
/**
 * Set CORS headers with origin validation
 */
function setCorsHeaders(res, req) {
    const origin = req?.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
    }
    // If origin is not in allowedOrigins, no Access-Control-Allow-Origin is set (browser blocks the request)
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, X-Session-Id, Mcp-Session-Id, Authorization');
}
/**
 * Parse URL from request
 */
function parseUrl(req) {
    return new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
}
/**
 * Read request body with size limit to prevent DoS
 */
async function readBody(req) {
    const chunks = [];
    let totalSize = 0;
    const maxSize = env.MAX_BODY_SIZE;
    for await (const chunk of req) {
        totalSize += chunk.length;
        if (totalSize > maxSize) {
            throw new Error('BODY_TOO_LARGE');
        }
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf-8');
}
/**
 * HTTP server request handler
 */
async function handleRequest(req, res) {
    const startTime = Date.now();
    const url = parseUrl(req);
    const method = req.method || 'GET';
    const ip = getClientIp(req);
    setCorsHeaders(res, req);
    // Log request
    logger.debug({ method, path: url.pathname, ip }, 'Incoming request');
    // Handle CORS preflight (no rate limit)
    if (method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }
    // OAuth metadata (no rate limit, no auth)
    if (url.pathname === '/.well-known/oauth-authorization-server' && method === 'GET') {
        await handleOAuthMetadata(req, res);
        return;
    }
    // Health check (minimal info, no auth)
    if (url.pathname === '/health' && method === 'GET') {
        const isConnected = await testConnection();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: isConnected ? 'healthy' : 'degraded',
        }));
        return;
    }
    // Rate limiting for ALL endpoints (including OAuth)
    if (!checkRateLimit(ip)) {
        sendRateLimited(res, ip);
        return;
    }
    // OAuth authorize endpoint (handles its own auth via login form)
    if (url.pathname === '/authorize') {
        await handleAuthorize(req, res);
        return;
    }
    // OAuth token endpoint (no auth required - uses authorization code)
    if (url.pathname === '/token' && method === 'POST') {
        await handleToken(req, res);
        return;
    }
    // OAuth client registration endpoint
    if (url.pathname === '/register' && method === 'POST') {
        await handleRegister(req, res);
        return;
    }
    // Server info (no auth required)
    if (url.pathname === '/' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            name: 'Kodo MCP Server',
            version: MCP_VERSION,
            description: 'MCP Server for Kodo - Task and document management',
            endpoints: {
                mcp: '/mcp (recommended - StreamableHTTP)',
                sse: '/sse (deprecated - SSE)',
                messages: '/messages (for SSE)',
                health: '/health',
                oauth: {
                    metadata: '/.well-known/oauth-authorization-server',
                    authorize: '/authorize',
                    token: '/token',
                    register: '/register',
                },
            },
            capabilities: capabilityCounts,
        }));
        return;
    }
    // StreamableHTTP endpoint (recommended for Claude Code)
    if (url.pathname === '/mcp') {
        // Authenticate user via Basic Auth against Supabase
        const user = await authenticateRequest(req);
        if (!user) {
            sendUnauthorized(res, ip);
            return;
        }
        const sessionId = req.headers['mcp-session-id'];
        // Handle GET request for SSE stream (server-to-client notifications)
        if (method === 'GET') {
            if (!sessionId || !httpTransports.has(sessionId)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid or missing session ID' }));
                return;
            }
            const sessionUser = sessionUserMap.get(sessionId) ?? null;
            const transport = httpTransports.get(sessionId);
            await runWithUser(sessionUser, () => transport.handleRequest(req, res));
            return;
        }
        // Handle DELETE request for session termination
        if (method === 'DELETE') {
            if (!sessionId || !httpTransports.has(sessionId)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid or missing session ID' }));
                return;
            }
            // Clean up session user mapping
            sessionUserMap.delete(sessionId);
            clearSessionUser(sessionId);
            const transport = httpTransports.get(sessionId);
            await transport.handleRequest(req, res);
            return;
        }
        // Handle POST request
        if (method === 'POST') {
            const body = await readBody(req);
            let parsedBody;
            try {
                parsedBody = JSON.parse(body);
            }
            catch {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
                return;
            }
            // Reuse existing session if valid
            if (sessionId && httpTransports.has(sessionId)) {
                const sessionUser = sessionUserMap.get(sessionId) ?? null;
                // Verify the authenticated user matches the session owner
                if (sessionUser && user && sessionUser.id !== user.id) {
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Session belongs to a different user' }));
                    return;
                }
                const transport = httpTransports.get(sessionId);
                await runWithUser(sessionUser, () => transport.handleRequest(req, res, parsedBody));
                return;
            }
            // New session initialization
            if (!sessionId && isInitializeRequest(parsedBody)) {
                const newSessionId = crypto.randomUUID();
                const sessionLogger = createSessionLogger(newSessionId);
                sessionLogger.info({ ip, userId: user.id, email: user.email }, 'New MCP HTTP session');
                // Store user for this session
                sessionUserMap.set(newSessionId, user);
                setSessionUser(newSessionId, user);
                const transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => newSessionId,
                    onsessioninitialized: (id) => {
                        httpTransports.set(id, transport);
                        sessionLogger.info({ userId: user.id }, 'HTTP session initialized');
                    },
                });
                transport.onclose = () => {
                    if (transport.sessionId) {
                        httpTransports.delete(transport.sessionId);
                        sessionUserMap.delete(transport.sessionId);
                        clearSessionUser(transport.sessionId);
                        sessionLogger.info('HTTP session closed');
                    }
                };
                const server = createMcpServer();
                await server.connect(transport);
                await runWithUser(user, () => transport.handleRequest(req, res, parsedBody));
                return;
            }
            // Invalid request
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                jsonrpc: '2.0',
                error: { code: -32000, message: 'Invalid session or missing initialization' },
                id: null,
            }));
            return;
        }
        // Method not allowed
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
    }
    // SSE endpoint for establishing MCP connection (deprecated, for backwards compatibility)
    if (url.pathname === '/sse' && method === 'GET') {
        // Authenticate user via Basic Auth against Supabase
        const user = await authenticateRequest(req);
        if (!user) {
            sendUnauthorized(res, ip);
            return;
        }
        const sessionId = crypto.randomUUID();
        const sessionLogger = createSessionLogger(sessionId);
        sessionLogger.info({ ip, userId: user.id, email: user.email }, 'New MCP SSE session (deprecated)');
        // Store user for this session
        sessionUserMap.set(sessionId, user);
        setSessionUser(sessionId, user);
        const server = createMcpServer();
        const transport = new SSEServerTransport('/messages', res);
        sseTransports.set(sessionId, transport);
        res.setHeader('X-Session-Id', sessionId);
        await runWithUser(user, () => server.connect(transport));
        // Clean up on close
        req.on('close', () => {
            const duration = Date.now() - startTime;
            sessionLogger.info({ duration }, 'MCP SSE session closed');
            sseTransports.delete(sessionId);
            sessionUserMap.delete(sessionId);
            clearSessionUser(sessionId);
        });
        return;
    }
    // Messages endpoint for SSE client requests (deprecated)
    if (url.pathname === '/messages' && method === 'POST') {
        // Authenticate user via Basic Auth against Supabase
        const user = await authenticateRequest(req);
        if (!user) {
            sendUnauthorized(res, ip);
            return;
        }
        const sessionId = req.headers['x-session-id'];
        if (!sessionId || !sseTransports.has(sessionId)) {
            logger.warn({ ip, sessionId }, 'Invalid SSE session ID');
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid or missing session ID' }));
            return;
        }
        const sessionUser = sessionUserMap.get(sessionId) ?? null;
        const transport = sseTransports.get(sessionId);
        const body = await readBody(req);
        logger.debug({ sessionId, bodyLength: body.length }, 'Processing SSE message');
        await runWithUser(sessionUser, () => transport.handlePostMessage(req, res, body));
        return;
    }
    // 404 for unknown routes
    logger.debug({ method, path: url.pathname, ip }, 'Route not found');
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
}
/**
 * Main entry point
 */
async function main() {
    logger.info({ version: MCP_VERSION }, 'Starting Kodo MCP HTTP Server');
    // Resolve capability counts once at startup
    resolveCapabilityCounts();
    // Test Supabase connection
    const isConnected = await testConnection();
    if (isConnected) {
        logger.info('Supabase connection: OK');
    }
    else {
        logger.warn('Supabase connection: FAILED - server will start in degraded mode');
    }
    const server = createServer(handleRequest);
    server.listen(env.HTTP_PORT, () => {
        logger.info({
            port: env.HTTP_PORT,
            authEnabled: env.AUTH_ENABLED,
            rateLimit: `${env.RATE_LIMIT_REQUESTS} requests per ${env.RATE_LIMIT_WINDOW_MS}ms`,
        }, `HTTP server listening on http://localhost:${env.HTTP_PORT}`);
    });
    // Graceful shutdown
    process.on('SIGTERM', () => {
        logger.info('SIGTERM received, shutting down gracefully');
        server.close(() => {
            logger.info('HTTP server closed');
            process.exit(0);
        });
    });
    process.on('SIGINT', () => {
        logger.info('SIGINT received, shutting down gracefully');
        server.close(() => {
            logger.info('HTTP server closed');
            process.exit(0);
        });
    });
}
main().catch((error) => {
    logger.fatal({ error: error.message }, 'Fatal error');
    process.exit(1);
});
//# sourceMappingURL=http-server.js.map