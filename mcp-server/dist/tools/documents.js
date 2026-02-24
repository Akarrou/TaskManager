import { z } from 'zod';
import { getSupabaseClient } from '../services/supabase-client.js';
import { getCurrentUserId } from '../services/user-auth.js';
import { saveSnapshot } from '../services/snapshot.js';
import { convertToHtml, convertToStyledHtml } from '../utils/tiptap-to-html.js';
import { convertToMarkdown } from '../utils/tiptap-to-markdown.js';
import { normalizeContent } from '../utils/normalize-content.js';
/**
 * Register all document-related tools
 */
export function registerDocumentTools(server) {
    // =========================================================================
    // list_documents - List all documents
    // =========================================================================
    server.registerTool('list_documents', {
        description: `List documents in the Kodo workspace with pagination support. Documents are rich-text pages that can be organized hierarchically with parent-child relationships. They can belong to projects, contain embedded databases, and be organized within tabs. Returns document metadata (id, title, parent_id, project_id) with pagination info including total count and hasMore flag. Use get_document to retrieve full content. Related tools: search_documents (find by title), get_document_breadcrumb (navigation path).`,
        inputSchema: {
            project_id: z.string().uuid().optional().describe('Filter to only documents in this project. Get project IDs from list_projects.'),
            parent_id: z.string().uuid().optional().describe('Filter to child documents of this parent. Use to navigate hierarchical document structures or find sub-pages.'),
            limit: z.number().min(1).max(100).optional().default(50).describe('Maximum documents per page. Default 50, max 100.'),
            offset: z.number().min(0).optional().default(0).describe('Number of documents to skip for pagination. Use with limit for paging through large sets.'),
        },
        annotations: { readOnlyHint: true },
    }, async ({ project_id, parent_id, limit, offset }) => {
        try {
            const userId = getCurrentUserId();
            const supabase = getSupabaseClient();
            let query = supabase
                .from('documents')
                .select('id, title, parent_id, project_id, database_id, database_row_id, created_at, updated_at', { count: 'exact' })
                .eq('user_id', userId) // Filter by current user
                .is('deleted_at', null)
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
    server.registerTool('get_document', {
        description: `Get a document's full details including its rich-text content. Returns the complete document object with: id, title, content, parent_id, project_id, database_id (if linked to a database row), and timestamps.

Available formats via the "format" parameter:
- "markdown" (default): human-readable Markdown, most token-efficient for reading and editing.
- "html": HTML fragment, useful for rendering or embedding.
- "styled_html": full standalone HTML document with professional CSS styles and print layout — use this when the user needs to export, print, or generate a PDF.
- "json": raw TipTap internal JSON, only for debugging or custom extensions.

When the user asks for HTML, export, or PDF, use format="styled_html". Use list_documents first to find document IDs. Related tools: update_document (modify content), get_document_breadcrumb (path), list_comments (see comments).`,
        inputSchema: {
            document_id: z.string().uuid().describe('The UUID of the document to retrieve. Get this from list_documents or search_documents.'),
            format: z.enum(['json', 'markdown', 'html', 'styled_html']).optional().default('markdown')
                .describe('Output format for document content. "markdown" (default): human-readable Markdown, recommended for reading and editing. "json": raw internal JSON, use only for debugging or custom extensions. "html": formatted HTML fragment. "styled_html": full HTML document with professional print styles, suitable for PDF export.'),
        },
        annotations: { readOnlyHint: true },
    }, async ({ document_id, format }) => {
        try {
            const userId = getCurrentUserId();
            const supabase = getSupabaseClient();
            const { data, error } = await supabase
                .from('documents')
                .select('*')
                .eq('id', document_id)
                .eq('user_id', userId) // Verify ownership
                .is('deleted_at', null)
                .single();
            if (error) {
                return {
                    content: [{ type: 'text', text: `Error getting document: ${error.message}` }],
                    isError: true,
                };
            }
            if (format !== 'json' && data.content) {
                let convertedContent;
                if (format === 'styled_html') {
                    convertedContent = convertToStyledHtml(data.content, data.title || 'Sans titre');
                }
                else if (format === 'html') {
                    convertedContent = convertToHtml(data.content);
                }
                else {
                    convertedContent = convertToMarkdown(data.content);
                }
                const result = {
                    id: data.id,
                    title: data.title,
                    content: convertedContent,
                    format,
                    parent_id: data.parent_id,
                    project_id: data.project_id,
                    database_id: data.database_id,
                    database_row_id: data.database_row_id,
                    created_at: data.created_at,
                    updated_at: data.updated_at,
                };
                return {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
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
    server.registerTool('create_document', {
        description: `Create a new document (rich-text page) in the Kodo workspace. Returns the created document with its generated UUID — keep this id to later update or reference the document. Can be organized hierarchically via parent_id or linked to a database row (Notion-style) via database_id/database_row_id.

The "content" field accepts a JSON array of blocks (Kodo Content JSON). Each block has a "type" and simple data keys. The server converts it automatically to the editor's internal format.

Example:
[
  { "type": "heading", "level": 1, "text": "Project Overview" },
  { "type": "paragraph", "text": "This is a **bold** statement with *italic* text." },
  { "type": "heading", "level": 2, "text": "Key Points" },
  { "type": "list", "items": ["First point", "Second point", "Third point"] },
  { "type": "quote", "text": "Important note to remember" },
  { "type": "code", "language": "typescript", "text": "const x = 42;" },
  { "type": "divider" },
  { "type": "checklist", "items": [{ "text": "Done", "checked": true }, { "text": "To do", "checked": false }] },
  { "type": "table", "headers": ["Name", "Role"], "rows": [["Alice", "Dev"], ["Bob", "PM"]] },
  { "type": "image", "url": "https://example.com/img.png", "alt": "Screenshot" }
]

Available block types:
- heading: { level: 1-6, text } — Section headings
- paragraph: { text } — Regular text
- list: { items: string[] } — Bullet list
- ordered_list: { items: string[] } — Numbered list
- checklist: { items: [{ text, checked }] } — Task/checkbox list
- quote: { text } — Blockquote
- code: { language?, text } — Code block
- divider: {} — Horizontal rule
- table: { headers: string[], rows: string[][] } — Table with headers and rows
- image: { url, alt? } — Image

Text values support inline markdown: **bold**, *italic*, ~~strikethrough~~, \`code\`, [link](url).

Fallback: a plain markdown string is also accepted but the JSON array format above is preferred.

To embed a database table in a document, use create_database with a document_id — the server handles the embedding automatically.

Related tools: update_document (modify content), create_database (embed a table).`,
        inputSchema: {
            title: z.string().min(1).max(500).describe('The document title displayed in navigation and breadcrumbs. Should be descriptive.'),
            project_id: z.string().uuid().optional().describe('Project to associate this document with. Required for the document to appear in project navigation.'),
            parent_id: z.string().uuid().optional().describe('Parent document ID to create a nested/child document. Creates hierarchical wiki-like structure.'),
            content: z.any().optional().describe('Document content as a JSON array of blocks (see description for format and examples). A plain markdown string is also accepted as fallback. Leave empty for a blank document.'),
            database_id: z.string().optional().describe('Database ID if this document represents a database row (Notion-style). Format: db-uuid.'),
            database_row_id: z.string().uuid().optional().describe('Row ID in the database this document is linked to.'),
        },
    }, async ({ title, project_id, parent_id, content, database_id, database_row_id }) => {
        try {
            const userId = getCurrentUserId();
            const supabase = getSupabaseClient();
            const documentData = {
                title,
                content: normalizeContent(content),
                user_id: userId, // Always set user_id for ownership
            };
            if (project_id) {
                documentData.project_id = project_id;
            }
            if (parent_id) {
                documentData.parent_id = parent_id;
            }
            if (database_id) {
                documentData.database_id = database_id;
            }
            if (database_row_id) {
                documentData.database_row_id = database_row_id;
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
    server.registerTool('update_document', {
        description: `Update a document's title and/or content. Requires the document_id (returned by create_document or list_documents). Only provide the fields you want to change — unspecified fields remain unchanged. The document's updated_at timestamp is automatically set.

IMPORTANT: This replaces the entire content field. To add or modify content, first call get_document to read the current content, then send the full updated content including both existing and new blocks.

The "content" field accepts the same Kodo Content JSON format as create_document (JSON array of blocks). A plain markdown string is also accepted as fallback.`,
        inputSchema: {
            document_id: z.string().uuid().describe('The UUID of the document to update. Get this from list_documents.'),
            title: z.string().min(1).max(500).optional().describe('New title. Leave undefined to keep current title.'),
            content: z.any().optional().describe('New document content. Accepts: JSON array of blocks (recommended, see create_document for format) or plain markdown string as fallback. Normalized automatically. Leave undefined to keep current content.'),
        },
        annotations: { idempotentHint: true },
    }, async ({ document_id, title, content }) => {
        try {
            const userId = getCurrentUserId();
            const supabase = getSupabaseClient();
            const updates = {
                updated_at: new Date().toISOString(),
            };
            if (title !== undefined)
                updates.title = title;
            if (content !== undefined)
                updates.content = normalizeContent(content);
            if (Object.keys(updates).length === 1) {
                return {
                    content: [{ type: 'text', text: 'No updates provided. Please specify title or content to update.' }],
                    isError: true,
                };
            }
            // Fetch current state and snapshot before modification
            const { data: currentDoc } = await supabase
                .from('documents')
                .select('*')
                .eq('id', document_id)
                .eq('user_id', userId)
                .single();
            let snapshotToken = '';
            if (currentDoc) {
                const snapshot = await saveSnapshot({
                    entityType: 'document',
                    entityId: document_id,
                    tableName: 'documents',
                    toolName: 'update_document',
                    operation: 'update',
                    data: currentDoc,
                    userId,
                });
                snapshotToken = snapshot.token;
            }
            const { data, error } = await supabase
                .from('documents')
                .update(updates)
                .eq('id', document_id)
                .eq('user_id', userId) // Verify ownership
                .select()
                .single();
            if (error) {
                return {
                    content: [{ type: 'text', text: `Error updating document: ${error.message}` }],
                    isError: true,
                };
            }
            return {
                content: [{ type: 'text', text: `Document updated (snapshot: ${snapshotToken}):\n${JSON.stringify(data, null, 2)}` }],
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
    // delete_document - Soft delete a document (move to trash)
    // =========================================================================
    server.registerTool('delete_document', {
        description: `Move a document to the trash (soft delete). The document is marked as deleted but can be restored within 30 days using restore_from_trash. Only the top-level document is marked — child documents remain intact but become inaccessible. On restore, the entire hierarchy reappears. A snapshot is taken before deletion for additional recovery.`,
        inputSchema: {
            document_id: z.string().uuid().describe('The UUID of the document to move to trash.'),
        },
        annotations: { destructiveHint: true },
    }, async ({ document_id }) => {
        try {
            const userId = getCurrentUserId();
            const supabase = getSupabaseClient();
            // Verify ownership and get document info
            const { data: doc, error: verifyError } = await supabase
                .from('documents')
                .select('*')
                .eq('id', document_id)
                .eq('user_id', userId)
                .single();
            if (verifyError || !doc) {
                return {
                    content: [{ type: 'text', text: 'Document not found or access denied.' }],
                    isError: true,
                };
            }
            // Snapshot before soft delete
            let snapshotToken = '';
            const snapshot = await saveSnapshot({
                entityType: 'document',
                entityId: document_id,
                tableName: 'documents',
                toolName: 'delete_document',
                operation: 'soft_delete',
                data: doc,
                userId,
            });
            snapshotToken = snapshot.token;
            const now = new Date().toISOString();
            // Soft delete: set deleted_at
            const { error: updateError } = await supabase
                .from('documents')
                .update({ deleted_at: now })
                .eq('id', document_id)
                .eq('user_id', userId);
            if (updateError) {
                return {
                    content: [{ type: 'text', text: `Error soft-deleting document: ${updateError.message}` }],
                    isError: true,
                };
            }
            // Insert into trash_items
            const parentInfo = {};
            if (doc.project_id)
                parentInfo.projectId = doc.project_id;
            await supabase
                .from('trash_items')
                .insert({
                item_type: 'document',
                item_id: document_id,
                item_table: 'documents',
                display_name: doc.title || 'Untitled document',
                parent_info: Object.keys(parentInfo).length > 0 ? parentInfo : null,
                user_id: userId,
                deleted_at: now,
            });
            return {
                content: [{ type: 'text', text: `Document moved to trash (snapshot: ${snapshotToken}). Use restore_from_trash to recover it.` }],
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
    // search_documents - Search documents by title
    // =========================================================================
    server.registerTool('search_documents', {
        description: `Search for documents by title using case-insensitive partial matching. Use this to find documents when you know part of the title. Returns matching documents sorted by last updated. More efficient than list_documents when looking for specific content. The search uses SQL ILIKE for partial matching - "meeting" would match "Team Meeting Notes" and "Q4 meeting minutes". Related tools: list_documents (browse all), get_document (full content).`,
        inputSchema: {
            query: z.string().min(1).describe('Search term to match against document titles. Partial matches are supported (e.g., "report" matches "Q4 Report").'),
            project_id: z.string().uuid().optional().describe('Limit search to a specific project. Omit to search across all projects.'),
            limit: z.number().min(1).max(50).optional().default(20).describe('Maximum results to return. Default 20, max 50.'),
        },
        annotations: { readOnlyHint: true },
    }, async ({ query, project_id, limit }) => {
        try {
            const userId = getCurrentUserId();
            const supabase = getSupabaseClient();
            let dbQuery = supabase
                .from('documents')
                .select('id, title, parent_id, project_id, updated_at')
                .eq('user_id', userId) // Filter by current user
                .is('deleted_at', null)
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
    server.registerTool('get_document_breadcrumb', {
        description: `Get the navigation path from the root document to the specified document. Returns an ordered array of ancestors from root to the document itself, each with id and title. Useful for understanding document hierarchy and building navigation UI. Example output: [{ id: "...", title: "Parent" }, { id: "...", title: "Child" }]. Returns just the document itself if it has no parent.`,
        inputSchema: {
            document_id: z.string().uuid().describe('The UUID of the document to get the breadcrumb for.'),
        },
        annotations: { readOnlyHint: true },
    }, async ({ document_id }) => {
        try {
            const userId = getCurrentUserId();
            const supabase = getSupabaseClient();
            const breadcrumb = [];
            let currentId = document_id;
            while (currentId) {
                const { data: docData, error } = await supabase
                    .from('documents')
                    .select('id, title, parent_id')
                    .eq('id', currentId)
                    .eq('user_id', userId) // Filter by current user
                    .is('deleted_at', null)
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
    server.registerTool('get_documents_stats', {
        description: `Get aggregate statistics about documents in the workspace. Returns: total document count, count of documents created in last 7 days, and the most recently modified document. Useful for dashboards, monitoring activity, or understanding workspace usage. Can be filtered to a specific project or show all projects. Related tools: list_documents (browse), get_task_stats (task metrics).`,
        inputSchema: {
            project_id: z.string().uuid().optional().describe('Filter statistics to a specific project. Omit for workspace-wide stats.'),
        },
        annotations: { readOnlyHint: true },
    }, async ({ project_id }) => {
        try {
            const userId = getCurrentUserId();
            const supabase = getSupabaseClient();
            // Total count
            let countQuery = supabase
                .from('documents')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', userId) // Filter by current user
                .is('deleted_at', null);
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
                .eq('user_id', userId) // Filter by current user
                .is('deleted_at', null)
                .gte('created_at', weekAgo.toISOString());
            if (project_id) {
                recentQuery = recentQuery.eq('project_id', project_id);
            }
            const { count: recentCount } = await recentQuery;
            // Last modified document
            let lastModifiedQuery = supabase
                .from('documents')
                .select('id, title, updated_at')
                .eq('user_id', userId) // Filter by current user
                .is('deleted_at', null)
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
}
//# sourceMappingURL=documents.js.map