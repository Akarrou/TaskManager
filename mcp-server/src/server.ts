import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerProjectTools } from './tools/projects.js';
import { registerDocumentTools } from './tools/documents.js';
import { registerTaskTools } from './tools/tasks.js';
import { registerDatabaseTools } from './tools/databases.js';
import { registerStorageTools } from './tools/storage.js';
import { registerUserTools } from './tools/users.js';
import { registerCommentTools } from './tools/comments.js';
import { registerTabTools } from './tools/tabs.js';
import { registerSpreadsheetTools } from './tools/spreadsheets.js';
import { registerSnapshotTools } from './tools/snapshots.js';
import { registerEventTools } from './tools/events.js';
import { registerCalendarDocsTools } from './tools/calendar-docs.js';
import { registerEventCategoryTools } from './tools/event-categories.js';
import { registerTrashTools } from './tools/trash.js';
import { registerSearchTools } from './tools/search.js';
import { registerPrompts } from './prompts/index.js';
import { registerResources } from './resources/index.js';
import { logger } from './services/logger.js';

/**
 * MCP Server version
 */
export const MCP_VERSION = '0.3.1';

/**
 * Create and configure the MCP server with all tools, resources, and prompts
 */
export function createMcpServer(): McpServer {
  logger.info({ version: MCP_VERSION }, 'Creating MCP server');

  const server = new McpServer({
    name: 'kodo-mcp',
    version: MCP_VERSION,
  });

  // Register all tool groups
  registerProjectTools(server);
  registerDocumentTools(server);
  registerTaskTools(server);
  registerDatabaseTools(server);
  registerStorageTools(server);
  registerUserTools(server);
  registerCommentTools(server);
  registerTabTools(server);
  registerSpreadsheetTools(server);
  registerSnapshotTools(server);
  registerEventTools(server);
  registerCalendarDocsTools(server);
  registerEventCategoryTools(server);
  registerTrashTools(server);
  registerSearchTools(server);

  // Register resources
  registerResources(server);

  // Register prompts
  registerPrompts(server);

  logger.info('MCP server configured with 95 tools, 5 resources, 14 prompts');

  return server;
}
