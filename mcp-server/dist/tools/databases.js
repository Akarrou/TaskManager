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
}
//# sourceMappingURL=databases.js.map