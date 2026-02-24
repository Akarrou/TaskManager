import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getSupabaseClient } from '../services/supabase-client.js';
import { getCurrentUserId } from '../services/user-auth.js';
import { saveSnapshot } from '../services/snapshot.js';

/**
 * Check if user has access to a specific database
 * Databases are accessible if they belong to a document owned by the user
 */
async function userHasDatabaseAccess(supabase: ReturnType<typeof getSupabaseClient>, databaseId: string, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('document_databases')
    .select('document_id, documents(user_id)')
    .eq('database_id', databaseId)
    .single();

  if (!data) return false;

  // If no document linked, allow access (standalone database)
  if (!data.document_id) return true;

  const doc = data.documents as unknown as { user_id: string } | null;
  return doc?.user_id === userId;
}

/**
 * Register all database-related tools (for dynamic Notion-like databases)
 */
export function registerDatabaseTools(server: McpServer): void {
  // =========================================================================
  // list_databases - List all databases
  // =========================================================================
  server.registerTool(
    'list_databases',
    {
      description: `List all Notion-like databases in the workspace. Databases are structured tables with typed columns that can be embedded in documents or exist standalone. They support two types: "task" (with predefined columns for task management, used by task tools) and "generic" (custom columns). Returns simplified view with database_id, name, type, column_count, and document_id. Use get_database_schema for full column details. Related tools: create_database, get_database_rows, add_database_row.`,
      inputSchema: {
        document_id: z.string().uuid().optional().describe('Filter to databases embedded in a specific document.'),
        type: z.enum(['task', 'generic', 'event']).optional().describe('Filter by database type: "task" for task management, "event" for calendar events, "generic" for custom tables.'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ document_id, type }) => {
      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();

        // Get databases linked to documents the user owns
        let query = supabase
          .from('document_databases')
          .select('*, documents!left(user_id)')
          .is('deleted_at', null)
          .order('created_at', { ascending: false });

        if (document_id) {
          query = query.eq('document_id', document_id);
        }

        const { data, error } = await query;

        if (error) {
          return {
            content: [{ type: 'text', text: `Error listing databases: ${error.message}` }],
            isError: true,
          };
        }

        // Filter to only databases accessible to this user
        let filtered = (data || []).filter((db: Record<string, unknown>) => {
          // If no document linked, include it (standalone database)
          if (!db.document_id) return true;
          // Otherwise, check if user owns the document
          const doc = db.documents as { user_id: string } | null;
          return doc?.user_id === userId;
        });

        // Filter by type if specified
        if (type) {
          filtered = filtered.filter((db: Record<string, unknown>) => {
            const config = db.config as { type?: string } | undefined;
            return config?.type === type;
          });
        }

        // Return simplified view
        const simplified = filtered.map((db: Record<string, unknown>) => ({
          database_id: db.database_id,
          name: db.name,
          document_id: db.document_id,
          type: (db.config as { type?: string })?.type || 'generic',
          column_count: ((db.config as { columns?: unknown[] })?.columns || []).length,
          created_at: db.created_at,
          updated_at: db.updated_at,
        }));

        return {
          content: [{ type: 'text', text: JSON.stringify(simplified, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // get_database_schema - Get database column configuration
  // =========================================================================
  server.registerTool(
    'get_database_schema',
    {
      description: `Get the complete schema of a database including all column definitions. Returns: database_id, name, type, columns array, views, defaultView, and pinnedColumns.

Each column has: id (UUID), name, type, visible, order, and optionally: width, color, readonly, required, options. Column types: text, number, select, multi-select, date, checkbox, url, email, phone, person, formula, relation, rollup, created_time, last_edited_time, created_by, last_edited_by. Note: multi-select uses a hyphen (not underscore).

For select/multi-select columns, options follow the format: { choices: [{ id, label, color }] }. The choice "id" is the value to use when setting cell data (e.g., "in_progress", "high").

Column IDs are standard UUIDs (e.g., "a1b2c3d4-e5f6-..."). Essential for understanding how to query and update database rows. Related tools: add_column, update_column, add_database_row.`,
      inputSchema: {
        database_id: z.string().describe('The database ID. Format: db-uuid (e.g., "db-123e4567-e89b-...").'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ database_id }) => {
      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();

        // Verify user has access to this database
        const hasAccess = await userHasDatabaseAccess(supabase, database_id, userId);
        if (!hasAccess) {
          return {
            content: [{ type: 'text', text: `Access denied: You do not have permission to access this database.` }],
            isError: true,
          };
        }

        const { data, error } = await supabase
          .from('document_databases')
          .select('*')
          .eq('database_id', database_id)
          .is('deleted_at', null)
          .single();

        if (error) {
          return {
            content: [{ type: 'text', text: `Error getting database schema: ${error.message}` }],
            isError: true,
          };
        }

        const config = data.config as {
          name?: string;
          type?: string;
          columns?: Array<{
            id: string;
            name: string;
            type: string;
            options?: unknown;
            visible?: boolean;
            required?: boolean;
            readonly?: boolean;
            order?: number;
            width?: number;
            color?: string;
          }>;
          views?: unknown[];
          defaultView?: string;
          pinnedColumns?: string[];
        };

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              database_id: data.database_id,
              name: data.name,
              type: config.type || 'generic',
              columns: config.columns || [],
              views: config.views || [],
              defaultView: config.defaultView || 'table',
              pinnedColumns: config.pinnedColumns || [],
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // get_database_rows - Query rows from a database
  // =========================================================================
  server.registerTool(
    'get_database_rows',
    {
      description: `Query rows from a database with pagination. Returns denormalized rows with column names as keys (not column IDs), plus metadata fields prefixed with underscore: _id (row UUID), _row_order, _created_at, _updated_at. Also returns total_count for pagination. For task databases, use list_tasks instead which provides normalized task fields. Use get_database_schema first to understand available columns. Related tools: add_database_row, update_database_row, delete_database_rows.`,
      inputSchema: {
        database_id: z.string().describe('The database ID. Format: db-uuid.'),
        limit: z.number().min(1).max(100).optional().default(50).describe('Maximum rows per page. Default 50, max 100.'),
        offset: z.number().min(0).optional().default(0).describe('Number of rows to skip for pagination.'),
        sort_by: z.string().optional().describe('Column name to sort by. Currently sorts by row_order.'),
        sort_order: z.enum(['asc', 'desc']).optional().default('asc').describe('Sort direction: asc (ascending) or desc (descending).'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ database_id, limit, offset, sort_by, sort_order }) => {
      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();

        // Verify user has access to this database
        const hasAccess = await userHasDatabaseAccess(supabase, database_id, userId);
        if (!hasAccess) {
          return {
            content: [{ type: 'text', text: `Access denied: You do not have permission to access this database.` }],
            isError: true,
          };
        }

        // Get database metadata first
        const { data: dbMeta, error: metaError } = await supabase
          .from('document_databases')
          .select('*')
          .eq('database_id', database_id)
          .single();

        if (metaError || !dbMeta) {
          return {
            content: [{ type: 'text', text: `Database not found: ${database_id}` }],
            isError: true,
          };
        }

        const tableName = `database_${database_id.replace('db-', '').replace(/-/g, '_')}`;

        let query = supabase
          .from(tableName)
          .select('*', { count: 'exact' })
          .is('deleted_at', null);

        // Apply sorting
        if (sort_by) {
          // For cell-based sorting, we sort by row_order or created_at
          // Full cell sorting would require client-side sort
          query = query.order('row_order', { ascending: sort_order === 'asc' });
        } else {
          query = query.order('row_order', { ascending: true });
        }

        query = query.range(offset, offset + limit - 1);

        const { data, error, count } = await query;

        if (error) {
          return {
            content: [{ type: 'text', text: `Error querying rows: ${error.message}` }],
            isError: true,
          };
        }

        // Denormalize rows using column metadata (reads individual columns col_xxx)
        const config = dbMeta.config as { columns?: Array<{ id: string; name: string; type: string }> };
        const columns = config.columns || [];

        const denormalizedRows = (data || []).map((row: Record<string, unknown>) => {
          const denormalized: Record<string, unknown> = {
            _id: row.id,
            _row_order: row.row_order,
            _created_at: row.created_at,
            _updated_at: row.updated_at,
          };

          // Read individual columns (matches Angular pattern)
          for (const col of columns) {
            const colName = `col_${col.id.replace(/-/g, '_')}`;
            denormalized[col.name] = row[colName] ?? null;
          }

          return denormalized;
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              total_count: count,
              rows: denormalizedRows,
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // add_database_row - Add a new row to a database
  // =========================================================================
  server.registerTool(
    'add_database_row',
    {
      description: `Add a new row to a database. Use column names (not IDs) as keys in the cells object - they are automatically mapped to column IDs. For task databases, use create_task instead which provides a typed interface. The new row is added at the end (highest row_order). Returns the created row with its generated UUID.

IMPORTANT for select/multi-select columns: use the choice ID as value, not the label. Example: use "in_progress" not "En cours", "high" not "Haute". Get available choice IDs from get_database_schema (options.choices[].id).

Example cells: { "Title": "My Item", "Status": "pending", "Priority": "high", "Count": 42 }. Related tools: get_database_schema (column names and choice IDs), update_database_row.`,
      inputSchema: {
        database_id: z.string().describe('The database ID to add a row to. Format: db-uuid.'),
        cells: z.record(z.unknown()).describe('Cell values as { "ColumnName": value } object. Use get_database_schema to see available columns.'),
      },
    },
    async ({ database_id, cells }) => {
      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();

        // Verify user has access to this database
        const hasAccess = await userHasDatabaseAccess(supabase, database_id, userId);
        if (!hasAccess) {
          return {
            content: [{ type: 'text', text: `Access denied: You do not have permission to modify this database.` }],
            isError: true,
          };
        }

        // Get database metadata
        const { data: dbMeta, error: metaError } = await supabase
          .from('document_databases')
          .select('*')
          .eq('database_id', database_id)
          .single();

        if (metaError || !dbMeta) {
          return {
            content: [{ type: 'text', text: `Database not found: ${database_id}` }],
            isError: true,
          };
        }

        const config = dbMeta.config as { columns?: Array<{ id: string; name: string }> };
        const columns = config.columns || [];

        // Convert column names to column IDs
        const normalizedCells: Record<string, unknown> = {};
        for (const [name, value] of Object.entries(cells)) {
          const column = columns.find(c => c.name === name);
          if (column) {
            normalizedCells[column.id] = value;
          }
        }

        const tableName = `database_${database_id.replace('db-', '').replace(/-/g, '_')}`;

        // Get max row_order
        const { data: maxOrderRow } = await supabase
          .from(tableName)
          .select('row_order')
          .order('row_order', { ascending: false })
          .limit(1)
          .single();

        const newRowOrder = (maxOrderRow?.row_order || 0) + 1;

        // Map cells to individual columns (matches Angular pattern)
        const rowData: Record<string, unknown> = { row_order: newRowOrder };
        for (const [columnId, value] of Object.entries(normalizedCells)) {
          const colName = `col_${columnId.replace(/-/g, '_')}`;
          rowData[colName] = value;
        }

        const { data, error } = await supabase
          .from(tableName)
          .insert(rowData)
          .select()
          .single();

        if (error) {
          return {
            content: [{ type: 'text', text: `Error adding row: ${error.message}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Row added successfully:\n${JSON.stringify(data, null, 2)}` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // update_database_row - Update a row in a database
  // =========================================================================
  server.registerTool(
    'update_database_row',
    {
      description: `Update specific cells in an existing database row. Only provide the columns you want to change - existing values are preserved for unspecified columns. Uses column names (not IDs) in the cells object. For task databases, use update_task instead. Returns the updated row.

IMPORTANT for select/multi-select columns: use the choice ID as value (e.g., "completed", "critical"), not the display label. Get available choice IDs from get_database_schema.

Example: { "Status": "completed", "Priority": "high", "Progress": 100 }. Related tools: get_database_rows (find row IDs), add_database_row, delete_database_rows.`,
      inputSchema: {
        database_id: z.string().describe('The database ID containing the row. Format: db-uuid.'),
        row_id: z.string().uuid().describe('The row UUID to update. Get this from get_database_rows (_id field).'),
        cells: z.record(z.unknown()).describe('Cells to update as { "ColumnName": newValue }. Unspecified columns keep current values.'),
      },
      annotations: { idempotentHint: true },
    },
    async ({ database_id, row_id, cells }) => {
      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();

        // Verify user has access to this database
        const hasAccess = await userHasDatabaseAccess(supabase, database_id, userId);
        if (!hasAccess) {
          return {
            content: [{ type: 'text', text: `Access denied: You do not have permission to modify this database.` }],
            isError: true,
          };
        }

        // Get database metadata
        const { data: dbMeta, error: metaError } = await supabase
          .from('document_databases')
          .select('*')
          .eq('database_id', database_id)
          .single();

        if (metaError || !dbMeta) {
          return {
            content: [{ type: 'text', text: `Database not found: ${database_id}` }],
            isError: true,
          };
        }

        const config = dbMeta.config as { columns?: Array<{ id: string; name: string }> };
        const columns = config.columns || [];

        const tableName = `database_${database_id.replace('db-', '').replace(/-/g, '_')}`;

        // Snapshot before update
        const { data: currentRow } = await supabase.from(tableName).select('*').eq('id', row_id).single();
        let snapshotToken = '';
        if (currentRow) {
          const snapshot = await saveSnapshot({
            entityType: 'database_row',
            entityId: row_id,
            tableName,
            toolName: 'update_database_row',
            operation: 'update',
            data: currentRow,
            userId,
          });
          snapshotToken = snapshot.token;
        }

        // Build update object with individual columns (matches Angular pattern)
        const updateData: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };

        for (const [name, value] of Object.entries(cells)) {
          const column = columns.find(c => c.name === name);
          if (column) {
            const colName = `col_${column.id.replace(/-/g, '_')}`;
            updateData[colName] = value;
          }
        }

        const { data, error } = await supabase
          .from(tableName)
          .update(updateData)
          .eq('id', row_id)
          .select()
          .single();

        if (error) {
          return {
            content: [{ type: 'text', text: `Error updating row: ${error.message}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Row updated (snapshot: ${snapshotToken}):\n${JSON.stringify(data, null, 2)}` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // delete_database_rows - Soft delete rows from a database (move to trash)
  // =========================================================================
  server.registerTool(
    'delete_database_rows',
    {
      description: `Soft delete one or more rows from a database (move to trash). Sets deleted_at and registers in trash_items. Rows can be restored from trash within 30 days. Accepts an array of row UUIDs. For task databases, use delete_task instead. Returns count of soft-deleted rows. Related tools: get_database_rows (find rows), update_database_row, restore_from_trash (undo).`,
      inputSchema: {
        database_id: z.string().describe('The database ID. Format: db-uuid.'),
        row_ids: z.array(z.string().uuid()).min(1).describe('Array of row UUIDs to delete. Get these from get_database_rows (_id field).'),
      },
      annotations: { destructiveHint: true },
    },
    async ({ database_id, row_ids }) => {
      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();

        // Verify user has access to this database
        const hasAccess = await userHasDatabaseAccess(supabase, database_id, userId);
        if (!hasAccess) {
          return {
            content: [{ type: 'text', text: `Access denied: You do not have permission to modify this database.` }],
            isError: true,
          };
        }

        const tableName = `database_${database_id.replace('db-', '').replace(/-/g, '_')}`;

        // Get database name for trash context
        const { data: dbMeta } = await supabase
          .from('document_databases')
          .select('name')
          .eq('database_id', database_id)
          .single();
        const databaseName = (dbMeta?.name as string) || database_id;

        // Snapshot before soft delete
        const { data: currentRows } = await supabase.from(tableName).select('*').in('id', row_ids);
        const snapshotTokens: string[] = [];
        if (currentRows) {
          for (const row of currentRows) {
            const snapshot = await saveSnapshot({
              entityType: 'database_row',
              entityId: row.id as string,
              tableName,
              toolName: 'delete_database_rows',
              operation: 'soft_delete',
              data: row,
              userId,
            });
            snapshotTokens.push(snapshot.token);
          }
        }

        const now = new Date().toISOString();

        // Soft delete: set deleted_at
        const { error } = await supabase
          .from(tableName)
          .update({ deleted_at: now })
          .in('id', row_ids);

        if (error) {
          return {
            content: [{ type: 'text', text: `Error soft-deleting rows: ${error.message}` }],
            isError: true,
          };
        }

        // Insert into trash_items
        const trashInserts = row_ids.map(rowId => {
          const row = currentRows?.find(r => (r.id as string) === rowId);
          const displayName = (row && typeof row === 'object' ? String(Object.values(row).find(v => typeof v === 'string' && v.length > 0 && v !== rowId) || '') : '') || `Row ${rowId.slice(0, 8)}`;
          return {
            item_type: 'database_row',
            item_id: rowId,
            item_table: tableName,
            display_name: displayName,
            parent_info: { databaseName, databaseId: database_id },
            user_id: userId,
            deleted_at: now,
          };
        });

        await supabase.from('trash_items').insert(trashInserts);

        return {
          content: [{ type: 'text', text: `Moved ${row_ids.length} row(s) to trash (snapshots: ${snapshotTokens.join(', ')}). Use restore_from_trash to recover.` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // create_database - Create a new database
  // =========================================================================
  server.registerTool(
    'create_database',
    {
      description: `Create a new Notion-like database with custom columns. Databases are structured tables that can be embedded in documents or exist standalone.

Type "task" creates a complete task management database with 15 predefined columns: Title, Description, Status (select: backlog/pending/in_progress/completed/cancelled/blocked/awaiting_info), Priority (select: low/medium/high/critical), Type (select: epic/feature/task), Assigned To, Due Date, Tags (multi-select), Estimated Hours, Actual Hours, Parent Task ID, Epic ID, Feature ID, Project ID, Task Number. It also creates 3 views (table, kanban grouped by Status, calendar), sets defaultView to "table", and pins the Status column. Use with list_tasks/create_task tools.

Type "generic" creates a database with your custom columns and a single table view.

For generic databases with select/multi_select columns, provide options as [{label, color?}] — they are automatically converted to the frontend format {choices: [{id, label, color}]}.

Column IDs are standard UUIDs (e.g., "a1b2c3d4-e5f6-..."), NOT prefixed with "col_". The "col_" prefix is only added at the PostgreSQL column level by the ensure_table_exists RPC.

When document_id is provided, the databaseTable TipTap node is automatically appended to the document content — no need to call update_document separately.
When document_id is NOT provided, ask the user whether to create a new document or embed in an existing one.

Returns the created database with its generated database_id. Related tools: add_column (add more columns later), add_database_row (add data), list_tasks/create_task (for task databases).`,
      inputSchema: {
        name: z.string().min(1).max(255).describe('Display name for the database.'),
        document_id: z.string().uuid().optional().describe('Parent document to embed the database in. Omit for standalone database.'),
        type: z.enum(['task', 'generic', 'event']).optional().default('generic').describe('"task" creates predefined task columns. "event" creates predefined calendar event columns. "generic" (default) starts empty.'),
        columns: z.array(z.object({
          name: z.string().describe('Column display name.'),
          type: z.enum(['text', 'number', 'select', 'multi_select', 'date', 'checkbox', 'url', 'email', 'phone', 'formula', 'relation', 'rollup', 'created_time', 'last_edited_time', 'created_by', 'last_edited_by', 'person']).describe('Column data type.'),
          options: z.array(z.object({
            label: z.string(),
            color: z.string().optional(),
          })).optional().describe('Required for select/multi_select types. Array of { label, color? }.'),
        })).optional().describe('Initial column definitions. For type "task" with no columns, default task columns are created.'),
      },
    },
    async ({ name, document_id, type, columns }) => {
      try {
        const supabase = getSupabaseClient();

        // Generate unique database ID
        const uuid = crypto.randomUUID();
        const databaseId = `db-${uuid}`;
        const tableName = `database_${uuid.replace(/-/g, '_')}`;

        // Build columns config with generated IDs (UUIDs standard, sans prefixe col_)
        const columnsConfig: Record<string, unknown>[] = (columns || []).map((col, index) => ({
          id: crypto.randomUUID(),
          name: col.name,
          type: col.type === 'multi_select' ? 'multi-select' : col.type,
          visible: true,
          order: index,
          ...(col.options && (col.type === 'select' || col.type === 'multi_select')
            ? {
                options: {
                  choices: col.options.map(opt => ({
                    id: opt.label.toLowerCase().replace(/\s+/g, '_'),
                    label: opt.label,
                    color: opt.color || 'bg-gray-200',
                  })),
                },
              }
            : {}),
        }));

        // Variable pour stocker le statusColumnId (utilisee pour views/pinnedColumns)
        let statusColumnId: string | undefined;

        // If task type, add default task columns (15 colonnes, identique au template Angular)
        if (type === 'task' && (!columns || columns.length === 0)) {
          const titleId = crypto.randomUUID();
          const descriptionId = crypto.randomUUID();
          statusColumnId = crypto.randomUUID();
          const priorityId = crypto.randomUUID();
          const typeId = crypto.randomUUID();
          const assignedToId = crypto.randomUUID();
          const dueDateId = crypto.randomUUID();
          const tagsId = crypto.randomUUID();
          const estimatedHoursId = crypto.randomUUID();
          const actualHoursId = crypto.randomUUID();
          const parentTaskId = crypto.randomUUID();
          const epicId = crypto.randomUUID();
          const featureId = crypto.randomUUID();
          const projectId = crypto.randomUUID();
          const taskNumberId = crypto.randomUUID();

          columnsConfig.push(
            { id: titleId, name: 'Title', type: 'text', visible: true, required: true, readonly: true, order: 0, width: 200, color: 'blue' },
            { id: descriptionId, name: 'Description', type: 'text', visible: true, readonly: true, order: 1, width: 300, color: 'green' },
            { id: statusColumnId, name: 'Status', type: 'select', visible: true, readonly: true, order: 2, width: 180, color: 'yellow', options: {
              choices: [
                { id: 'backlog', label: 'Backlog', color: 'bg-gray-200' },
                { id: 'pending', label: 'À faire', color: 'bg-yellow-200' },
                { id: 'in_progress', label: 'En cours', color: 'bg-blue-200' },
                { id: 'completed', label: 'Terminée', color: 'bg-green-200' },
                { id: 'cancelled', label: 'Annulée', color: 'bg-gray-300' },
                { id: 'blocked', label: 'Bloquée', color: 'bg-red-200' },
                { id: 'awaiting_info', label: "En attente d'infos", color: 'bg-purple-200' },
              ],
            }},
            { id: priorityId, name: 'Priority', type: 'select', visible: true, readonly: true, order: 3, width: 180, color: 'red', options: {
              choices: [
                { id: 'low', label: 'Faible', color: 'bg-gray-100' },
                { id: 'medium', label: 'Moyenne', color: 'bg-yellow-200' },
                { id: 'high', label: 'Haute', color: 'bg-orange-200' },
                { id: 'critical', label: 'Critique', color: 'bg-red-300' },
              ],
            }},
            { id: typeId, name: 'Type', type: 'select', visible: true, readonly: true, order: 4, width: 180, color: 'purple', options: {
              choices: [
                { id: 'epic', label: 'Epic', color: 'bg-purple-200' },
                { id: 'feature', label: 'Feature', color: 'bg-blue-200' },
                { id: 'task', label: 'Task', color: 'bg-green-200' },
              ],
            }},
            { id: assignedToId, name: 'Assigned To', type: 'text', visible: true, readonly: true, order: 5, width: 200, color: 'pink' },
            { id: dueDateId, name: 'Due Date', type: 'date', visible: true, readonly: true, order: 6, width: 150, color: 'orange', options: { dateFormat: 'DD/MM/YYYY' } },
            { id: tagsId, name: 'Tags', type: 'multi-select', visible: true, readonly: true, order: 7, width: 220, color: 'gray', options: {
              choices: [
                { id: 'frontend', label: 'Frontend', color: 'bg-cyan-200' },
                { id: 'backend', label: 'Backend', color: 'bg-indigo-200' },
                { id: 'ops', label: 'OPS', color: 'bg-orange-200' },
                { id: 'bug', label: 'Bug', color: 'bg-red-200' },
                { id: 'enhancement', label: 'Enhancement', color: 'bg-green-200' },
              ],
            }},
            { id: estimatedHoursId, name: 'Estimated Hours', type: 'number', visible: true, readonly: true, order: 8, width: 120, color: 'blue', options: { format: 'decimal' } },
            { id: actualHoursId, name: 'Actual Hours', type: 'number', visible: true, readonly: true, order: 9, width: 120, color: 'green', options: { format: 'decimal' } },
            { id: parentTaskId, name: 'Parent Task ID', type: 'text', visible: false, order: 10, width: 200, color: 'yellow' },
            { id: epicId, name: 'Epic ID', type: 'text', visible: false, order: 11, width: 200, color: 'red' },
            { id: featureId, name: 'Feature ID', type: 'text', visible: false, order: 12, width: 200, color: 'purple' },
            { id: projectId, name: 'Project ID', type: 'text', visible: false, order: 13, width: 200, color: 'pink' },
            { id: taskNumberId, name: 'Task Number', type: 'text', visible: true, readonly: true, required: false, order: 14, width: 120, color: 'gray' },
          );
        }

        // Variable pour stocker le startDateColumnId (utilisée pour event views)
        let startDateColumnId: string | undefined;

        // If event type, add default event columns (11 colonnes)
        if (type === 'event' && (!columns || columns.length === 0)) {
          const titleId = crypto.randomUUID();
          const descriptionId = crypto.randomUUID();
          const startDateId = crypto.randomUUID();
          startDateColumnId = startDateId;
          const endDateId = crypto.randomUUID();
          const allDayId = crypto.randomUUID();
          const categoryId = crypto.randomUUID();
          const locationId = crypto.randomUUID();
          const recurrenceId = crypto.randomUUID();
          const linkedItemsId = crypto.randomUUID();
          const projectId = crypto.randomUUID();
          const eventNumberId = crypto.randomUUID();

          columnsConfig.push(
            { id: titleId, name: 'Title', type: 'text', visible: true, required: true, readonly: true, isNameColumn: true, order: 0, width: 200, color: 'blue' },
            { id: descriptionId, name: 'Description', type: 'text', visible: true, readonly: true, order: 1, width: 300, color: 'green' },
            { id: startDateId, name: 'Start Date', type: 'datetime', visible: true, readonly: true, order: 2, width: 200, color: 'orange', options: { dateFormat: 'DD/MM/YYYY HH:mm' } },
            { id: endDateId, name: 'End Date', type: 'datetime', visible: true, readonly: true, order: 3, width: 200, color: 'orange', options: { dateFormat: 'DD/MM/YYYY HH:mm' } },
            { id: allDayId, name: 'All Day', type: 'checkbox', visible: true, readonly: true, order: 4, width: 80, color: 'yellow' },
            { id: categoryId, name: 'Category', type: 'select', visible: true, readonly: true, order: 5, width: 180, color: 'purple', options: {
              choices: [
                { id: 'meeting', label: 'Réunion', color: 'bg-blue-200' },
                { id: 'deadline', label: 'Échéance', color: 'bg-red-200' },
                { id: 'milestone', label: 'Jalon', color: 'bg-purple-200' },
                { id: 'reminder', label: 'Rappel', color: 'bg-yellow-200' },
                { id: 'personal', label: 'Personnel', color: 'bg-green-200' },
                { id: 'other', label: 'Autre', color: 'bg-gray-200' },
              ],
            }},
            { id: locationId, name: 'Location', type: 'text', visible: true, order: 6, width: 200, color: 'pink' },
            { id: recurrenceId, name: 'Recurrence', type: 'text', visible: false, order: 7, width: 200, color: 'gray' },
            { id: linkedItemsId, name: 'Linked Items', type: 'linked-items', visible: true, order: 8, width: 300, color: 'blue' },
            { id: projectId, name: 'Project ID', type: 'text', visible: false, order: 9, width: 200, color: 'pink' },
            { id: eventNumberId, name: 'Event Number', type: 'text', visible: true, readonly: true, required: false, order: 10, width: 120, color: 'gray' },
          );
        }

        // Build config with views
        const config: Record<string, unknown> = {
          name,
          type,
          columns: columnsConfig,
          defaultView: type === 'event' ? 'calendar' : 'table',
        };

        if (type === 'task' && statusColumnId) {
          config.views = [
            { id: 'view-table', name: 'Vue tableau', type: 'table', config: {} },
            { id: 'view-kanban', name: 'Vue Kanban', type: 'kanban', config: { groupBy: statusColumnId } },
            { id: 'view-calendar', name: 'Vue calendrier', type: 'calendar', config: {} },
          ];
          config.pinnedColumns = [statusColumnId];
        } else if (type === 'event') {
          config.views = [
            { id: 'view-calendar', name: 'Vue calendrier', type: 'calendar', config: { calendarDateColumnId: startDateColumnId } },
            { id: 'view-table', name: 'Vue tableau', type: 'table', config: {} },
          ];
        } else {
          config.views = [
            { id: 'view-table', name: 'Vue tableau', type: 'table', config: {} },
          ];
        }

        // Create database metadata
        const { data: dbData, error: dbError } = await supabase
          .from('document_databases')
          .insert({
            database_id: databaseId,
            document_id: document_id || null,
            table_name: tableName,
            name,
            config,
          })
          .select()
          .single();

        if (dbError) {
          return {
            content: [{ type: 'text', text: `Error creating database: ${dbError.message}` }],
            isError: true,
          };
        }

        // Create the actual PostgreSQL table via RPC
        const { error: tableError } = await supabase.rpc('ensure_table_exists', {
          p_database_id: databaseId,
        });

        if (tableError) {
          // Rollback metadata
          await supabase.from('document_databases').delete().eq('database_id', databaseId);
          return {
            content: [{ type: 'text', text: `Error creating table: ${tableError.message}` }],
            isError: true,
          };
        }

        // Build the TipTap databaseTable node
        const tiptapNode = {
          type: 'databaseTable',
          attrs: {
            databaseId,
            config,
            storageMode: 'supabase',
            isLinked: false,
          },
        };

        // Auto-embed in document if document_id is provided
        if (document_id) {
          try {
            // Fetch current document content
            const { data: docData, error: docError } = await supabase
              .from('documents')
              .select('content')
              .eq('id', document_id)
              .single();

            if (docError || !docData) {
              return {
                content: [{ type: 'text', text: `Database created successfully but failed to fetch document content: ${docError?.message || 'Document not found'}.\n\nDatabase:\n${JSON.stringify(dbData, null, 2)}\n\nYou can manually embed it using update_document with this TipTap node:\n${JSON.stringify(tiptapNode, null, 2)}` }],
              };
            }

            // Append databaseTable node to existing document content
            const currentContent = (docData.content as { type: string; content?: unknown[] }) || { type: 'doc', content: [] };
            const updatedContent = {
              ...currentContent,
              content: [...(currentContent.content || []), tiptapNode],
            };

            // Update document with the new content
            const { error: updateError } = await supabase
              .from('documents')
              .update({
                content: updatedContent,
                updated_at: new Date().toISOString(),
              })
              .eq('id', document_id);

            if (updateError) {
              return {
                content: [{ type: 'text', text: `Database created successfully but failed to embed in document: ${updateError.message}.\n\nDatabase:\n${JSON.stringify(dbData, null, 2)}\n\nYou can manually embed it using update_document with this TipTap node:\n${JSON.stringify(tiptapNode, null, 2)}` }],
              };
            }

            return {
              content: [{ type: 'text', text: `Database created and automatically embedded in document ${document_id}.\n\nDatabase:\n${JSON.stringify(dbData, null, 2)}\n\nThe databaseTable TipTap node has been appended to the document content. No need to call update_document.` }],
            };
          } catch (embedErr) {
            return {
              content: [{ type: 'text', text: `Database created successfully but auto-embed failed: ${embedErr instanceof Error ? embedErr.message : 'Unknown error'}.\n\nDatabase:\n${JSON.stringify(dbData, null, 2)}\n\nYou can manually embed it using update_document with this TipTap node:\n${JSON.stringify(tiptapNode, null, 2)}` }],
            };
          }
        }

        // No document_id provided — return snippet for manual embedding
        return {
          content: [{ type: 'text', text: `Database created successfully:\n${JSON.stringify(dbData, null, 2)}\n\nIMPORTANT: No document_id was provided. Ask the user whether to create a new document or which existing document to embed this database in. Then use update_document with the tiptap_node below to embed it.\n\ntiptap_node:\n${JSON.stringify(tiptapNode, null, 2)}` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // delete_database - Soft-delete a database (move to trash)
  // =========================================================================
  server.registerTool(
    'delete_database',
    {
      description: `Move a database to the trash (soft delete). The database and its data are preserved for 30 days before permanent deletion. The confirm parameter must be explicitly set to true as a safety measure. Use list_databases to see database_id.`,
      inputSchema: {
        database_id: z.string().describe('The database ID to delete. Format: db-uuid.'),
        confirm: z.boolean().describe('REQUIRED: Must be true to proceed. Safety measure against accidental deletion.'),
      },
      annotations: { destructiveHint: true },
    },
    async ({ database_id, confirm }) => {
      if (!confirm) {
        return {
          content: [{ type: 'text', text: 'Deletion not confirmed. Set confirm=true to proceed.' }],
          isError: true,
        };
      }

      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();

        // Verify user has access to this database
        const hasAccess = await userHasDatabaseAccess(supabase, database_id, userId);
        if (!hasAccess) {
          return {
            content: [{ type: 'text', text: `Access denied: You do not have permission to delete this database.` }],
            isError: true,
          };
        }

        // Snapshot before soft delete
        const { data: currentDb } = await supabase.from('document_databases').select('*').eq('database_id', database_id).single();
        if (!currentDb) {
          return {
            content: [{ type: 'text', text: `Database not found: ${database_id}` }],
            isError: true,
          };
        }

        let snapshotToken = '';
        const snapshot = await saveSnapshot({
          entityType: 'database_config',
          entityId: database_id,
          tableName: 'document_databases',
          toolName: 'delete_database',
          operation: 'soft_delete',
          data: currentDb,
          userId,
        });
        snapshotToken = snapshot.token;

        // Soft delete: set deleted_at on document_databases
        const now = new Date().toISOString();
        const { error: updateError } = await supabase
          .from('document_databases')
          .update({ deleted_at: now })
          .eq('database_id', database_id);

        if (updateError) {
          return {
            content: [{ type: 'text', text: `Error soft-deleting database: ${updateError.message}` }],
            isError: true,
          };
        }

        // Insert into trash_items
        await supabase.from('trash_items').insert({
          item_type: 'database',
          item_id: currentDb.id,
          item_table: 'document_databases',
          display_name: currentDb.name || database_id,
          parent_info: { databaseId: database_id, documentId: currentDb.document_id },
          user_id: userId,
          deleted_at: now,
        });

        return {
          content: [{ type: 'text', text: `Database "${currentDb.name}" moved to trash (snapshot: ${snapshotToken}). It will be permanently deleted after 30 days.` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // add_column - Add a column to a database
  // =========================================================================
  server.registerTool(
    'add_column',
    {
      description: `Add a new column to an existing database. The column is added at the end with auto-generated UUID as ID and auto-assigned order. Existing rows will have null values for the new column until updated.

For select/multi_select types, provide options as [{label, color?}] — they are automatically converted to {choices: [{id, label, color}]} format. The type "multi_select" is stored as "multi-select" (with hyphen) for frontend compatibility.

Column names must be unique within the database. Returns the created column with its generated UUID. Related tools: update_column, delete_column, get_database_schema.`,
      inputSchema: {
        database_id: z.string().describe('The database ID to add a column to. Format: db-uuid.'),
        name: z.string().min(1).describe('Column display name. Must be unique within this database.'),
        type: z.enum(['text', 'number', 'select', 'multi_select', 'date', 'checkbox', 'url', 'email', 'phone', 'formula', 'relation', 'rollup', 'created_time', 'last_edited_time', 'created_by', 'last_edited_by', 'person']).describe('Column data type.'),
        options: z.array(z.object({
          label: z.string(),
          color: z.string().optional(),
        })).optional().describe('Required for select/multi_select. Array of { label: "value", color?: "colorName" }.'),
      },
    },
    async ({ database_id, name, type, options }) => {
      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();

        // Verify user has access to this database
        const hasAccess = await userHasDatabaseAccess(supabase, database_id, userId);
        if (!hasAccess) {
          return {
            content: [{ type: 'text', text: `Access denied: You do not have permission to modify this database.` }],
            isError: true,
          };
        }

        // Get current config
        const { data: dbMeta, error: metaError } = await supabase
          .from('document_databases')
          .select('*')
          .eq('database_id', database_id)
          .single();

        if (metaError || !dbMeta) {
          return {
            content: [{ type: 'text', text: `Database not found: ${database_id}` }],
            isError: true,
          };
        }

        const config = dbMeta.config as { columns?: Array<Record<string, unknown>> };
        const columns = config.columns || [];

        // Check if column already exists (before snapshot to avoid unnecessary snapshots)
        if (columns.some(c => c.name === name)) {
          return {
            content: [{ type: 'text', text: `Column "${name}" already exists.` }],
            isError: true,
          };
        }

        // Snapshot before update
        let snapshotToken = '';
        const snapshot = await saveSnapshot({
          entityType: 'database_config',
          entityId: database_id,
          tableName: 'document_databases',
          toolName: 'add_column',
          operation: 'update',
          data: dbMeta,
          userId,
        });
        snapshotToken = snapshot.token;

        // Create new column (UUID standard, sans prefixe col_)
        const normalizedType = type === 'multi_select' ? 'multi-select' : type;
        const newColumn: Record<string, unknown> = {
          id: crypto.randomUUID(),
          name,
          type: normalizedType,
          visible: true,
          order: columns.length,
        };

        if (options && (type === 'select' || type === 'multi_select')) {
          newColumn.options = {
            choices: options.map(opt => ({
              id: opt.label.toLowerCase().replace(/\s+/g, '_'),
              label: opt.label,
              color: opt.color || 'bg-gray-200',
            })),
          };
        } else if (options) {
          newColumn.options = options;
        }

        columns.push(newColumn);

        // Update config
        const { error } = await supabase
          .from('document_databases')
          .update({
            config: { ...config, columns },
            updated_at: new Date().toISOString(),
          })
          .eq('database_id', database_id);

        if (error) {
          return {
            content: [{ type: 'text', text: `Error adding column: ${error.message}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Column "${name}" added (snapshot: ${snapshotToken}):\n${JSON.stringify(newColumn, null, 2)}` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // update_column - Update a column in a database
  // =========================================================================
  server.registerTool(
    'update_column',
    {
      description: `Update a column's properties (name, visibility, select options). Column type cannot be changed. Only provide the properties you want to change. For select/multi-select, provide options as [{label, color?}] — they are automatically converted to {choices: [{id, label, color}]} format. Hidden columns (visible=false) don't appear in default table views but data is preserved. Get column_id from get_database_schema. Related tools: add_column, delete_column.`,
      inputSchema: {
        database_id: z.string().describe('The database ID. Format: db-uuid.'),
        column_id: z.string().describe('The column UUID to update. Format: standard UUID (e.g., "a1b2c3d4-e5f6-..."). Get from get_database_schema.'),
        name: z.string().min(1).optional().describe('New display name. Leave undefined to keep current.'),
        visible: z.boolean().optional().describe('Set to false to hide column in views. Data is preserved.'),
        options: z.array(z.object({
          label: z.string(),
          color: z.string().optional(),
        })).optional().describe('Replace select/multi-select options as [{label, color?}]. Automatically converted to {choices: [...]} format.'),
      },
      annotations: { idempotentHint: true },
    },
    async ({ database_id, column_id, name, visible, options }) => {
      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();

        // Verify user has access to this database
        const hasAccess = await userHasDatabaseAccess(supabase, database_id, userId);
        if (!hasAccess) {
          return {
            content: [{ type: 'text', text: `Access denied: You do not have permission to modify this database.` }],
            isError: true,
          };
        }

        const { data: dbMeta, error: metaError } = await supabase
          .from('document_databases')
          .select('*')
          .eq('database_id', database_id)
          .single();

        if (metaError || !dbMeta) {
          return {
            content: [{ type: 'text', text: `Database not found: ${database_id}` }],
            isError: true,
          };
        }

        const config = dbMeta.config as { columns?: Array<Record<string, unknown>> };
        const columns = config.columns || [];

        const columnIndex = columns.findIndex(c => c.id === column_id);
        if (columnIndex === -1) {
          return {
            content: [{ type: 'text', text: `Column not found: ${column_id}` }],
            isError: true,
          };
        }

        // Snapshot before update (after validation)
        let snapshotToken = '';
        const snapshot = await saveSnapshot({
          entityType: 'database_config',
          entityId: database_id,
          tableName: 'document_databases',
          toolName: 'update_column',
          operation: 'update',
          data: dbMeta,
          userId,
        });
        snapshotToken = snapshot.token;

        // Update column properties
        if (name !== undefined) columns[columnIndex].name = name;
        if (visible !== undefined) columns[columnIndex].visible = visible;
        if (options !== undefined) {
          const colType = columns[columnIndex].type as string;
          if (colType === 'select' || colType === 'multi-select') {
            columns[columnIndex].options = {
              choices: options.map(opt => ({
                id: opt.label.toLowerCase().replace(/\s+/g, '_'),
                label: opt.label,
                color: opt.color || 'bg-gray-200',
              })),
            };
          } else {
            columns[columnIndex].options = options;
          }
        }

        const { error } = await supabase
          .from('document_databases')
          .update({
            config: { ...config, columns },
            updated_at: new Date().toISOString(),
          })
          .eq('database_id', database_id);

        if (error) {
          return {
            content: [{ type: 'text', text: `Error updating column: ${error.message}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Column updated (snapshot: ${snapshotToken}):\n${JSON.stringify(columns[columnIndex], null, 2)}` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // delete_column - Delete a column from a database
  // =========================================================================
  server.registerTool(
    'delete_column',
    {
      description: `Delete a column from a database. WARNING: All cell data for this column in existing rows is permanently lost. The column is removed from the schema and cannot be recovered. Consider using update_column with visible=false to hide instead of delete. Get column_id from get_database_schema. Returns the name of the deleted column.`,
      inputSchema: {
        database_id: z.string().describe('The database ID. Format: db-uuid.'),
        column_id: z.string().describe('The column UUID to delete. Format: standard UUID (e.g., "a1b2c3d4-e5f6-..."). Get from get_database_schema.'),
      },
      annotations: { destructiveHint: true },
    },
    async ({ database_id, column_id }) => {
      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();

        // Verify user has access to this database
        const hasAccess = await userHasDatabaseAccess(supabase, database_id, userId);
        if (!hasAccess) {
          return {
            content: [{ type: 'text', text: `Access denied: You do not have permission to modify this database.` }],
            isError: true,
          };
        }

        const { data: dbMeta, error: metaError } = await supabase
          .from('document_databases')
          .select('*')
          .eq('database_id', database_id)
          .single();

        if (metaError || !dbMeta) {
          return {
            content: [{ type: 'text', text: `Database not found: ${database_id}` }],
            isError: true,
          };
        }

        const config = dbMeta.config as { columns?: Array<Record<string, unknown>> };
        const columns = config.columns || [];

        const columnIndex = columns.findIndex(c => c.id === column_id);
        if (columnIndex === -1) {
          return {
            content: [{ type: 'text', text: `Column not found: ${column_id}` }],
            isError: true,
          };
        }

        // Snapshot before update (after validation)
        let snapshotToken = '';
        const snapshot = await saveSnapshot({
          entityType: 'database_config',
          entityId: database_id,
          tableName: 'document_databases',
          toolName: 'delete_column',
          operation: 'update',
          data: dbMeta,
          userId,
        });
        snapshotToken = snapshot.token;

        const deletedColumn = columns[columnIndex];
        columns.splice(columnIndex, 1);

        const { error } = await supabase
          .from('document_databases')
          .update({
            config: { ...config, columns },
            updated_at: new Date().toISOString(),
          })
          .eq('database_id', database_id);

        if (error) {
          return {
            content: [{ type: 'text', text: `Error deleting column: ${error.message}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Column "${deletedColumn.name}" deleted (snapshot: ${snapshotToken}).` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // import_csv - Import CSV data into a database
  // =========================================================================
  server.registerTool(
    'import_csv',
    {
      description: `Bulk import data from CSV format into a database. The first row must be column headers matching database column names. Each subsequent row becomes a database row. Column names are matched case-sensitively. Unknown columns can be skipped or cause an error based on skip_unknown_columns. Values are imported as strings - type conversion is not automatic. Returns count of imported rows. Useful for migrating data or bulk population. Related tools: add_database_row (single row), get_database_schema (column names).`,
      inputSchema: {
        database_id: z.string().describe('The database ID to import into. Format: db-uuid.'),
        csv_content: z.string().describe('CSV string with header row. Format: "Column1,Column2\\nvalue1,value2\\nvalue3,value4"'),
        skip_unknown_columns: z.boolean().optional().default(true).describe('If true (default), ignore columns not in schema. If false, error on unknown columns.'),
      },
    },
    async ({ database_id, csv_content, skip_unknown_columns }) => {
      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();

        // Verify user has access to this database
        const hasAccess = await userHasDatabaseAccess(supabase, database_id, userId);
        if (!hasAccess) {
          return {
            content: [{ type: 'text', text: `Access denied: You do not have permission to modify this database.` }],
            isError: true,
          };
        }

        // Get database metadata
        const { data: dbMeta, error: metaError } = await supabase
          .from('document_databases')
          .select('*')
          .eq('database_id', database_id)
          .single();

        if (metaError || !dbMeta) {
          return {
            content: [{ type: 'text', text: `Database not found: ${database_id}` }],
            isError: true,
          };
        }

        const config = dbMeta.config as { columns?: Array<{ id: string; name: string }> };
        const columns = config.columns || [];

        // Parse CSV
        const lines = csv_content.trim().split('\n');
        if (lines.length < 2) {
          return {
            content: [{ type: 'text', text: 'CSV must have at least a header row and one data row.' }],
            isError: true,
          };
        }

        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const rows: Array<Record<string, unknown>> = [];

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
          const rowData: Record<string, unknown> = {};

          for (let j = 0; j < headers.length; j++) {
            const column = columns.find(c => c.name === headers[j]);
            if (column) {
              // Map to individual column (matches Angular pattern)
              const colName = `col_${column.id.replace(/-/g, '_')}`;
              rowData[colName] = values[j] || null;
            } else if (!skip_unknown_columns) {
              return {
                content: [{ type: 'text', text: `Unknown column in CSV: ${headers[j]}` }],
                isError: true,
              };
            }
          }

          rowData['row_order'] = i;
          rows.push(rowData);
        }

        if (rows.length === 0) {
          return {
            content: [{ type: 'text', text: 'No valid rows to import.' }],
            isError: true,
          };
        }

        const tableName = `database_${database_id.replace('db-', '').replace(/-/g, '_')}`;

        // Get current max row_order
        const { data: maxOrderRow } = await supabase
          .from(tableName)
          .select('row_order')
          .order('row_order', { ascending: false })
          .limit(1)
          .single();

        const startOrder = (maxOrderRow?.row_order || 0) + 1;

        // Adjust row orders
        const rowsToInsert = rows.map((r, idx) => ({
          ...r,
          row_order: startOrder + idx,
        }));

        const { data, error } = await supabase
          .from(tableName)
          .insert(rowsToInsert)
          .select();

        if (error) {
          return {
            content: [{ type: 'text', text: `Error importing CSV: ${error.message}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Successfully imported ${data?.length || 0} rows.` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );
}
