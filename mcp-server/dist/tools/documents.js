import { z } from 'zod';
import { getSupabaseClient } from '../services/supabase-client.js';
/**
 * Register all document-related tools
 */
export function registerDocumentTools(server) {
    // =========================================================================
    // list_documents - List all documents
    // =========================================================================
    server.tool('list_documents', 'List all documents with pagination. Can filter by project or parent document for hierarchical navigation.', {
        project_id: z.string().uuid().optional().describe('Filter documents by project ID'),
        parent_id: z.string().uuid().optional().describe('Filter documents by parent document ID (for hierarchy)'),
        limit: z.number().min(1).max(100).optional().default(50).describe('Maximum number of documents to return'),
        offset: z.number().min(0).optional().default(0).describe('Number of documents to skip for pagination'),
    }, async ({ project_id, parent_id, limit, offset }) => {
        try {
            const supabase = getSupabaseClient();
            let query = supabase
                .from('documents')
                .select('id, title, parent_id, project_id, database_id, database_row_id, created_at, updated_at', { count: 'exact' })
                .order('updated_at', { ascending: false })
                .range(offset, offset + limit - 1);
            if (project_id) {
                query = query.eq('project_id', project_id);
            }
            if (parent_id) {
                query = query.eq('parent_id', parent_id);
            }
            const { data, error, count } = await query;
            if (error) {
                return {
                    content: [{ type: 'text', text: `Error listing documents: ${error.message}` }],
                    isError: true,
                };
            }
            const result = {
                documents: data,
                pagination: {
                    total: count || 0,
                    limit,
                    offset,
                    hasMore: (count || 0) > offset + limit,
                },
            };
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
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
    // get_document - Get a document with its content
    // =========================================================================
    server.tool('get_document', 'Get a document by ID including its full content (TipTap JSON).', {
        document_id: z.string().uuid().describe('The UUID of the document'),
    }, async ({ document_id }) => {
        try {
            const supabase = getSupabaseClient();
            const { data, error } = await supabase
                .from('documents')
                .select('*')
                .eq('id', document_id)
                .single();
            if (error) {
                return {
                    content: [{ type: 'text', text: `Error getting document: ${error.message}` }],
                    isError: true,
                };
            }
            return {
                content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
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
    // create_document - Create a new document
    // =========================================================================
    server.tool('create_document', 'Create a new document with optional TipTap content.', {
        title: z.string().min(1).max(500).describe('The title of the document'),
        project_id: z.string().uuid().optional().describe('Optional project ID to associate the document with'),
        parent_id: z.string().uuid().optional().describe('Optional parent document ID for hierarchy'),
        content: z.any().optional().describe('Optional TipTap JSON content (default: empty document)'),
    }, async ({ title, project_id, parent_id, content }) => {
        try {
            const supabase = getSupabaseClient();
            const documentData = {
                title,
                content: content || { type: 'doc', content: [] },
            };
            if (project_id) {
                documentData.project_id = project_id;
            }
            if (parent_id) {
                documentData.parent_id = parent_id;
            }
            const { data, error } = await supabase
                .from('documents')
                .insert(documentData)
                .select()
                .single();
            if (error) {
                return {
                    content: [{ type: 'text', text: `Error creating document: ${error.message}` }],
                    isError: true,
                };
            }
            return {
                content: [{ type: 'text', text: `Document created successfully:\n${JSON.stringify(data, null, 2)}` }],
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
    // update_document - Update an existing document
    // =========================================================================
    server.tool('update_document', 'Update a document\'s title or content.', {
        document_id: z.string().uuid().describe('The UUID of the document to update'),
        title: z.string().min(1).max(500).optional().describe('New title for the document'),
        content: z.any().optional().describe('New TipTap JSON content'),
    }, async ({ document_id, title, content }) => {
        try {
            const supabase = getSupabaseClient();
            const updates = {
                updated_at: new Date().toISOString(),
            };
            if (title !== undefined)
                updates.title = title;
            if (content !== undefined)
                updates.content = content;
            if (Object.keys(updates).length === 1) {
                return {
                    content: [{ type: 'text', text: 'No updates provided. Please specify title or content to update.' }],
                    isError: true,
                };
            }
            const { data, error } = await supabase
                .from('documents')
                .update(updates)
                .eq('id', document_id)
                .select()
                .single();
            if (error) {
                return {
                    content: [{ type: 'text', text: `Error updating document: ${error.message}` }],
                    isError: true,
                };
            }
            return {
                content: [{ type: 'text', text: `Document updated successfully:\n${JSON.stringify(data, null, 2)}` }],
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
    // delete_document - Delete a document
    // =========================================================================
    server.tool('delete_document', 'Delete a document. Use cascade=true to also delete child documents and associated databases.', {
        document_id: z.string().uuid().describe('The UUID of the document to delete'),
        cascade: z.boolean().optional().default(false).describe('If true, delete all child documents and databases'),
    }, async ({ document_id, cascade }) => {
        try {
            const supabase = getSupabaseClient();
            if (cascade) {
                // Get all descendant document IDs
                const descendantIds = await getAllDescendantIds(supabase, document_id);
                const allDocIds = [...descendantIds, document_id];
                // Delete in reverse order (children first)
                for (const docId of allDocIds.reverse()) {
                    const { error } = await supabase
                        .from('documents')
                        .delete()
                        .eq('id', docId);
                    if (error) {
                        return {
                            content: [{ type: 'text', text: `Error deleting document ${docId}: ${error.message}` }],
                            isError: true,
                        };
                    }
                }
                return {
                    content: [{ type: 'text', text: `Document and ${descendantIds.length} child documents deleted successfully.` }],
                };
            }
            else {
                // Simple delete
                const { error } = await supabase
                    .from('documents')
                    .delete()
                    .eq('id', document_id);
                if (error) {
                    return {
                        content: [{ type: 'text', text: `Error deleting document: ${error.message}` }],
                        isError: true,
                    };
                }
                return {
                    content: [{ type: 'text', text: 'Document deleted successfully.' }],
                };
            }
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // search_documents - Search documents by title
    // =========================================================================
    server.tool('search_documents', 'Search documents by title using a text query.', {
        query: z.string().min(1).describe('Search query to match against document titles'),
        project_id: z.string().uuid().optional().describe('Optional project ID to filter search'),
        limit: z.number().min(1).max(50).optional().default(20).describe('Maximum number of results'),
    }, async ({ query, project_id, limit }) => {
        try {
            const supabase = getSupabaseClient();
            let dbQuery = supabase
                .from('documents')
                .select('id, title, parent_id, project_id, updated_at')
                .ilike('title', `%${query}%`)
                .order('updated_at', { ascending: false })
                .limit(limit);
            if (project_id) {
                dbQuery = dbQuery.eq('project_id', project_id);
            }
            const { data, error } = await dbQuery;
            if (error) {
                return {
                    content: [{ type: 'text', text: `Error searching documents: ${error.message}` }],
                    isError: true,
                };
            }
            return {
                content: [{ type: 'text', text: `Found ${data.length} documents:\n${JSON.stringify(data, null, 2)}` }],
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
    // get_document_breadcrumb - Get the navigation path of a document
    // =========================================================================
    server.tool('get_document_breadcrumb', 'Get the full navigation path (breadcrumb) from root to a document.', {
        document_id: z.string().uuid().describe('The UUID of the document'),
    }, async ({ document_id }) => {
        try {
            const supabase = getSupabaseClient();
            const breadcrumb = [];
            let currentId = document_id;
            while (currentId) {
                const { data: docData, error } = await supabase
                    .from('documents')
                    .select('id, title, parent_id')
                    .eq('id', currentId)
                    .single();
                if (error || !docData)
                    break;
                breadcrumb.unshift({ id: docData.id, title: docData.title });
                currentId = docData.parent_id;
            }
            return {
                content: [{ type: 'text', text: JSON.stringify(breadcrumb, null, 2) }],
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
    // get_documents_stats - Get document statistics
    // =========================================================================
    server.tool('get_documents_stats', 'Get statistics about documents (total count, recent documents, last modified).', {
        project_id: z.string().uuid().optional().describe('Optional project ID to filter statistics'),
    }, async ({ project_id }) => {
        try {
            const supabase = getSupabaseClient();
            // Total count
            let countQuery = supabase
                .from('documents')
                .select('id', { count: 'exact', head: true });
            if (project_id) {
                countQuery = countQuery.eq('project_id', project_id);
            }
            const { count } = await countQuery;
            // Recent documents (last 7 days)
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            let recentQuery = supabase
                .from('documents')
                .select('id', { count: 'exact', head: true })
                .gte('created_at', weekAgo.toISOString());
            if (project_id) {
                recentQuery = recentQuery.eq('project_id', project_id);
            }
            const { count: recentCount } = await recentQuery;
            // Last modified document
            let lastModifiedQuery = supabase
                .from('documents')
                .select('id, title, updated_at')
                .order('updated_at', { ascending: false })
                .limit(1);
            if (project_id) {
                lastModifiedQuery = lastModifiedQuery.eq('project_id', project_id);
            }
            const { data: lastModified } = await lastModifiedQuery;
            const stats = {
                total: count || 0,
                recent_7_days: recentCount || 0,
                last_modified: lastModified?.[0] || null,
            };
            return {
                content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }],
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
    // link_task_to_document - Link a task to a document
    // =========================================================================
    server.tool('link_task_to_document', 'Create a relationship between a task and a document.', {
        document_id: z.string().uuid().describe('The UUID of the document'),
        task_id: z.string().uuid().describe('The UUID of the task (row ID from a task database)'),
        relation_type: z.enum(['related', 'blocking', 'blocked_by', 'parent', 'child']).optional().default('related').describe('Type of relationship'),
    }, async ({ document_id, task_id, relation_type }) => {
        try {
            const supabase = getSupabaseClient();
            const { data, error } = await supabase
                .from('document_task_relations')
                .insert({
                document_id,
                task_id,
                relation_type,
            })
                .select()
                .single();
            if (error) {
                return {
                    content: [{ type: 'text', text: `Error linking task to document: ${error.message}` }],
                    isError: true,
                };
            }
            return {
                content: [{ type: 'text', text: `Task linked to document successfully:\n${JSON.stringify(data, null, 2)}` }],
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
    // get_document_tasks - Get tasks linked to a document
    // =========================================================================
    server.tool('get_document_tasks', 'Get all tasks that are linked to a document.', {
        document_id: z.string().uuid().describe('The UUID of the document'),
    }, async ({ document_id }) => {
        try {
            const supabase = getSupabaseClient();
            const { data, error } = await supabase
                .from('document_task_relations')
                .select('*')
                .eq('document_id', document_id);
            if (error) {
                return {
                    content: [{ type: 'text', text: `Error getting document tasks: ${error.message}` }],
                    isError: true,
                };
            }
            return {
                content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
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
    // unlink_task_from_document - Remove a task-document relationship
    // =========================================================================
    server.tool('unlink_task_from_document', 'Remove a relationship between a task and a document.', {
        document_id: z.string().uuid().describe('The UUID of the document'),
        task_id: z.string().uuid().describe('The UUID of the task'),
    }, async ({ document_id, task_id }) => {
        try {
            const supabase = getSupabaseClient();
            const { error } = await supabase
                .from('document_task_relations')
                .delete()
                .eq('document_id', document_id)
                .eq('task_id', task_id);
            if (error) {
                return {
                    content: [{ type: 'text', text: `Error unlinking task from document: ${error.message}` }],
                    isError: true,
                };
            }
            return {
                content: [{ type: 'text', text: 'Task unlinked from document successfully.' }],
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
/**
 * Helper: Get all descendant document IDs recursively
 */
async function getAllDescendantIds(supabase, documentId) {
    const descendants = [];
    const queue = [documentId];
    while (queue.length > 0) {
        const currentId = queue.shift();
        const { data, error } = await supabase
            .from('documents')
            .select('id')
            .eq('parent_id', currentId);
        if (error || !data)
            continue;
        for (const child of data) {
            descendants.push(child.id);
            queue.push(child.id);
        }
    }
    return descendants;
}
//# sourceMappingURL=documents.js.map