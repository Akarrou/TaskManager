import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getSupabaseClient } from '../services/supabase-client.js';
import { env } from '../config.js';

/**
 * Get the current user ID from configuration
 * Throws an error if no user is configured (required for multi-user security)
 */
function getCurrentUserId(): string {
  if (!env.DEFAULT_USER_ID) {
    throw new Error('No user configured. Set DEFAULT_USER_ID in environment.');
  }
  return env.DEFAULT_USER_ID;
}

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
  server.tool(
    'list_databases',
    `List all Notion-like databases in the workspace. Databases are structured tables with typed columns that can be embedded in documents or exist standalone. They support two types: "task" (with predefined columns for task management, used by task tools) and "generic" (custom columns). Returns simplified view with database_id, name, type, column_count, and document_id. Use get_database_schema for full column details. Related tools: create_database, get_database_rows, add_database_row.`,
    {
      document_id: z.string().uuid().optional().describe('Filter to databases embedded in a specific document.'),
      type: z.enum(['task', 'generic']).optional().describe('Filter by database type: "task" for task management, "generic" for custom tables.'),
    },
    async ({ document_id, type }) => {
      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();

        // Get databases linked to documents the user owns
        let query = supabase
          .from('document_databases')
          .select('*, documents!left(user_id)')
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
  server.tool(
    'get_database_schema',
    `Get the complete schema of a database including all column definitions. Returns: database_id, name, type, columns array (with id, name, type, options for selects, visibility), and views configuration. Column types include: text, number, select, multi_select, date, checkbox, url, email, phone, person, formula, relation, rollup, created_time, last_edited_time, created_by, last_edited_by. Essential for understanding how to query and update database rows. Related tools: add_column, update_column.`,
    {
      database_id: z.string().describe('The database ID. Format: db-uuid (e.g., "db-123e4567-e89b-...").'),
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
          }>;
          views?: unknown[];
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
  server.tool(
    'get_database_rows',
    `Query rows from a database with pagination. Returns denormalized rows with column names as keys (not column IDs), plus metadata fields prefixed with underscore: _id (row UUID), _row_order, _created_at, _updated_at. Also returns total_count for pagination. For task databases, use list_tasks instead which provides normalized task fields. Use get_database_schema first to understand available columns. Related tools: add_database_row, update_database_row, delete_database_rows.`,
    {
      database_id: z.string().describe('The database ID. Format: db-uuid.'),
      limit: z.number().min(1).max(100).optional().default(50).describe('Maximum rows per page. Default 50, max 100.'),
      offset: z.number().min(0).optional().default(0).describe('Number of rows to skip for pagination.'),
      sort_by: z.string().optional().describe('Column name to sort by. Currently sorts by row_order.'),
      sort_order: z.enum(['asc', 'desc']).optional().default('asc').describe('Sort direction: asc (ascending) or desc (descending).'),
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
          .select('*', { count: 'exact' });

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
  server.tool(
    'add_database_row',
    `Add a new row to a database. Use column names (not IDs) as keys in the cells object - they are automatically mapped to column IDs. For task databases, use create_task instead which provides a typed interface. The new row is added at the end (highest row_order). Returns the created row with its generated UUID. Example cells: { "Title": "My Item", "Status": "active", "Count": 42 }. Related tools: get_database_schema (column names), update_database_row.`,
    {
      database_id: z.string().describe('The database ID to add a row to. Format: db-uuid.'),
      cells: z.record(z.unknown()).describe('Cell values as { "ColumnName": value } object. Use get_database_schema to see available columns.'),
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
  server.tool(
    'update_database_row',
    `Update specific cells in an existing database row. Only provide the columns you want to change - existing values are preserved for unspecified columns. Uses column names (not IDs) in the cells object. For task databases, use update_task instead. Returns the updated row. Example: { "Status": "completed", "Progress": 100 }. Related tools: get_database_rows (find row IDs), add_database_row, delete_database_rows.`,
    {
      database_id: z.string().describe('The database ID containing the row. Format: db-uuid.'),
      row_id: z.string().uuid().describe('The row UUID to update. Get this from get_database_rows (_id field).'),
      cells: z.record(z.unknown()).describe('Cells to update as { "ColumnName": newValue }. Unspecified columns keep current values.'),
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
          content: [{ type: 'text', text: `Row updated successfully:\n${JSON.stringify(data, null, 2)}` }],
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
  // delete_database_rows - Delete rows from a database
  // =========================================================================
  server.tool(
    'delete_database_rows',
    `Delete one or more rows from a database permanently. Accepts an array of row UUIDs to delete in a single operation. Deletion is immediate and cannot be undone. For task databases, use delete_task instead if you want confirmation logging. Returns count of deleted rows. Related tools: get_database_rows (find rows), update_database_row.`,
    {
      database_id: z.string().describe('The database ID. Format: db-uuid.'),
      row_ids: z.array(z.string().uuid()).min(1).describe('Array of row UUIDs to delete. Get these from get_database_rows (_id field).'),
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

        const { error, count } = await supabase
          .from(tableName)
          .delete()
          .in('id', row_ids);

        if (error) {
          return {
            content: [{ type: 'text', text: `Error deleting rows: ${error.message}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Successfully deleted ${count || row_ids.length} row(s).` }],
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
  server.tool(
    'create_database',
    `Create a new Notion-like database with custom columns. Databases are structured tables that can be embedded in documents or exist standalone. Type "task" creates a database with predefined columns (Title, Description, Status, Priority, Due Date, Assigned To) suitable for task management - use with list_tasks/create_task. Type "generic" creates an empty schema that you define with columns. Returns the created database with its generated database_id. Column IDs are auto-generated. Related tools: add_column (add more columns later), add_database_row (add data).`,
    {
      name: z.string().min(1).max(255).describe('Display name for the database.'),
      document_id: z.string().uuid().optional().describe('Parent document to embed the database in. Omit for standalone database.'),
      type: z.enum(['task', 'generic']).optional().default('generic').describe('"task" creates predefined task columns. "generic" (default) starts empty.'),
      columns: z.array(z.object({
        name: z.string().describe('Column display name.'),
        type: z.enum(['text', 'number', 'select', 'multi_select', 'date', 'checkbox', 'url', 'email', 'phone', 'formula', 'relation', 'rollup', 'created_time', 'last_edited_time', 'created_by', 'last_edited_by', 'person']).describe('Column data type.'),
        options: z.array(z.object({
          label: z.string(),
          color: z.string().optional(),
        })).optional().describe('Required for select/multi_select types. Array of { label, color? }.'),
      })).optional().describe('Initial column definitions. For type "task" with no columns, default task columns are created.'),
    },
    async ({ name, document_id, type, columns }) => {
      try {
        const supabase = getSupabaseClient();

        // Generate unique database ID
        const uuid = crypto.randomUUID();
        const databaseId = `db-${uuid}`;
        const tableName = `database_${uuid.replace(/-/g, '_')}`;

        // Build columns config with generated IDs
        const columnsConfig = (columns || []).map(col => ({
          id: `col_${crypto.randomUUID().replace(/-/g, '_')}`,
          name: col.name,
          type: col.type,
          visible: true,
          ...(col.options ? { options: col.options } : {}),
        }));

        // If task type, add default task columns
        if (type === 'task' && (!columns || columns.length === 0)) {
          columnsConfig.push(
            { id: `col_${crypto.randomUUID().replace(/-/g, '_')}`, name: 'Title', type: 'text', visible: true },
            { id: `col_${crypto.randomUUID().replace(/-/g, '_')}`, name: 'Description', type: 'text', visible: true },
            { id: `col_${crypto.randomUUID().replace(/-/g, '_')}`, name: 'Status', type: 'select', visible: true, options: [
              { label: 'backlog', color: 'gray' },
              { label: 'pending', color: 'yellow' },
              { label: 'in_progress', color: 'blue' },
              { label: 'completed', color: 'green' },
              { label: 'cancelled', color: 'red' },
            ]},
            { id: `col_${crypto.randomUUID().replace(/-/g, '_')}`, name: 'Priority', type: 'select', visible: true, options: [
              { label: 'low', color: 'gray' },
              { label: 'medium', color: 'yellow' },
              { label: 'high', color: 'orange' },
              { label: 'critical', color: 'red' },
            ]},
            { id: `col_${crypto.randomUUID().replace(/-/g, '_')}`, name: 'Due Date', type: 'date', visible: true },
            { id: `col_${crypto.randomUUID().replace(/-/g, '_')}`, name: 'Assigned To', type: 'person', visible: true },
            { id: `col_${crypto.randomUUID().replace(/-/g, '_')}`, name: 'Task Number', type: 'text', visible: true },
            { id: `col_${crypto.randomUUID().replace(/-/g, '_')}`, name: 'Type', type: 'select', visible: true, options: [
              { label: 'epic', color: 'purple' },
              { label: 'feature', color: 'blue' },
              { label: 'task', color: 'gray' },
            ]},
          );
        }

        const config = {
          name,
          type,
          columns: columnsConfig,
          views: [],
        };

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

        return {
          content: [{ type: 'text', text: `Database created successfully:\n${JSON.stringify(dbData, null, 2)}` }],
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
  // delete_database - Delete a database
  // =========================================================================
  server.tool(
    'delete_database',
    `DESTRUCTIVE: Permanently delete a database and ALL its data (rows, linked documents). This action CANNOT be undone. The confirm parameter must be explicitly set to true as a safety measure. Use list_databases to see database_id. Consider exporting data first if needed. Returns confirmation of successful deletion. WARNING: All rows in the database are permanently lost.`,
    {
      database_id: z.string().describe('The database ID to delete. Format: db-uuid.'),
      confirm: z.boolean().describe('REQUIRED: Must be true to proceed. Safety measure against accidental deletion.'),
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

        // Try to use cascade delete RPC if available
        const { error: rpcError } = await supabase.rpc('delete_database_cascade', {
          p_database_id: database_id,
        });

        if (rpcError) {
          // Fallback to manual deletion
          // Delete linked documents
          await supabase
            .from('documents')
            .delete()
            .eq('database_id', database_id);

          // Delete metadata
          const { error: metaError } = await supabase
            .from('document_databases')
            .delete()
            .eq('database_id', database_id);

          if (metaError) {
            return {
              content: [{ type: 'text', text: `Error deleting database: ${metaError.message}` }],
              isError: true,
            };
          }
        }

        return {
          content: [{ type: 'text', text: `Database ${database_id} deleted successfully.` }],
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
  server.tool(
    'add_column',
    `Add a new column to an existing database. The column is added to the end of the column list. Column ID is auto-generated. Existing rows will have null values for the new column until updated. For select/multi_select types, you must provide options. Column names must be unique within the database. Returns the created column with its generated ID. Related tools: update_column, delete_column, get_database_schema.`,
    {
      database_id: z.string().describe('The database ID to add a column to. Format: db-uuid.'),
      name: z.string().min(1).describe('Column display name. Must be unique within this database.'),
      type: z.enum(['text', 'number', 'select', 'multi_select', 'date', 'checkbox', 'url', 'email', 'phone', 'formula', 'relation', 'rollup', 'created_time', 'last_edited_time', 'created_by', 'last_edited_by', 'person']).describe('Column data type.'),
      options: z.array(z.object({
        label: z.string(),
        color: z.string().optional(),
      })).optional().describe('Required for select/multi_select. Array of { label: "value", color?: "colorName" }.'),
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

        // Check if column already exists
        if (columns.some(c => c.name === name)) {
          return {
            content: [{ type: 'text', text: `Column "${name}" already exists.` }],
            isError: true,
          };
        }

        // Create new column
        const newColumn: Record<string, unknown> = {
          id: `col_${crypto.randomUUID().replace(/-/g, '_')}`,
          name,
          type,
          visible: true,
        };

        if (options) {
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
          content: [{ type: 'text', text: `Column "${name}" added successfully:\n${JSON.stringify(newColumn, null, 2)}` }],
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
  server.tool(
    'update_column',
    `Update a column's properties (name, visibility, select options). Column type cannot be changed. Only provide the properties you want to change. For select/multi_select, updating options replaces the entire options array. Hidden columns (visible=false) don't appear in default table views but data is preserved. Get column_id from get_database_schema. Related tools: add_column, delete_column.`,
    {
      database_id: z.string().describe('The database ID. Format: db-uuid.'),
      column_id: z.string().describe('The column ID to update. Format: col_uuid. Get from get_database_schema.'),
      name: z.string().min(1).optional().describe('New display name. Leave undefined to keep current.'),
      visible: z.boolean().optional().describe('Set to false to hide column in views. Data is preserved.'),
      options: z.array(z.object({
        label: z.string(),
        color: z.string().optional(),
      })).optional().describe('Replace select/multi_select options. For other types, this is ignored.'),
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

        // Update column properties
        if (name !== undefined) columns[columnIndex].name = name;
        if (visible !== undefined) columns[columnIndex].visible = visible;
        if (options !== undefined) columns[columnIndex].options = options;

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
          content: [{ type: 'text', text: `Column updated successfully:\n${JSON.stringify(columns[columnIndex], null, 2)}` }],
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
  server.tool(
    'delete_column',
    `Delete a column from a database. WARNING: All cell data for this column in existing rows is permanently lost. The column is removed from the schema and cannot be recovered. Consider using update_column with visible=false to hide instead of delete. Get column_id from get_database_schema. Returns the name of the deleted column.`,
    {
      database_id: z.string().describe('The database ID. Format: db-uuid.'),
      column_id: z.string().describe('The column ID to delete. Format: col_uuid. Get from get_database_schema.'),
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
          content: [{ type: 'text', text: `Column "${deletedColumn.name}" deleted successfully.` }],
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
  server.tool(
    'import_csv',
    `Bulk import data from CSV format into a database. The first row must be column headers matching database column names. Each subsequent row becomes a database row. Column names are matched case-sensitively. Unknown columns can be skipped or cause an error based on skip_unknown_columns. Values are imported as strings - type conversion is not automatic. Returns count of imported rows. Useful for migrating data or bulk population. Related tools: add_database_row (single row), get_database_schema (column names).`,
    {
      database_id: z.string().describe('The database ID to import into. Format: db-uuid.'),
      csv_content: z.string().describe('CSV string with header row. Format: "Column1,Column2\\nvalue1,value2\\nvalue3,value4"'),
      skip_unknown_columns: z.boolean().optional().default(true).describe('If true (default), ignore columns not in schema. If false, error on unknown columns.'),
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
