import { z } from 'zod';
/**
 * Register database-related prompts
 */
export function registerDatabasePrompts(server) {
    // =========================================================================
    // database_setup - Bootstrap a Notion-like database with schema
    // =========================================================================
    server.registerPrompt('database_setup', {
        title: 'Database Setup',
        description: 'Guide through creating a Notion-like database with custom schema, columns, and initial data.',
        argsSchema: {
            database_type: z.enum(['task', 'tracker', 'inventory', 'crm', 'custom']).describe('Type of database to create'),
            name: z.string().describe('Database name'),
            document_id: z.string().uuid().describe('Document ID to embed the database in'),
            columns_description: z.string().optional().describe('Optional natural language description of desired columns'),
        },
    }, async ({ database_type, name, document_id, columns_description }) => {
        const typeSchemas = {
            task: `Task database columns:
- title (text) — Task name
- status (select: backlog, pending, in_progress, review, completed, blocked) — Workflow status
- priority (select: critical, high, medium, low) — Importance level
- assignee (text) — Person responsible
- due_date (date) — Deadline
- labels (multi_select: bug, feature, improvement, documentation) — Categories
- story_points (number) — Effort estimation`,
            tracker: `Tracker/Log database columns:
- title (text) — Entry name
- date (date) — Entry date
- category (select: customize based on needs) — Entry category
- status (select: open, in_progress, resolved, closed) — Current state
- notes (text) — Additional details
- value (number) — Numeric value if applicable`,
            inventory: `Inventory database columns:
- name (text) — Item name
- category (select: customize) — Item category
- quantity (number) — Current stock
- status (select: in_stock, low_stock, out_of_stock, ordered) — Availability
- location (text) — Where the item is stored
- last_updated (date) — Last inventory check`,
            crm: `CRM database columns:
- name (text) — Contact/Company name
- email (text) — Email address
- company (text) — Company name
- status (select: lead, contacted, qualified, proposal, won, lost) — Pipeline stage
- last_contact (date) — Last interaction date
- notes (text) — Interaction notes
- value (number) — Deal value`,
            custom: `Custom database — define columns based on the description provided.`,
        };
        return {
            messages: [
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: `Create a "${name}" ${database_type} database embedded in document ${document_id}.

${columns_description ? `User requirements: ${columns_description}\n` : ''}

Suggested schema:
${typeSchemas[database_type]}

Steps:
1. Use \`create_database\` with:
   - document_id: "${document_id}"
   - name: "${name}"
   - type: "${database_type}"
   - Initial columns based on the schema above${columns_description ? ' adapted to user requirements' : ''}
2. For each additional column beyond what create_database provides, use \`add_column\` with:
   - Appropriate column type (text, number, select, multi_select, date, checkbox, url)
   - For select/multi_select columns: define the options with labels and colors
3. Use \`get_database_schema\` to verify the final schema
4. Optionally, use \`add_database_row\` to add sample rows so the user can see the structure

Return a summary of:
- Database ID
- Complete column list with types
- Any sample data added
- Instructions for populating data (manual or via \`import_csv\`)`,
                    },
                },
            ],
        };
    });
}
//# sourceMappingURL=database-prompts.js.map