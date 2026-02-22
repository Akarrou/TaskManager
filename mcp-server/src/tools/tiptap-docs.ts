import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DOCS_DIR = join(__dirname, '..', '..', 'docs', 'tiptap-extensions');

const VALID_EXTENSIONS = [
  'accordion',
  'block-id',
  'columns',
  'database-table',
  'enhanced-image',
  'font-size',
  'mindmap',
  'spreadsheet',
  'task-mention',
  'task-section',
] as const;

type ExtensionName = (typeof VALID_EXTENSIONS)[number];

const EXTENSION_DESCRIPTIONS: Record<ExtensionName, string> = {
  accordion: 'Collapsible accordion groups with title, icon, and content',
  'block-id': 'Global extension adding stable blockId to all block-level nodes',
  columns: 'Multi-column layout for side-by-side content',
  'database-table': 'Embedded database block with Supabase storage',
  'enhanced-image': 'Image with alignment and caption support',
  'font-size': 'Font size support via textStyle mark',
  mindmap: 'Interactive mind map with nodes and hierarchy',
  spreadsheet: 'Excel-like spreadsheet with HyperFormula support',
  'task-mention': 'Inline task reference card with status and priority',
  'task-section': 'Block displaying tasks linked to the current document',
};

export function registerTiptapDocsTools(server: McpServer): void {
  server.tool(
    'list_tiptap_extensions',
    `List all custom TipTap extensions available in the Kodo editor. Call this to discover which extensions exist before retrieving their documentation. Related tools: get_tiptap_extension_doc (full documentation for one extension).`,
    {},
    async () => {
      const list = VALID_EXTENSIONS.map(
        (name) => `- **${name}**: ${EXTENSION_DESCRIPTIONS[name]}`
      ).join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `Available TipTap extensions (${VALID_EXTENSIONS.length}):\n\n${list}`,
          },
        ],
      };
    }
  );

  server.tool(
    'get_tiptap_extension_doc',
    `Get the complete documentation for a specific custom TipTap extension used in the Kodo editor. Call this tool before creating or modifying TipTap JSON content that uses custom extensions. Returns JSON schema, attributes with defaults, constraints, and available commands. Related tools: list_tiptap_extensions (discover available extensions).`,
    {
      extension_name: z
        .enum(VALID_EXTENSIONS)
        .describe('The name of the TipTap extension to retrieve documentation for.'),
    },
    async ({ extension_name }) => {
      try {
        const filePath = join(DOCS_DIR, `${extension_name}.md`);
        const content = readFileSync(filePath, 'utf-8');

        return {
          content: [{ type: 'text', text: content }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `Extension "${extension_name}" not found. Available extensions: ${VALID_EXTENSIONS.join(', ')}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
