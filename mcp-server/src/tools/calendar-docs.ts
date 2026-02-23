import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DOCS_DIR = join(__dirname, '..', '..', 'docs', 'calendar');

const VALID_TOPICS = [
  'architecture',
  'categories',
  'linked-items',
  'google-calendar-sync',
  'event-numbers',
  'recurrence',
] as const;

type TopicName = (typeof VALID_TOPICS)[number];

const TOPIC_DESCRIPTIONS: Record<TopicName, string> = {
  architecture: 'Database-first design, standard columns, event lifecycle, physical storage',
  categories: 'Default and custom categories, color palette, slugify key generation',
  'linked-items': 'LinkedItem format, valid types (task/document/database), replace semantics',
  'google-calendar-sync': 'Sync architecture, edge functions, color mapping, Meet integration, MCP limits',
  'event-numbers': 'EVT-XXXX format, PostgreSQL sequence, readonly, search by number',
  recurrence: 'RRULE format (RFC 5545), common patterns, FullCalendar rendering, Google sync',
};

export function registerCalendarDocsTools(server: McpServer): void {
  server.tool(
    'list_calendar_docs',
    `List all calendar/event documentation topics available in Kodo. Call this to discover what documentation exists before retrieving details. Related tools: get_calendar_doc (full documentation for one topic).`,
    {},
    async () => {
      const list = VALID_TOPICS.map(
        (name) => `- **${name}**: ${TOPIC_DESCRIPTIONS[name]}`
      ).join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `Available calendar documentation topics (${VALID_TOPICS.length}):\n\n${list}`,
          },
        ],
      };
    }
  );

  server.tool(
    'get_calendar_doc',
    `Get the complete documentation for a specific calendar/event topic in Kodo. Call this tool before creating or modifying events to understand the system architecture, categories, linked items, recurrence rules, or Google Calendar sync. Related tools: list_calendar_docs (discover available topics).`,
    {
      topic: z
        .enum(VALID_TOPICS)
        .describe('The documentation topic to retrieve.'),
    },
    async ({ topic }) => {
      try {
        const filePath = join(DOCS_DIR, `${topic}.md`);
        const content = readFileSync(filePath, 'utf-8');

        return {
          content: [{ type: 'text', text: content }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `Topic "${topic}" not found. Available topics: ${VALID_TOPICS.join(', ')}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
