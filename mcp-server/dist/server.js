import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerProjectTools } from './tools/projects.js';
import { registerDocumentTools } from './tools/documents.js';
import { registerTaskTools } from './tools/tasks.js';
import { registerDatabaseTools } from './tools/databases.js';
import { registerStorageTools } from './tools/storage.js';
import { registerPrompts } from './prompts/index.js';
/**
 * Create and configure the MCP server with all tools and prompts
 */
export function createMcpServer() {
    const server = new McpServer({
        name: 'taskmanager-mcp',
        version: '0.1.0',
    });
    // Register all tool groups
    registerProjectTools(server);
    registerDocumentTools(server);
    registerTaskTools(server);
    registerDatabaseTools(server);
    registerStorageTools(server);
    // Register prompts
    registerPrompts(server);
    return server;
}
//# sourceMappingURL=server.js.map