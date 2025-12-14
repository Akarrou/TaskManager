import { registerProjectPrompts } from './project-prompts.js';
import { registerTaskPrompts } from './task-prompts.js';
import { registerDocumentPrompts } from './document-prompts.js';
/**
 * Register all MCP prompts
 */
export function registerPrompts(server) {
    registerProjectPrompts(server);
    registerTaskPrompts(server);
    registerDocumentPrompts(server);
}
//# sourceMappingURL=index.js.map