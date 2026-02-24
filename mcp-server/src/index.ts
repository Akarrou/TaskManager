#!/usr/bin/env node
/**
 * TaskManager MCP Server - Stdio Transport
 *
 * This is the entry point for Claude Desktop and Claude Code integration.
 * It uses stdio transport for local communication.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';
import { testConnection } from './services/supabase-client.js';
import { env } from './config.js';
import { setCurrentRequestUser } from './services/user-auth.js';

async function main() {
  // Test Supabase connection
  const isConnected = await testConnection();
  if (!isConnected) {
    console.error('Warning: Could not connect to Supabase. Some tools may not work.');
  }

  // Set default user context for stdio mode (no interactive auth)
  if (env.DEFAULT_USER_ID) {
    setCurrentRequestUser({ id: env.DEFAULT_USER_ID, email: 'stdio@localhost' });
    console.error(`Using default user: ${env.DEFAULT_USER_ID}`);
  }

  // Create MCP server
  const server = createMcpServer();

  // Create stdio transport
  const transport = new StdioServerTransport();

  // Connect server to transport
  await server.connect(transport);

  // Log to stderr (stdout is reserved for MCP protocol)
  console.error('TaskManager MCP Server running on stdio');
  console.error(`Supabase connection: ${isConnected ? 'OK' : 'FAILED'}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
