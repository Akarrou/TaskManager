import { z } from 'zod';
import { getSupabaseClient } from '../services/supabase-client.js';
import { getCurrentUserId } from '../services/user-auth.js';
import { saveSnapshot } from '../services/snapshot.js';
import { convertToHtml, convertToStyledHtml } from '../utils/tiptap-to-html.js';
import { convertToMarkdown } from '../utils/tiptap-to-markdown.js';
import { normalizeContent, buildAccordionItem, assignBlockIds } from '../utils/normalize-content.js';
import { parseInlineMarkdown } from '../utils/markdown-to-tiptap.js';
import { getDocumentStructure, hasComplexBlocks, getComplexBlockTypes, applyEditOperations, findBlockIndexByBlockId, } from '../utils/document-operations.js';
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
                    content: [{ type: 'text', text: `Error listing documents. Please try again.` }],
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
                content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
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
- "markdown" (default): human-readable Markdown + block structure map (indices, types, previews, block_ids). Includes everything needed to read AND edit a document in a single call.
- "structure": block structure map only (no content) — lightweight alternative when you only need block indices and block_ids.
- "html": HTML fragment, useful for rendering or embedding.
- "styled_html": full standalone HTML document with professional CSS styles and print layout — use this when the user needs to export, print, or generate a PDF.

When the user asks for HTML, export, or PDF, use format="styled_html". Use list_documents first to find document IDs.

EDITING DOCUMENTS: To modify an existing document, call get_document (markdown format gives you both content and structure), then use \`edit_document\` to apply targeted operations (insert, replace, remove, append). Target blocks by block_id (most precise, stable UUID), heading text (e.g. "Introduction"), or numeric index from the structure map. Only use \`update_document\` to rename a document (title only) or to rewrite simple documents from scratch.

Related tools: edit_document (modify content), get_document_breadcrumb (path), list_comments (see comments).`,
        inputSchema: {
            document_id: z.string().uuid().describe('The UUID of the document to retrieve. Get this from list_documents or search_documents.'),
            format: z.enum(['markdown', 'html', 'styled_html', 'structure']).optional().default('markdown')
                .describe('Output format. "markdown" (default): human-readable content + block structure map, ideal for reading and editing. "structure": block map only (lightweight). "html": HTML fragment. "styled_html": full HTML with print styles, for PDF export.'),
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
                    content: [{ type: 'text', text: `Error getting document. Please try again.` }],
                    isError: true,
                };
            }
            // Structure format: return block map for edit_document targeting
            if (format === 'structure') {
                const structure = getDocumentStructure(data.content);
                const result = {
                    id: data.id,
                    title: data.title,
                    format,
                    structure,
                    parent_id: data.parent_id,
                    project_id: data.project_id,
                    updated_at: data.updated_at,
                };
                return {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                };
            }
            let convertedContent;
            if (format === 'styled_html') {
                convertedContent = data.content ? convertToStyledHtml(data.content, data.title || 'Sans titre') : '';
            }
            else if (format === 'html') {
                convertedContent = data.content ? convertToHtml(data.content) : '';
            }
            else {
                convertedContent = data.content ? convertToMarkdown(data.content) : '';
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
            // Include structure in markdown responses for edit_document targeting
            if (format === 'markdown') {
                result.structure = getDocumentStructure(data.content);
            }
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
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
  { "type": "image", "url": "https://example.com/img.png", "alt": "Screenshot" },
  { "type": "accordion", "items": [
    { "title": "Section 1", "content": "Simple text" },
    { "title": "Section 2", "content": [{ "type": "paragraph", "text": "Rich content" }], "icon": "settings", "iconColor": "#10b981" }
  ]},
  { "type": "columns", "columns": ["Left column text", [{ "type": "paragraph", "text": "Right column" }]] }
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
- accordion: { items: [{ title, content, icon?, iconColor?, titleColor? }] } — Collapsible accordion (content can be a string or an array of blocks)
- columns: { columns: [col1, col2, ...] } — Multi-column layout (each column can be a string or an array of blocks, 2-3 columns recommended)

Text values support inline markdown: **bold**, *italic*, ~~strikethrough~~, \`code\`, [link](url).

Fallback: a plain markdown string is also accepted but the JSON array format above is preferred.

To embed a database table in a document, use create_database with a document_id — the server handles the embedding automatically.

Related tools: edit_document (modify content), create_database (embed a table).`,
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
                    content: [{ type: 'text', text: `Error creating document. Please try again.` }],
                    isError: true,
                };
            }
            return {
                content: [{ type: 'text', text: `Document created successfully:\n${JSON.stringify(data, null, 2)}` }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // update_document - Update an existing document
    // =========================================================================
    server.registerTool('update_document', {
        description: `Update a document's title or completely rewrite its content. Only provide the fields you want to change — unspecified fields remain unchanged.

⚠️ WARNING: Passing "content" REPLACES THE ENTIRE DOCUMENT. All existing blocks (accordions, columns, databases, tables, etc.) will be LOST and replaced.

DO NOT use this tool to add, edit, or remove sections of an existing document. Use \`edit_document\` instead — it combines structure inspection + targeted edits in one call, preserving complex blocks.

VALID use cases for update_document:
- Rename a document: pass only "title", omit "content"
- Full rewrite: create entirely new content from scratch (no existing content to preserve)

The "content" field accepts Kodo Content JSON (JSON array of blocks, see create_document) or a plain markdown string.`,
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
            // Guard: block full content replacement if document has complex blocks
            if (content !== undefined && currentDoc && hasComplexBlocks(currentDoc.content)) {
                const complexTypes = getComplexBlockTypes(currentDoc.content);
                return {
                    content: [{ type: 'text', text: `ERROR: Cannot replace content — this document contains complex blocks (${complexTypes.join(', ')}) that would be destroyed.\n\nUse \`edit_document\` instead to safely modify specific sections while preserving complex blocks.\n\nTo rename the document, call update_document with only the "title" parameter (omit "content").` }],
                    isError: true,
                };
            }
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
                    content: [{ type: 'text', text: `Error updating document. Please try again.` }],
                    isError: true,
                };
            }
            return {
                content: [{ type: 'text', text: `Document updated (snapshot: ${snapshotToken}):\n${JSON.stringify(data, null, 2)}` }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
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
                    content: [{ type: 'text', text: `Error soft-deleting document. Please try again.` }],
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
                content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // search_documents - Search documents by title
    // =========================================================================
    server.registerTool('search_documents', {
        description: `Search for documents by title using case-insensitive partial matching. Use this to find documents when you know part of the title. Returns matching documents sorted by last updated. For full-text search across titles AND content, use search_documents_content instead. The search uses SQL ILIKE for partial matching - "meeting" would match "Team Meeting Notes" and "Q4 meeting minutes". Related tools: search_documents_content (full-text), list_documents (browse all), get_document (full content).`,
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
                    content: [{ type: 'text', text: `Error searching documents. Please try again.` }],
                    isError: true,
                };
            }
            return {
                content: [{ type: 'text', text: `Found ${data.length} documents:\n${JSON.stringify(data, null, 2)}` }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
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
                content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // search_documents_content - Full-text search across titles AND content
    // =========================================================================
    server.registerTool('search_documents_content', {
        description: `Full-text search across document titles AND content. More powerful than search_documents (title-only). Uses PostgreSQL full-text search with French stemming — handles conjugations, accents, and partial words. Returns documents with highlighted excerpts (matching terms wrapped in >>> and <<<), relevance scores, and metadata. Use this when you need to find information inside document bodies, not just titles.`,
        inputSchema: {
            query: z.string().min(1).describe('Search query. Supports natural language with French stemming (e.g., "réunion" matches "réunions", "se réunir").'),
            project_id: z.string().uuid().optional().describe('Limit search to a specific project.'),
            limit: z.number().min(1).max(50).optional().default(20).describe('Maximum results. Default 20, max 50.'),
            offset: z.number().min(0).optional().default(0).describe('Number of results to skip for pagination.'),
        },
        annotations: { readOnlyHint: true },
    }, async ({ query, project_id, limit, offset }) => {
        try {
            const userId = getCurrentUserId();
            const supabase = getSupabaseClient();
            const { data, error } = await supabase.rpc('search_documents_fulltext', {
                p_user_id: userId,
                p_query: query,
                p_project_id: project_id || null,
                p_limit: limit,
                p_offset: offset,
            });
            if (error) {
                // Check if the RPC function doesn't exist yet (migration not deployed)
                if (error.message.includes('search_documents_fulltext') || error.code === '42883') {
                    return {
                        content: [{ type: 'text', text: `Full-text search is not available yet. The SQL migration '20260225100001_add_document_fulltext_search.sql' must be deployed to Supabase first. Use search_documents (title-only) as a fallback.` }],
                        isError: true,
                    };
                }
                return {
                    content: [{ type: 'text', text: `Error searching documents. Please try again.` }],
                    isError: true,
                };
            }
            return {
                content: [{ type: 'text', text: `Found ${data.length} documents:\n${JSON.stringify(data, null, 2)}` }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // edit_document - Compound tool for safe document editing
    // =========================================================================
    server.registerTool('edit_document', {
        description: `The PREFERRED tool for modifying existing documents. Combines structure inspection + targeted edits in a single call, preserving complex blocks (accordions, columns, databases, spreadsheets, mindmaps).

Performs one or more operations on a document's blocks. Each operation targets blocks by block_id (most precise), numeric index, or heading text (case-insensitive search).

Operations:
- "insert_after": Insert new blocks after the target block
- "insert_before": Insert new blocks before the target block
- "replace": Replace target block(s) with new content (use end_target for a range)
- "remove": Remove target block(s) (use end_target for a range)
- "append": Add blocks at the end of the document (no target needed)

Target can be:
- A block_id string (e.g. "block-550e8400-...") — most precise, stable across edits
- A number: block index (use get_document with format="structure" to find indices)
- A string: heading text (case-insensitive search, e.g. "Introduction")

Ranges: target and end_target are both INCLUSIVE. Example: target=3, end_target=5 → blocks 3, 4, 5. You can also use block_id/end_block_id for range boundaries.

Examples:
1. Insert after a block by block_id:
   { "action": "insert_after", "block_id": "block-550e8400-e29b-41d4-a716-446655440000", "content": [{ "type": "paragraph", "text": "New paragraph" }] }

2. Replace blocks 3-5 by index:
   { "action": "replace", "target": 3, "end_target": 5, "content": [{ "type": "heading", "level": 2, "text": "Updated" }] }

3. Append at end:
   { "action": "append", "content": [{ "type": "heading", "level": 2, "text": "Conclusion" }] }

4. Remove a section:
   { "action": "remove", "target": "Obsolete Section", "end_target": 8 }

Content uses Kodo Content JSON (same format as create_document, including accordion). A snapshot is created before any modification.

WHEN TO USE WHICH TOOL:
- edit_document → modify parts of an existing document (add, edit, remove sections)
- update_document → rename a document (title only) or full rewrite of simple documents
- create_document → create a new document from scratch`,
        inputSchema: {
            document_id: z.string().uuid().describe('The UUID of the document to edit.'),
            title: z.string().min(1).max(500).optional().describe('Optional new title. Leave undefined to keep current title.'),
            operations: z.array(z.object({
                action: z.enum(['insert_after', 'insert_before', 'replace', 'remove', 'append']).describe('The edit action to perform.'),
                target: z.union([z.number().int(), z.string()]).optional().describe('Block index (number) or heading text (string) to target. Not needed for "append". Prefer block_id for precision.'),
                end_target: z.union([z.number().int(), z.string()]).optional().describe('End of range (inclusive). For multi-block replace/remove. Can be index or heading text.'),
                block_id: z.string().optional().describe('Target block by its stable UUID (e.g. "block-550e8400-..."). Most precise targeting method. Takes priority over target if both are provided.'),
                end_block_id: z.string().optional().describe('End of range by block_id. Takes priority over end_target if both are provided.'),
                content: z.any().optional().describe('New content blocks (Kodo Content JSON array or markdown string). Required for insert_after, insert_before, replace, append.'),
            })).min(1).describe('List of edit operations to apply in order.'),
        },
        annotations: { idempotentHint: false },
    }, async ({ document_id, title, operations }) => {
        try {
            const userId = getCurrentUserId();
            const supabase = getSupabaseClient();
            // Fetch current document
            const { data: currentDoc, error: fetchError } = await supabase
                .from('documents')
                .select('*')
                .eq('id', document_id)
                .eq('user_id', userId)
                .is('deleted_at', null)
                .single();
            if (fetchError || !currentDoc) {
                return {
                    content: [{ type: 'text', text: `Error: Document not found or access denied.` }],
                    isError: true,
                };
            }
            // Parse current content as TipTap doc
            const currentContent = (currentDoc.content || { type: 'doc', content: [] });
            const doc = currentContent.type === 'doc' ? currentContent : { type: 'doc', content: [currentContent] };
            const structureBefore = getDocumentStructure(doc);
            // Normalize content in each operation
            const normalizedOps = operations.map((op) => {
                const editOp = {
                    action: op.action,
                    target: op.target,
                    end_target: op.end_target,
                    block_id: op.block_id,
                    end_block_id: op.end_block_id,
                };
                if (op.content !== undefined && op.content !== null) {
                    const normalized = normalizeContent(op.content);
                    editOp.content = normalized.content || [];
                }
                return editOp;
            });
            // Apply operations
            const result = applyEditOperations(doc, normalizedOps);
            // Assign blockIds to any newly inserted blocks
            assignBlockIds(result.doc);
            if (result.operationsApplied === 0) {
                return {
                    content: [{ type: 'text', text: `Error: No operations could be applied.\n\nWarnings:\n${result.warnings.map((w) => `- ${w}`).join('\n')}\n\nCurrent structure:\n${JSON.stringify(structureBefore, null, 2)}` }],
                    isError: true,
                };
            }
            // Snapshot before saving
            const snapshot = await saveSnapshot({
                entityType: 'document',
                entityId: document_id,
                tableName: 'documents',
                toolName: 'edit_document',
                operation: 'update',
                data: currentDoc,
                userId,
            });
            // Build updates
            const updates = {
                content: result.doc,
                updated_at: new Date().toISOString(),
            };
            if (title !== undefined) {
                updates.title = title;
            }
            // Save
            const { data: updated, error: updateError } = await supabase
                .from('documents')
                .update(updates)
                .eq('id', document_id)
                .eq('user_id', userId)
                .select('id, title, updated_at')
                .single();
            if (updateError) {
                return {
                    content: [{ type: 'text', text: `Error saving document. Please try again.` }],
                    isError: true,
                };
            }
            const structureAfter = getDocumentStructure(result.doc);
            const response = {
                snapshot_token: snapshot.token,
                operations_applied: result.operationsApplied,
                structure_before: structureBefore,
                structure_after: structureAfter,
                document: updated,
            };
            if (result.warnings.length > 0) {
                response.warnings = result.warnings;
            }
            return {
                content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // edit_accordion - Add, update, or remove items in an existing accordion
    // =========================================================================
    server.registerTool('edit_accordion', {
        description: `Add, update, or remove items in an existing accordion (accordionGroup) inside a document.

Targets an accordion by its block_id (preferred) or block index in the document structure (use get_document with format="structure" to find it — accordions appear as type "accordion" with their block_id).

Operations (applied in order):

1. **"add"** — Insert new items into the accordion.
   - "position": insertion index (0 = first, default: append at end)
   - "items": array of { title, content, icon?, iconColor?, titleColor? }

2. **"update"** — Modify an existing item (title, content, style, or any combination).
   - "item_index": which item to update (0-based)
   - Only provided fields are changed; omitted fields keep their current value.
   - "title", "content", "icon", "iconColor", "titleColor": new values

3. **"remove"** — Delete one or more items from the accordion.
   - "item_index": first item to remove (0-based)
   - "count": how many consecutive items to remove (default: 1)
   - If all items would be removed, the entire accordion block is replaced by a paragraph.

IMPORTANT: Operations are applied sequentially. Each operation sees the accordion state left by the previous one. If you remove item 0, the former item 1 becomes item 0 for subsequent operations. Plan your item_index values accordingly.

Content format is the same as create_document: a plain text string or a JSON array of Kodo Content blocks. Text supports inline markdown (**bold**, *italic*, etc.).

A snapshot is created before any modification.

Examples:
1. Add two items at the end:
   { "operations": [{ "action": "add", "items": [{ "title": "New", "content": "Text" }, { "title": "Other", "content": "More text" }] }] }

2. Update item 1's title and icon:
   { "operations": [{ "action": "update", "item_index": 1, "title": "Updated title", "icon": "star", "iconColor": "#f59e0b" }] }

3. Remove item 0:
   { "operations": [{ "action": "remove", "item_index": 0 }] }

4. Combined — update item 0 then add a new one:
   { "operations": [
     { "action": "update", "item_index": 0, "content": "Rewritten content" },
     { "action": "add", "items": [{ "title": "Extra", "content": "Added" }] }
   ]}

Related tools: edit_document (general block editing), get_document (inspect structure), create_document (accordion block format).`,
        inputSchema: {
            document_id: z.string().uuid().describe('The UUID of the document containing the accordion.'),
            block_id: z.string().optional().describe('The block_id of the accordion (e.g. "block-550e8400-..."). Preferred over block_index. Use get_document with format="structure" to find it.'),
            block_index: z.number().int().min(0).optional().describe('The top-level block index of the accordionGroup. Use get_document with format="structure" to find it. Required if block_id is not provided.'),
            operations: z.array(z.object({
                action: z.enum(['add', 'update', 'remove']).describe('The operation to perform.'),
                // --- add fields ---
                position: z.number().int().min(0).optional().describe('For "add": insertion index within the accordion (0 = first). Default: append at end.'),
                items: z.array(z.object({
                    title: z.string().describe('Accordion item title.'),
                    content: z.any().optional().describe('Content: plain text string or JSON array of Kodo Content blocks.'),
                    icon: z.string().optional().describe('Material Icons name (default: "description").'),
                    iconColor: z.string().optional().describe('CSS color for the icon (default: "#3b82f6").'),
                    titleColor: z.string().optional().describe('CSS color for the title (default: "#1f2937").'),
                })).optional().describe('For "add": items to insert.'),
                // --- update fields ---
                item_index: z.number().int().min(0).optional().describe('For "update"/"remove": the 0-based item index within the accordion.'),
                title: z.string().optional().describe('For "update": new title (omit to keep current).'),
                content: z.any().optional().describe('For "update": new content (omit to keep current).'),
                icon: z.string().optional().describe('For "update": new icon name (omit to keep current).'),
                iconColor: z.string().optional().describe('For "update": new icon color (omit to keep current).'),
                titleColor: z.string().optional().describe('For "update": new title color (omit to keep current).'),
                // --- remove fields ---
                count: z.number().int().min(1).optional().describe('For "remove": number of consecutive items to remove (default: 1).'),
            })).min(1).describe('List of operations to apply in order.'),
        },
        annotations: { idempotentHint: false },
    }, async ({ document_id, block_id, block_index, operations }) => {
        try {
            const userId = getCurrentUserId();
            const supabase = getSupabaseClient();
            // Fetch current document
            const { data: currentDoc, error: fetchError } = await supabase
                .from('documents')
                .select('*')
                .eq('id', document_id)
                .eq('user_id', userId)
                .is('deleted_at', null)
                .single();
            if (fetchError || !currentDoc) {
                return {
                    content: [{ type: 'text', text: 'Error: Document not found or access denied.' }],
                    isError: true,
                };
            }
            // Parse content
            const currentContent = (currentDoc.content || { type: 'doc', content: [] });
            const doc = currentContent.type === 'doc' ? currentContent : { type: 'doc', content: [currentContent] };
            const blocks = doc.content || [];
            // Resolve block_id → block_index if provided
            let resolvedBlockIndex = block_index;
            if (block_id) {
                const idx = findBlockIndexByBlockId(doc, block_id);
                if (idx === null) {
                    return {
                        content: [{ type: 'text', text: `Error: block_id "${block_id}" not found in document. Use get_document with format="structure" to find valid block_ids.` }],
                        isError: true,
                    };
                }
                resolvedBlockIndex = idx;
            }
            if (resolvedBlockIndex === undefined) {
                return {
                    content: [{ type: 'text', text: 'Error: Either block_id or block_index must be provided.' }],
                    isError: true,
                };
            }
            // Validate block_index
            if (resolvedBlockIndex >= blocks.length) {
                return {
                    content: [{ type: 'text', text: `Error: block_index ${resolvedBlockIndex} is out of range (document has ${blocks.length} blocks). Use get_document with format="structure" to find the correct index.` }],
                    isError: true,
                };
            }
            const targetBlock = blocks[resolvedBlockIndex];
            if (targetBlock.type !== 'accordionGroup') {
                const structure = getDocumentStructure(doc);
                return {
                    content: [{ type: 'text', text: `Error: Block at index ${resolvedBlockIndex} is "${targetBlock.type}", not an accordion.\n\nDocument structure:\n${JSON.stringify(structure, null, 2)}` }],
                    isError: true,
                };
            }
            const accordionItems = targetBlock.content || [];
            const warnings = [];
            let opsApplied = 0;
            const summary = [];
            // Apply operations in order
            for (let i = 0; i < operations.length; i++) {
                const op = operations[i];
                const opLabel = `Op[${i}] ${op.action}`;
                switch (op.action) {
                    case 'add': {
                        if (!op.items || op.items.length === 0) {
                            warnings.push(`${opLabel}: no items provided, skipped`);
                            break;
                        }
                        const newNodes = op.items.map((item) => buildAccordionItem({
                            title: item.title,
                            content: item.content ?? '',
                            icon: item.icon,
                            iconColor: item.iconColor,
                            titleColor: item.titleColor,
                        }));
                        const insertPos = op.position !== undefined ? Math.min(op.position, accordionItems.length) : accordionItems.length;
                        accordionItems.splice(insertPos, 0, ...newNodes);
                        summary.push(`added ${newNodes.length} item(s) at position ${insertPos}`);
                        opsApplied++;
                        break;
                    }
                    case 'update': {
                        if (op.item_index === undefined) {
                            warnings.push(`${opLabel}: item_index is required, skipped`);
                            break;
                        }
                        if (op.item_index >= accordionItems.length) {
                            warnings.push(`${opLabel}: item_index ${op.item_index} out of range (accordion has ${accordionItems.length} items), skipped`);
                            break;
                        }
                        if (op.title === undefined && op.content === undefined && op.icon === undefined && op.iconColor === undefined && op.titleColor === undefined) {
                            warnings.push(`${opLabel}: no fields to update provided, skipped`);
                            break;
                        }
                        const existingItem = accordionItems[op.item_index];
                        const titleNode = existingItem.content?.find((n) => n.type === 'accordionTitle');
                        const contentNode = existingItem.content?.find((n) => n.type === 'accordionContent');
                        // Update title text
                        if (op.title !== undefined && titleNode) {
                            titleNode.content = parseInlineMarkdown(op.title);
                        }
                        // Update title attrs (icon, iconColor, titleColor)
                        if (titleNode) {
                            if (!titleNode.attrs)
                                titleNode.attrs = {};
                            if (op.icon !== undefined)
                                titleNode.attrs.icon = op.icon;
                            if (op.iconColor !== undefined)
                                titleNode.attrs.iconColor = op.iconColor;
                            if (op.titleColor !== undefined)
                                titleNode.attrs.titleColor = op.titleColor;
                        }
                        // Update content
                        if (op.content !== undefined && contentNode) {
                            const normalized = normalizeContent(op.content);
                            contentNode.content = normalized.content || [{ type: 'paragraph' }];
                        }
                        summary.push(`updated item ${op.item_index}`);
                        opsApplied++;
                        break;
                    }
                    case 'remove': {
                        if (op.item_index === undefined) {
                            warnings.push(`${opLabel}: item_index is required, skipped`);
                            break;
                        }
                        if (op.item_index >= accordionItems.length) {
                            warnings.push(`${opLabel}: item_index ${op.item_index} out of range (accordion has ${accordionItems.length} items), skipped`);
                            break;
                        }
                        const removeCount = Math.min(op.count || 1, accordionItems.length - op.item_index);
                        accordionItems.splice(op.item_index, removeCount);
                        summary.push(`removed ${removeCount} item(s) from position ${op.item_index}`);
                        opsApplied++;
                        break;
                    }
                }
            }
            if (opsApplied === 0) {
                return {
                    content: [{ type: 'text', text: `Error: No operations could be applied.\n\nWarnings:\n${warnings.map((w) => `- ${w}`).join('\n')}` }],
                    isError: true,
                };
            }
            // If all items removed, replace accordion with empty paragraph
            if (accordionItems.length === 0) {
                blocks.splice(resolvedBlockIndex, 1, { type: 'paragraph' });
                summary.push('accordion was empty after removals — replaced with paragraph');
            }
            else {
                targetBlock.content = accordionItems;
            }
            // Assign blockIds to newly created nodes
            assignBlockIds(doc);
            // Snapshot before saving
            const snapshot = await saveSnapshot({
                entityType: 'document',
                entityId: document_id,
                tableName: 'documents',
                toolName: 'edit_accordion',
                operation: 'update',
                data: currentDoc,
                userId,
            });
            // Save
            const { data: updated, error: updateError } = await supabase
                .from('documents')
                .update({
                content: doc,
                updated_at: new Date().toISOString(),
            })
                .eq('id', document_id)
                .eq('user_id', userId)
                .select('id, title, updated_at')
                .single();
            if (updateError) {
                return {
                    content: [{ type: 'text', text: 'Error saving document. Please try again.' }],
                    isError: true,
                };
            }
            const response = {
                snapshot_token: snapshot.token,
                operations_applied: opsApplied,
                summary,
                total_accordion_items: accordionItems.length,
                document: updated,
            };
            if (warnings.length > 0) {
                response.warnings = warnings;
            }
            return {
                content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
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
                content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
                isError: true,
            };
        }
    });
}
//# sourceMappingURL=documents.js.map