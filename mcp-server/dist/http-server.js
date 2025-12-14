#!/usr/bin/env node
/**
 * TaskManager MCP Server - HTTP Transport
 *
 * This is the entry point for remote HTTP access.
 * Uses SSE (Server-Sent Events) transport for MCP communication.
 */
import { createServer } from 'node:http';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createMcpServer } from './server.js';
import { testConnection } from './services/supabase-client.js';
import { env } from './config.js';
// Store active transports for session management
const transports = new Map();
// CORS headers
function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, X-Session-Id');
}
// Parse URL
function parseUrl(req) {
    return new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
}
// Read body
async function readBody(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf-8');
}
// HTTP server handler
async function handleRequest(req, res) {
    setCorsHeaders(res);
    const url = parseUrl(req);
    const method = req.method || 'GET';
    // Handle CORS preflight
    if (method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }
    // Health check
    if (url.pathname === '/health' && method === 'GET') {
        const isConnected = await testConnection();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: isConnected ? 'healthy' : 'degraded',
            supabase: isConnected ? 'connected' : 'disconnected',
            timestamp: new Date().toISOString(),
        }));
        return;
    }
    // Server info
    if (url.pathname === '/' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            name: 'TaskManager MCP Server',
            version: '0.1.0',
            description: 'MCP Server for TaskManager (Kodo)',
            endpoints: {
                sse: '/sse',
                messages: '/messages',
                health: '/health',
            },
        }));
        return;
    }
    // SSE endpoint for establishing MCP connection
    if (url.pathname === '/sse' && method === 'GET') {
        const server = createMcpServer();
        const transport = new SSEServerTransport('/messages', res);
        const sessionId = crypto.randomUUID();
        transports.set(sessionId, transport);
        res.setHeader('X-Session-Id', sessionId);
        await server.connect(transport);
        // Clean up on close
        req.on('close', () => {
            transports.delete(sessionId);
        });
        return;
    }
    // Messages endpoint for client requests
    if (url.pathname === '/messages' && method === 'POST') {
        const sessionId = req.headers['x-session-id'];
        if (!sessionId || !transports.has(sessionId)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid or missing session ID' }));
            return;
        }
        const transport = transports.get(sessionId);
        const body = await readBody(req);
        await transport.handlePostMessage(req, res, body);
        return;
    }
    // 404 for unknown routes
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
}
async function main() {
    // Test Supabase connection
    const isConnected = await testConnection();
    console.log('TaskManager MCP Server starting...');
    console.log(`Supabase connection: ${isConnected ? 'OK' : 'FAILED'}`);
    const server = createServer(handleRequest);
    server.listen(env.HTTP_PORT, () => {
        console.log(`HTTP server listening on http://localhost:${env.HTTP_PORT}`);
        console.log(`SSE endpoint: http://localhost:${env.HTTP_PORT}/sse`);
    });
}
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
//# sourceMappingURL=http-server.js.map