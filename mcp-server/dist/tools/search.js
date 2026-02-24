import { z } from 'zod';
import { getSupabaseClient } from '../services/supabase-client.js';
import { getCurrentUserId } from '../services/user-auth.js';
import { getUserDatabasesByType } from '../utils/database-access.js';
/**
 * Register unified search tools
 */
export function registerSearchTools(server) {
    // =========================================================================
    // search - Unified search across all content types
    // =========================================================================
    server.registerTool('search', {
        description: `Unified search across all content types (documents, tasks, events, databases). Use this as the primary discovery tool when you don't know where the information lives. Searches document titles AND content (full-text with French stemming), task/event titles and descriptions (partial matching), and database rows (partial matching on text columns). Returns results grouped by type. More powerful than individual search tools like search_documents (title-only).`,
        inputSchema: {
            query: z.string().min(1).describe('Search term. Supports natural language for documents (French stemming) and partial matching for tasks/events/databases.'),
            types: z.array(z.enum(['documents', 'tasks', 'events', 'databases'])).optional().default(['documents', 'tasks', 'events', 'databases']).describe('Content types to search. Default: all types.'),
            project_id: z.string().uuid().optional().describe('Limit search to a specific project.'),
            limit: z.number().min(1).max(20).optional().default(10).describe('Maximum results per type. Default 10, max 20.'),
        },
        annotations: { readOnlyHint: true },
    }, async ({ query, types, project_id, limit }) => {
        try {
            const userId = getCurrentUserId();
            const supabase = getSupabaseClient();
            const results = {};
            const promises = [];
            // Documents: full-text search via RPC (with ILIKE fallback if migration not deployed)
            if (types.includes('documents')) {
                promises.push((async () => {
                    // Try full-text search first
                    const { data, error } = await supabase.rpc('search_documents_fulltext', {
                        p_user_id: userId,
                        p_query: query,
                        p_project_id: project_id || null,
                        p_limit: limit,
                        p_offset: 0,
                    });
                    if (!error && data) {
                        results.documents = data.map(d => ({ ...d, type: 'document' }));
                    }
                    else {
                        // Fallback: ILIKE on title (works without migration)
                        let fallbackQuery = supabase
                            .from('documents')
                            .select('id, title, parent_id, project_id, updated_at')
                            .eq('user_id', userId)
                            .is('deleted_at', null)
                            .ilike('title', `%${query}%`)
                            .order('updated_at', { ascending: false })
                            .limit(limit);
                        if (project_id) {
                            fallbackQuery = fallbackQuery.eq('project_id', project_id);
                        }
                        const { data: fallbackData } = await fallbackQuery;
                        if (fallbackData) {
                            results.documents = fallbackData.map(d => ({ ...d, type: 'document' }));
                        }
                    }
                })());
            }
            // Tasks: ILIKE scan across task databases
            if (types.includes('tasks')) {
                promises.push((async () => {
                    const taskDatabases = await getUserDatabasesByType(supabase, userId, 'task');
                    const taskResults = [];
                    await Promise.all(taskDatabases.map(async (db) => {
                        const config = db.config;
                        const columns = config.columns || [];
                        const titleCol = columns.find(c => c.name === 'Title');
                        const descCol = columns.find(c => c.name === 'Description');
                        if (!titleCol)
                            return;
                        const tableName = `database_${db.database_id.replace('db-', '').replace(/-/g, '_')}`;
                        const titleColName = `col_${titleCol.id.replace(/-/g, '_')}`;
                        let orFilter = `${titleColName}.ilike.%${query}%`;
                        if (descCol) {
                            const descColName = `col_${descCol.id.replace(/-/g, '_')}`;
                            orFilter += `,${descColName}.ilike.%${query}%`;
                        }
                        let dbQuery = supabase
                            .from(tableName)
                            .select('*')
                            .is('deleted_at', null)
                            .or(orFilter)
                            .limit(limit);
                        if (project_id) {
                            const projectCol = columns.find(c => c.name === 'Project ID');
                            if (projectCol) {
                                const projectColName = `col_${projectCol.id.replace(/-/g, '_')}`;
                                dbQuery = dbQuery.eq(projectColName, project_id);
                            }
                        }
                        const { data: rows } = await dbQuery;
                        for (const row of rows || []) {
                            const getCell = (name) => {
                                const col = columns.find(c => c.name === name);
                                if (!col)
                                    return null;
                                return row[`col_${col.id.replace(/-/g, '_')}`];
                            };
                            taskResults.push({
                                id: row.id,
                                database_id: db.database_id,
                                database_name: db.name,
                                title: getCell('Title') || 'Untitled',
                                status: getCell('Status'),
                                priority: getCell('Priority'),
                                updated_at: row.updated_at,
                                type: 'task',
                            });
                        }
                    }));
                    results.tasks = taskResults.slice(0, limit);
                })());
            }
            // Events: ILIKE scan across event databases
            if (types.includes('events')) {
                promises.push((async () => {
                    const eventDatabases = await getUserDatabasesByType(supabase, userId, 'event');
                    const eventResults = [];
                    await Promise.all(eventDatabases.map(async (db) => {
                        const config = db.config;
                        const columns = config.columns || [];
                        const titleCol = columns.find(c => c.name === 'Title');
                        const descCol = columns.find(c => c.name === 'Description');
                        if (!titleCol)
                            return;
                        const tableName = `database_${db.database_id.replace('db-', '').replace(/-/g, '_')}`;
                        const titleColName = `col_${titleCol.id.replace(/-/g, '_')}`;
                        let orFilter = `${titleColName}.ilike.%${query}%`;
                        if (descCol) {
                            const descColName = `col_${descCol.id.replace(/-/g, '_')}`;
                            orFilter += `,${descColName}.ilike.%${query}%`;
                        }
                        const { data: rows } = await supabase
                            .from(tableName)
                            .select('*')
                            .is('deleted_at', null)
                            .or(orFilter)
                            .limit(limit);
                        for (const row of rows || []) {
                            const getCell = (name) => {
                                const col = columns.find(c => c.name === name);
                                if (!col)
                                    return null;
                                return row[`col_${col.id.replace(/-/g, '_')}`];
                            };
                            eventResults.push({
                                id: row.id,
                                database_id: db.database_id,
                                database_name: db.name,
                                title: getCell('Title') || 'Untitled',
                                start_date: getCell('Start Date'),
                                category: getCell('Category'),
                                updated_at: row.updated_at,
                                type: 'event',
                            });
                        }
                    }));
                    results.events = eventResults.slice(0, limit);
                })());
            }
            // Databases: ILIKE scan across generic databases
            if (types.includes('databases')) {
                promises.push((async () => {
                    const genericDatabases = await getUserDatabasesByType(supabase, userId, 'generic');
                    const dbResults = [];
                    await Promise.all(genericDatabases.map(async (db) => {
                        const config = db.config;
                        const columns = config.columns || [];
                        const textCols = columns.filter(c => ['text', 'url', 'email'].includes(c.type));
                        if (textCols.length === 0)
                            return;
                        const tableName = `database_${db.database_id.replace('db-', '').replace(/-/g, '_')}`;
                        const orFilter = textCols
                            .map(c => `col_${c.id.replace(/-/g, '_')}.ilike.%${query}%`)
                            .join(',');
                        const { data: rows } = await supabase
                            .from(tableName)
                            .select('*')
                            .is('deleted_at', null)
                            .or(orFilter)
                            .limit(limit);
                        for (const row of rows || []) {
                            const firstTextCol = textCols[0];
                            const firstValue = row[`col_${firstTextCol.id.replace(/-/g, '_')}`];
                            dbResults.push({
                                id: row.id,
                                database_id: db.database_id,
                                database_name: db.name,
                                title: firstValue || 'Untitled',
                                updated_at: row.updated_at,
                                type: 'database_row',
                            });
                        }
                    }));
                    results.databases = dbResults.slice(0, limit);
                })());
            }
            await Promise.all(promises);
            const totalResults = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);
            return {
                content: [{ type: 'text', text: `Found ${totalResults} results:\n${JSON.stringify(results, null, 2)}` }],
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
//# sourceMappingURL=search.js.map