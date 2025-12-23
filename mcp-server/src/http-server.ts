#!/usr/bin/env node
/**
 * Kodo MCP Server - HTTP Transport
 *
 * This is the entry point for remote HTTP access.
 * Supports both:
 * - StreamableHTTP transport (recommended, /mcp endpoint)
 * - SSE transport (deprecated, /sse endpoint for backwards compatibility)
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createMcpServer, MCP_VERSION } from './server.js';
import { testConnection } from './services/supabase-client.js';
import { env } from './config.js';
import { logger, createSessionLogger } from './services/logger.js';
import { checkRateLimit, getRateLimitInfo, getRateLimitStats } from './middleware/rate-limiter.js';

// Store active transports for session management
const sseTransports = new Map<string, SSEServerTransport>();
const httpTransports = new Map<string, StreamableHTTPServerTransport>();

/**
 * Get client IP from request
 */
function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

/**
 * Check Basic Auth credentials
 */
function checkBasicAuth(req: IncomingMessage): boolean {
  if (!env.AUTH_ENABLED) return true;

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Basic ')) return false;

  const base64 = authHeader.slice(6);
  const decoded = Buffer.from(base64, 'base64').toString('utf-8');
  const [username, password] = decoded.split(':');

  return username === env.AUTH_USERNAME && password === env.AUTH_PASSWORD;
}

/**
 * Send 401 Unauthorized response
 */
function sendUnauthorized(res: ServerResponse, ip: string): void {
  logger.warn({ ip }, 'Unauthorized request');
  res.setHeader('WWW-Authenticate', 'Basic realm="MCP Server"');
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unauthorized' }));
}

/**
 * Send 429 Rate Limited response
 */
function sendRateLimited(res: ServerResponse, ip: string): void {
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
 * Set CORS headers
 */
function setCorsHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, X-Session-Id, Authorization');
}

/**
 * Parse URL from request
 */
function parseUrl(req: IncomingMessage): URL {
  return new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
}

/**
 * Read request body
 */
async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/**
 * HTTP server request handler
 */
async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const startTime = Date.now();
  const url = parseUrl(req);
  const method = req.method || 'GET';
  const ip = getClientIp(req);

  setCorsHeaders(res);

  // Log request
  logger.debug({ method, path: url.pathname, ip }, 'Incoming request');

  // Handle CORS preflight (no rate limit)
  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check (no rate limit, no auth)
  if (url.pathname === '/health' && method === 'GET') {
    const isConnected = await testConnection();
    const rateLimitStats = getRateLimitStats();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: isConnected ? 'healthy' : 'degraded',
      version: MCP_VERSION,
      supabase: isConnected ? 'connected' : 'disconnected',
      activeSessions: {
        http: httpTransports.size,
        sse: sseTransports.size,
        total: httpTransports.size + sseTransports.size,
      },
      rateLimit: rateLimitStats,
      timestamp: new Date().toISOString(),
    }));
    return;
  }

  // Rate limiting for all other endpoints
  if (!checkRateLimit(ip)) {
    sendRateLimited(res, ip);
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
      },
      capabilities: {
        tools: 71,
        resources: 5,
        prompts: 9,
      },
    }));
    return;
  }

  // StreamableHTTP endpoint (recommended for Claude Code)
  if (url.pathname === '/mcp') {
    // Check authentication
    if (!checkBasicAuth(req)) {
      sendUnauthorized(res, ip);
      return;
    }

    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // Handle GET request for SSE stream (server-to-client notifications)
    if (method === 'GET') {
      if (!sessionId || !httpTransports.has(sessionId)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing session ID' }));
        return;
      }
      const transport = httpTransports.get(sessionId)!;
      await transport.handleRequest(req, res);
      return;
    }

    // Handle DELETE request for session termination
    if (method === 'DELETE') {
      if (!sessionId || !httpTransports.has(sessionId)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing session ID' }));
        return;
      }
      const transport = httpTransports.get(sessionId)!;
      await transport.handleRequest(req, res);
      return;
    }

    // Handle POST request
    if (method === 'POST') {
      const body = await readBody(req);
      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(body);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }

      // Reuse existing session if valid
      if (sessionId && httpTransports.has(sessionId)) {
        const transport = httpTransports.get(sessionId)!;
        await transport.handleRequest(req, res, parsedBody);
        return;
      }

      // New session initialization
      if (!sessionId && isInitializeRequest(parsedBody)) {
        const newSessionId = crypto.randomUUID();
        const sessionLogger = createSessionLogger(newSessionId);

        sessionLogger.info({ ip }, 'New MCP HTTP session');

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => newSessionId,
          onsessioninitialized: (id) => {
            httpTransports.set(id, transport);
            sessionLogger.info('HTTP session initialized');
          },
        });

        transport.onclose = () => {
          if (transport.sessionId) {
            httpTransports.delete(transport.sessionId);
            sessionLogger.info('HTTP session closed');
          }
        };

        const server = createMcpServer();
        await server.connect(transport);
        await transport.handleRequest(req, res, parsedBody);
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
    // Check authentication
    if (!checkBasicAuth(req)) {
      sendUnauthorized(res, ip);
      return;
    }

    const sessionId = crypto.randomUUID();
    const sessionLogger = createSessionLogger(sessionId);

    sessionLogger.info({ ip }, 'New MCP SSE session (deprecated)');

    const server = createMcpServer();
    const transport = new SSEServerTransport('/messages', res);

    sseTransports.set(sessionId, transport);

    res.setHeader('X-Session-Id', sessionId);

    await server.connect(transport);

    // Clean up on close
    req.on('close', () => {
      const duration = Date.now() - startTime;
      sessionLogger.info({ duration }, 'MCP SSE session closed');
      sseTransports.delete(sessionId);
    });

    return;
  }

  // Messages endpoint for SSE client requests (deprecated)
  if (url.pathname === '/messages' && method === 'POST') {
    // Check authentication
    if (!checkBasicAuth(req)) {
      sendUnauthorized(res, ip);
      return;
    }

    const sessionId = req.headers['x-session-id'] as string;

    if (!sessionId || !sseTransports.has(sessionId)) {
      logger.warn({ ip, sessionId }, 'Invalid SSE session ID');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid or missing session ID' }));
      return;
    }

    const transport = sseTransports.get(sessionId)!;
    const body = await readBody(req);

    logger.debug({ sessionId, bodyLength: body.length }, 'Processing SSE message');

    await transport.handlePostMessage(req, res, body);
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

  // Test Supabase connection
  const isConnected = await testConnection();

  if (isConnected) {
    logger.info('Supabase connection: OK');
  } else {
    logger.warn('Supabase connection: FAILED - server will start in degraded mode');
  }

  const server = createServer(handleRequest);

  server.listen(env.HTTP_PORT, () => {
    logger.info(
      {
        port: env.HTTP_PORT,
        authEnabled: env.AUTH_ENABLED,
        rateLimit: `${env.RATE_LIMIT_REQUESTS} requests per ${env.RATE_LIMIT_WINDOW_MS}ms`,
      },
      `HTTP server listening on http://localhost:${env.HTTP_PORT}`
    );
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
