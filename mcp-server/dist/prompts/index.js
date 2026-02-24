import { registerProjectPrompts } from './project-prompts.js';
import { registerTaskPrompts } from './task-prompts.js';
import { registerDocumentPrompts } from './document-prompts.js';
import { registerCalendarPrompts } from './calendar-prompts.js';
import { registerDatabasePrompts } from './database-prompts.js';
/**
 * Register all MCP prompts
 */
export function registerPrompts(server) {
    registerProjectPrompts(server);
    registerTaskPrompts(server);
    registerDocumentPrompts(server);
    registerCalendarPrompts(server);
    registerDatabasePrompts(server);
}
//# sourceMappingURL=index.js.map