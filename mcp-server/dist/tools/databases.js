import { z } from 'zod';
import { getSupabaseClient } from '../services/supabase-client.js';
/**
 * Register all database-related tools (for dynamic Notion-like databases)
 */
export function registerDatabaseTools(server) {
    // =========================================================================
    // list_databases - List all databases
    // =========================================================================
    server.tool('list_databases', 'List all dynamic databases (Notion-like tables) in the system.', {
        document_id: z.string().uuid().optional().describe('Filter databases by the document they belong to'),
        type: z.enum(['task', 'generic']).optional().describe('Filter by database type'),
    }, async ({ document_id, type }) => {
        try {
            const supabase = getSupabaseClient();
            let query = supabase
                .from('document_databases')
                .select('*')
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
            // Filter by type if specified
            let filtered = data || [];
            if (type) {
                filtered = filtered.filter((db) => {
                    const config = db.config;
                    return config?.type === type;
                });
            }
            // Return simplified view
            const simplified = filtered.map((db) => ({
                database_id: db.database_id,
                name: db.name,
                document_id: db.document_id,
                type: db.config?.type || 'generic',
                column_count: (db.config?.columns || []).length,
                created_at: db.created_at,
                updated_at: db.updated_at,
            }));
            return {
                content: [{ type: 'text', text: JSON.stringify(simplified, null, 2) }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // get_database_schema - Get database column configuration
    // =========================================================================
    server.tool('get_database_schema', 'Get the schema (columns configuration) of a database.', {
        database_id: z.string().describe('The database ID (format: db-uuid)'),
    }, async ({ database_id }) => {
        try {
            const supabase = getSupabaseClient();
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
            const config = data.config;
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
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // get_database_rows - Query rows from a database
    // =========================================================================
    server.tool('get_database_rows', 'Get rows from a database with optional filtering and sorting.', {
        database_id: z.string().describe('The database ID (format: db-uuid)'),
        limit: z.number().min(1).max(100).optional().default(50).describe('Maximum rows to return'),
        offset: z.number().min(0).optional().default(0).describe('Number of rows to skip'),
        sort_by: z.string().optional().describe('Column name to sort by'),
        sort_order: z.enum(['asc', 'desc']).optional().default('asc').describe('Sort direction'),
    }, async ({ database_id, limit, offset, sort_by, sort_order }) => {
        try {
            const supabase = getSupabaseClient();
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
            const tableName = `database_${database_id.replace('db-', '')}`;
            let query = supabase
                .from(tableName)
                .select('*', { count: 'exact' });
            // Apply sorting
            if (sort_by) {
                // For cell-based sorting, we sort by row_order or created_at
                // Full cell sorting would require client-side sort
                query = query.order('row_order', { ascending: sort_order === 'asc' });
            }
            else {
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
            // Denormalize cells using column metadata
            const config = dbMeta.config;
            const columns = config.columns || [];
            const denormalizedRows = (data || []).map((row) => {
                const cells = row.cells;
                const denormalized = {
                    _id: row.id,
                    _row_order: row.row_order,
                    _created_at: row.created_at,
                    _updated_at: row.updated_at,
                };
                for (const col of columns) {
                    denormalized[col.name] = cells[col.id] ?? null;
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
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // add_database_row - Add a new row to a database
    // =========================================================================
    server.tool('add_database_row', 'Add a new row to a database. Provide cell values as a JSON object mapping column names to values.', {
        database_id: z.string().describe('The database ID (format: db-uuid)'),
        cells: z.record(z.unknown()).describe('Cell values as { columnName: value } object'),
    }, async ({ database_id, cells }) => {
        try {
            const supabase = getSupabaseClient();
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
            const config = dbMeta.config;
            const columns = config.columns || [];
            // Convert column names to column IDs
            const normalizedCells = {};
            for (const [name, value] of Object.entries(cells)) {
                const column = columns.find(c => c.name === name);
                if (column) {
                    normalizedCells[column.id] = value;
                }
            }
            const tableName = `database_${database_id.replace('db-', '')}`;
            // Get max row_order
            const { data: maxOrderRow } = await supabase
                .from(tableName)
                .select('row_order')
                .order('row_order', { ascending: false })
                .limit(1)
                .single();
            const newRowOrder = (maxOrderRow?.row_order || 0) + 1;
            const { data, error } = await supabase
                .from(tableName)
                .insert({
                cells: normalizedCells,
                row_order: newRowOrder,
            })
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
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // update_database_row - Update a row in a database
    // =========================================================================
    server.tool('update_database_row', 'Update specific cells in a database row.', {
        database_id: z.string().describe('The database ID (format: db-uuid)'),
        row_id: z.string().uuid().describe('The row ID to update'),
        cells: z.record(z.unknown()).describe('Cell values to update as { columnName: value } object'),
    }, async ({ database_id, row_id, cells }) => {
        try {
            const supabase = getSupabaseClient();
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
            const config = dbMeta.config;
            const columns = config.columns || [];
            const tableName = `database_${database_id.replace('db-', '')}`;
            // Get current row
            const { data: currentRow, error: getError } = await supabase
                .from(tableName)
                .select('*')
                .eq('id', row_id)
                .single();
            if (getError || !currentRow) {
                return {
                    content: [{ type: 'text', text: `Row not found: ${row_id}` }],
                    isError: true,
                };
            }
            // Merge new cells with existing
            const existingCells = currentRow.cells;
            const updatedCells = { ...existingCells };
            for (const [name, value] of Object.entries(cells)) {
                const column = columns.find(c => c.name === name);
                if (column) {
                    updatedCells[column.id] = value;
                }
            }
            const { data, error } = await supabase
                .from(tableName)
                .update({
                cells: updatedCells,
                updated_at: new Date().toISOString(),
            })
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
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // delete_database_rows - Delete rows from a database
    // =========================================================================
    server.tool('delete_database_rows', 'Delete one or more rows from a database.', {
        database_id: z.string().describe('The database ID (format: db-uuid)'),
        row_ids: z.array(z.string().uuid()).min(1).describe('Array of row IDs to delete'),
    }, async ({ database_id, row_ids }) => {
        try {
            const supabase = getSupabaseClient();
            const tableName = `database_${database_id.replace('db-', '')}`;
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
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // create_database - Create a new database
    // =========================================================================
    server.tool('create_database', 'Create a new Notion-like database with columns configuration.', {
        name: z.string().min(1).max(255).describe('Name of the database'),
        document_id: z.string().uuid().optional().describe('Parent document ID (optional for standalone database)'),
        type: z.enum(['task', 'generic']).optional().default('generic').describe('Database type'),
        columns: z.array(z.object({
            name: z.string().describe('Column name'),
            type: z.enum(['text', 'number', 'select', 'multi_select', 'date', 'checkbox', 'url', 'email', 'phone', 'formula', 'relation', 'rollup', 'created_time', 'last_edited_time', 'created_by', 'last_edited_by', 'person']).describe('Column type'),
            options: z.array(z.object({
                label: z.string(),
                color: z.string().optional(),
            })).optional().describe('Options for select/multi_select columns'),
        })).optional().describe('Column definitions'),
    }, async ({ name, document_id, type, columns }) => {
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
                columnsConfig.push({ id: `col_${crypto.randomUUID().replace(/-/g, '_')}`, name: 'Title', type: 'text', visible: true }, { id: `col_${crypto.randomUUID().replace(/-/g, '_')}`, name: 'Description', type: 'text', visible: true }, { id: `col_${crypto.randomUUID().replace(/-/g, '_')}`, name: 'Status', type: 'select', visible: true, options: [
                        { label: 'backlog', color: 'gray' },
                        { label: 'pending', color: 'yellow' },
                        { label: 'in_progress', color: 'blue' },
                        { label: 'completed', color: 'green' },
                        { label: 'cancelled', color: 'red' },
                    ] }, { id: `col_${crypto.randomUUID().replace(/-/g, '_')}`, name: 'Priority', type: 'select', visible: true, options: [
                        { label: 'low', color: 'gray' },
                        { label: 'medium', color: 'yellow' },
                        { label: 'high', color: 'orange' },
                        { label: 'critical', color: 'red' },
                    ] }, { id: `col_${crypto.randomUUID().replace(/-/g, '_')}`, name: 'Due Date', type: 'date', visible: true }, { id: `col_${crypto.randomUUID().replace(/-/g, '_')}`, name: 'Assigned To', type: 'person', visible: true });
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
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // delete_database - Delete a database
    // =========================================================================
    server.tool('delete_database', 'Delete a database and all its data. This action cannot be undone.', {
        database_id: z.string().describe('The database ID (format: db-uuid)'),
        confirm: z.boolean().describe('Must be true to confirm deletion'),
    }, async ({ database_id, confirm }) => {
        if (!confirm) {
            return {
                content: [{ type: 'text', text: 'Deletion not confirmed. Set confirm=true to proceed.' }],
                isError: true,
            };
        }
        try {
            const supabase = getSupabaseClient();
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
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // add_column - Add a column to a database
    // =========================================================================
    server.tool('add_column', 'Add a new column to an existing database.', {
        database_id: z.string().describe('The database ID (format: db-uuid)'),
        name: z.string().min(1).describe('Column name'),
        type: z.enum(['text', 'number', 'select', 'multi_select', 'date', 'checkbox', 'url', 'email', 'phone', 'formula', 'relation', 'rollup', 'created_time', 'last_edited_time', 'created_by', 'last_edited_by', 'person']).describe('Column type'),
        options: z.array(z.object({
            label: z.string(),
            color: z.string().optional(),
        })).optional().describe('Options for select/multi_select columns'),
    }, async ({ database_id, name, type, options }) => {
        try {
            const supabase = getSupabaseClient();
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
            const config = dbMeta.config;
            const columns = config.columns || [];
            // Check if column already exists
            if (columns.some(c => c.name === name)) {
                return {
                    content: [{ type: 'text', text: `Column "${name}" already exists.` }],
                    isError: true,
                };
            }
            // Create new column
            const newColumn = {
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
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // update_column - Update a column in a database
    // =========================================================================
    server.tool('update_column', 'Update a column\'s properties in a database.', {
        database_id: z.string().describe('The database ID (format: db-uuid)'),
        column_id: z.string().describe('The column ID to update'),
        name: z.string().min(1).optional().describe('New column name'),
        visible: z.boolean().optional().describe('Column visibility'),
        options: z.array(z.object({
            label: z.string(),
            color: z.string().optional(),
        })).optional().describe('Options for select/multi_select columns'),
    }, async ({ database_id, column_id, name, visible, options }) => {
        try {
            const supabase = getSupabaseClient();
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
            const config = dbMeta.config;
            const columns = config.columns || [];
            const columnIndex = columns.findIndex(c => c.id === column_id);
            if (columnIndex === -1) {
                return {
                    content: [{ type: 'text', text: `Column not found: ${column_id}` }],
                    isError: true,
                };
            }
            // Update column properties
            if (name !== undefined)
                columns[columnIndex].name = name;
            if (visible !== undefined)
                columns[columnIndex].visible = visible;
            if (options !== undefined)
                columns[columnIndex].options = options;
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
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // delete_column - Delete a column from a database
    // =========================================================================
    server.tool('delete_column', 'Delete a column from a database. Existing cell data for this column will be lost.', {
        database_id: z.string().describe('The database ID (format: db-uuid)'),
        column_id: z.string().describe('The column ID to delete'),
    }, async ({ database_id, column_id }) => {
        try {
            const supabase = getSupabaseClient();
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
            const config = dbMeta.config;
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
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // import_csv - Import CSV data into a database
    // =========================================================================
    server.tool('import_csv', 'Import CSV data into a database. The CSV must have a header row matching column names.', {
        database_id: z.string().describe('The database ID (format: db-uuid)'),
        csv_content: z.string().describe('CSV content as a string with header row'),
        skip_unknown_columns: z.boolean().optional().default(true).describe('Skip columns not found in database schema'),
    }, async ({ database_id, csv_content, skip_unknown_columns }) => {
        try {
            const supabase = getSupabaseClient();
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
            const config = dbMeta.config;
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
            const rows = [];
            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
                const cells = {};
                for (let j = 0; j < headers.length; j++) {
                    const column = columns.find(c => c.name === headers[j]);
                    if (column) {
                        cells[column.id] = values[j] || null;
                    }
                    else if (!skip_unknown_columns) {
                        return {
                            content: [{ type: 'text', text: `Unknown column in CSV: ${headers[j]}` }],
                            isError: true,
                        };
                    }
                }
                rows.push({ cells, row_order: i });
            }
            if (rows.length === 0) {
                return {
                    content: [{ type: 'text', text: 'No valid rows to import.' }],
                    isError: true,
                };
            }
            const tableName = `database_${database_id.replace('db-', '')}`;
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
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
}
//# sourceMappingURL=databases.js.map