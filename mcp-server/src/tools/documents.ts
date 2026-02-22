import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getSupabaseClient } from '../services/supabase-client.js';
import { getCurrentUserId } from '../services/user-auth.js';
import { saveSnapshot } from '../services/snapshot.js';

/**
 * Register all document-related tools
 */
export function registerDocumentTools(server: McpServer): void {
  // =========================================================================
  // list_documents - List all documents
  // =========================================================================
  server.tool(
    'list_documents',
    `List documents in the Kodo workspace with pagination support. Documents are rich-text pages (using TipTap editor format) that can be organized hierarchically with parent-child relationships. They can belong to projects, contain embedded databases, and be organized within tabs. Returns document metadata (id, title, parent_id, project_id) with pagination info including total count and hasMore flag. Use get_document to retrieve full content. Related tools: search_documents (find by title), get_document_breadcrumb (navigation path).`,
    {
      project_id: z.string().uuid().optional().describe('Filter to only documents in this project. Get project IDs from list_projects.'),
      parent_id: z.string().uuid().optional().describe('Filter to child documents of this parent. Use to navigate hierarchical document structures or find sub-pages.'),
      limit: z.number().min(1).max(100).optional().default(50).describe('Maximum documents per page. Default 50, max 100.'),
      offset: z.number().min(0).optional().default(0).describe('Number of documents to skip for pagination. Use with limit for paging through large sets.'),
    },
    async ({ project_id, parent_id, limit, offset }) => {
      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();
        let query = supabase
          .from('documents')
          .select('id, title, parent_id, project_id, database_id, database_row_id, created_at, updated_at', { count: 'exact' })
          .eq('user_id', userId) // Filter by current user
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
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // get_document - Get a document with its content
  // =========================================================================
  server.tool(
    'get_document',
    `Get a document's full details including its rich-text content. Returns the complete document object with: id, title, content (TipTap JSON format), parent_id, project_id, database_id (if linked to a database row), and timestamps. The content field contains a TipTap document structure with nested nodes like paragraphs, headings, lists, tables, and embedded databases. Use list_documents first to find document IDs. Related tools: update_document (modify content), get_document_breadcrumb (path), list_comments (see comments).`,
    {
      document_id: z.string().uuid().describe('The UUID of the document to retrieve. Get this from list_documents or search_documents.'),
    },
    async ({ document_id }) => {
      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from('documents')
          .select('*')
          .eq('id', document_id)
          .eq('user_id', userId) // Verify ownership
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
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // create_document - Create a new document
  // =========================================================================
  server.tool(
    'create_document',
    `Create a new document (rich-text page) in the Kodo workspace. Documents support TipTap editor content including headings, paragraphs, lists, tables, code blocks, and embedded databases. They can be organized hierarchically by setting a parent_id for wiki-like nested structure. Returns the created document with its generated UUID. Typical workflow: create document, then use update_document to add content, or link it to a tab/section for navigation. Can also be linked to a database row (Notion-style) by providing database_id and database_row_id. Related tools: update_document (add content), create_database (embed a table).`,
    {
      title: z.string().min(1).max(500).describe('The document title displayed in navigation and breadcrumbs. Should be descriptive.'),
      project_id: z.string().uuid().optional().describe('Project to associate this document with. Required for the document to appear in project navigation.'),
      parent_id: z.string().uuid().optional().describe('Parent document ID to create a nested/child document. Creates hierarchical wiki-like structure.'),
      content: z.any().optional().describe('Initial TipTap JSON content. Format: { type: "doc", content: [...nodes] }. Leave empty for a blank document.'),
      database_id: z.string().optional().describe('Database ID if this document represents a database row (Notion-style). Format: db-uuid.'),
      database_row_id: z.string().uuid().optional().describe('Row ID in the database this document is linked to.'),
    },
    async ({ title, project_id, parent_id, content, database_id, database_row_id }) => {
      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();

        const documentData: Record<string, unknown> = {
          title,
          content: content || { type: 'doc', content: [] },
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
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // update_document - Update an existing document
  // =========================================================================
  server.tool(
    'update_document',
    `Update a document's title and/or content. Only provide the fields you want to change - unspecified fields remain unchanged. Content must be valid TipTap JSON format (nodes with type and optional content array). The document's updated_at timestamp is automatically set. Use get_document first to see current content if you need to modify it partially. Note: This replaces the entire content field, so include all existing content you want to keep.`,
    {
      document_id: z.string().uuid().describe('The UUID of the document to update. Get this from list_documents.'),
      title: z.string().min(1).max(500).optional().describe('New title. Leave undefined to keep current title.'),
      content: z.any().optional().describe('New TipTap JSON content to replace existing. Format: { type: "doc", content: [...] }. Leave undefined to keep current content.'),
    },
    async ({ document_id, title, content }) => {
      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();

        const updates: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };

        if (title !== undefined) updates.title = title;
        if (content !== undefined) updates.content = content;

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
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // delete_document - Delete a document
  // =========================================================================
  server.tool(
    'delete_document',
    `Delete a document from the workspace. By default, only deletes the specified document - child documents become orphaned. Use cascade=true to delete the entire document tree including all nested child documents and any embedded databases. WARNING: Deleted documents cannot be recovered. Returns confirmation with count of deleted items when cascade is used. Comments and file attachments linked to deleted documents are also removed.`,
    {
      document_id: z.string().uuid().describe('The UUID of the document to delete.'),
      cascade: z.boolean().optional().default(false).describe('Set to true to also delete all child documents and embedded databases recursively. Default false deletes only the specified document.'),
    },
    async ({ document_id, cascade }) => {
      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();

        // First verify ownership
        const { data: doc, error: verifyError } = await supabase
          .from('documents')
          .select('id')
          .eq('id', document_id)
          .eq('user_id', userId)
          .single();

        if (verifyError || !doc) {
          return {
            content: [{ type: 'text', text: 'Document not found or access denied.' }],
            isError: true,
          };
        }

        if (cascade) {
          // Get all descendant document IDs (already filtered by user in getAllDescendantIds)
          const descendantIds = await getAllDescendantIds(supabase, document_id, userId);
          const allDocIds = [...descendantIds, document_id];

          // Snapshot all documents before deletion
          const snapshotTokens: string[] = [];
          for (const docId of allDocIds) {
            const { data: docData } = await supabase
              .from('documents')
              .select('*')
              .eq('id', docId)
              .eq('user_id', userId)
              .single();

            if (docData) {
              const snapshot = await saveSnapshot({
                entityType: 'document',
                entityId: docId,
                tableName: 'documents',
                toolName: 'delete_document',
                operation: 'delete',
                data: docData,
                userId,
              });
              snapshotTokens.push(snapshot.token);
            }
          }

          // Delete in reverse order (children first)
          for (const docId of allDocIds.reverse()) {
            const { error } = await supabase
              .from('documents')
              .delete()
              .eq('id', docId)
              .eq('user_id', userId); // Extra safety

            if (error) {
              return {
                content: [{ type: 'text', text: `Error deleting document ${docId}: ${error.message}` }],
                isError: true,
              };
            }
          }

          return {
            content: [{ type: 'text', text: `Document and ${descendantIds.length} child documents deleted (snapshots: ${snapshotTokens.join(', ')}).` }],
          };
        } else {
          // Snapshot before simple delete
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
              toolName: 'delete_document',
              operation: 'delete',
              data: currentDoc,
              userId,
            });
            snapshotToken = snapshot.token;
          }

          const { error } = await supabase
            .from('documents')
            .delete()
            .eq('id', document_id)
            .eq('user_id', userId); // Verify ownership

          if (error) {
            return {
              content: [{ type: 'text', text: `Error deleting document: ${error.message}` }],
              isError: true,
            };
          }

          return {
            content: [{ type: 'text', text: `Document deleted (snapshot: ${snapshotToken}).` }],
          };
        }
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // search_documents - Search documents by title
  // =========================================================================
  server.tool(
    'search_documents',
    `Search for documents by title using case-insensitive partial matching. Use this to find documents when you know part of the title. Returns matching documents sorted by last updated. More efficient than list_documents when looking for specific content. The search uses SQL ILIKE for partial matching - "meeting" would match "Team Meeting Notes" and "Q4 meeting minutes". Related tools: list_documents (browse all), get_document (full content).`,
    {
      query: z.string().min(1).describe('Search term to match against document titles. Partial matches are supported (e.g., "report" matches "Q4 Report").'),
      project_id: z.string().uuid().optional().describe('Limit search to a specific project. Omit to search across all projects.'),
      limit: z.number().min(1).max(50).optional().default(20).describe('Maximum results to return. Default 20, max 50.'),
    },
    async ({ query, project_id, limit }) => {
      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();
        let dbQuery = supabase
          .from('documents')
          .select('id, title, parent_id, project_id, updated_at')
          .eq('user_id', userId) // Filter by current user
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
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // get_document_breadcrumb - Get the navigation path of a document
  // =========================================================================
  server.tool(
    'get_document_breadcrumb',
    `Get the navigation path from the root document to the specified document. Returns an ordered array of ancestors from root to the document itself, each with id and title. Useful for understanding document hierarchy and building navigation UI. Example output: [{ id: "...", title: "Parent" }, { id: "...", title: "Child" }]. Returns just the document itself if it has no parent.`,
    {
      document_id: z.string().uuid().describe('The UUID of the document to get the breadcrumb for.'),
    },
    async ({ document_id }) => {
      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();
        const breadcrumb: Array<{ id: string; title: string }> = [];
        let currentId: string | null = document_id;

        while (currentId) {
          const { data: docData, error } = await supabase
            .from('documents')
            .select('id, title, parent_id')
            .eq('id', currentId)
            .eq('user_id', userId) // Filter by current user
            .single();

          if (error || !docData) break;

          breadcrumb.unshift({ id: docData.id, title: docData.title });
          currentId = docData.parent_id as string | null;
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(breadcrumb, null, 2) }],
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
  // get_documents_stats - Get document statistics
  // =========================================================================
  server.tool(
    'get_documents_stats',
    `Get aggregate statistics about documents in the workspace. Returns: total document count, count of documents created in last 7 days, and the most recently modified document. Useful for dashboards, monitoring activity, or understanding workspace usage. Can be filtered to a specific project or show all projects. Related tools: list_documents (browse), get_task_stats (task metrics).`,
    {
      project_id: z.string().uuid().optional().describe('Filter statistics to a specific project. Omit for workspace-wide stats.'),
    },
    async ({ project_id }) => {
      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();

        // Total count
        let countQuery = supabase
          .from('documents')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId); // Filter by current user

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
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

}

/**
 * Helper: Get all descendant document IDs recursively (filtered by user)
 */
async function getAllDescendantIds(supabase: ReturnType<typeof getSupabaseClient>, documentId: string, userId: string): Promise<string[]> {
  const descendants: string[] = [];
  const queue: string[] = [documentId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;

    const { data, error } = await supabase
      .from('documents')
      .select('id')
      .eq('parent_id', currentId)
      .eq('user_id', userId); // Filter by current user

    if (error || !data) continue;

    for (const child of data) {
      descendants.push(child.id);
      queue.push(child.id);
    }
  }

  return descendants;
}
