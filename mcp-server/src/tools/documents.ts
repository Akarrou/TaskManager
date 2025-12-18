import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getSupabaseClient } from '../services/supabase-client.js';

/**
 * Register all document-related tools
 */
export function registerDocumentTools(server: McpServer): void {
  // =========================================================================
  // list_documents - List all documents
  // =========================================================================
  server.tool(
    'list_documents',
    'List all documents. Can filter by project or parent document for hierarchical navigation.',
    {
      project_id: z.string().uuid().optional().describe('Filter documents by project ID'),
      parent_id: z.string().uuid().optional().describe('Filter documents by parent document ID (for hierarchy)'),
      limit: z.number().min(1).max(100).optional().default(50).describe('Maximum number of documents to return'),
    },
    async ({ project_id, parent_id, limit }) => {
      try {
        const supabase = getSupabaseClient();
        let query = supabase
          .from('documents')
          .select('id, title, parent_id, project_id, database_id, database_row_id, created_at, updated_at')
          .order('updated_at', { ascending: false })
          .limit(limit);

        if (project_id) {
          query = query.eq('project_id', project_id);
        }

        if (parent_id) {
          query = query.eq('parent_id', parent_id);
        }

        const { data, error } = await query;

        if (error) {
          return {
            content: [{ type: 'text', text: `Error listing documents: ${error.message}` }],
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
  // get_document - Get a document with its content
  // =========================================================================
  server.tool(
    'get_document',
    'Get a document by ID including its full content (TipTap JSON).',
    {
      document_id: z.string().uuid().describe('The UUID of the document'),
    },
    async ({ document_id }) => {
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
    'Create a new document with optional TipTap content.',
    {
      title: z.string().min(1).max(500).describe('The title of the document'),
      project_id: z.string().uuid().optional().describe('Optional project ID to associate the document with'),
      parent_id: z.string().uuid().optional().describe('Optional parent document ID for hierarchy'),
      content: z.any().optional().describe('Optional TipTap JSON content (default: empty document)'),
    },
    async ({ title, project_id, parent_id, content }) => {
      try {
        const supabase = getSupabaseClient();

        const documentData: Record<string, unknown> = {
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
    'Update a document\'s title or content.',
    {
      document_id: z.string().uuid().describe('The UUID of the document to update'),
      title: z.string().min(1).max(500).optional().describe('New title for the document'),
      content: z.any().optional().describe('New TipTap JSON content'),
    },
    async ({ document_id, title, content }) => {
      try {
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
    'Delete a document. Use cascade=true to also delete child documents and associated databases.',
    {
      document_id: z.string().uuid().describe('The UUID of the document to delete'),
      cascade: z.boolean().optional().default(false).describe('If true, delete all child documents and databases'),
    },
    async ({ document_id, cascade }) => {
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
        } else {
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
    'Search documents by title using a text query.',
    {
      query: z.string().min(1).describe('Search query to match against document titles'),
      project_id: z.string().uuid().optional().describe('Optional project ID to filter search'),
      limit: z.number().min(1).max(50).optional().default(20).describe('Maximum number of results'),
    },
    async ({ query, project_id, limit }) => {
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
 * Helper: Get all descendant document IDs recursively
 */
async function getAllDescendantIds(supabase: ReturnType<typeof getSupabaseClient>, documentId: string): Promise<string[]> {
  const descendants: string[] = [];
  const queue: string[] = [documentId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;

    const { data, error } = await supabase
      .from('documents')
      .select('id')
      .eq('parent_id', currentId);

    if (error || !data) continue;

    for (const child of data) {
      descendants.push(child.id);
      queue.push(child.id);
    }
  }

  return descendants;
}
