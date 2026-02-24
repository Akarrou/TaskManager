import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getSupabaseClient } from '../services/supabase-client.js';
import { logger } from '../services/logger.js';

/**
 * Register MCP Resources
 * Resources expose read-only data that can be accessed by the model
 */
export function registerResources(server: McpServer): void {
  // =========================================================================
  // kodo://projects - List all projects (static resource)
  // =========================================================================
  server.registerResource(
    'projects',
    'kodo://projects',
    { title: 'Projects', description: 'List of all projects accessible to the current user', mimeType: 'application/json' },
    async (uri) => {
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from('projects')
          .select('id, name, description, created_at, updated_at')
          .order('updated_at', { ascending: false });

        if (error) {
          logger.error({ uri: uri.href, error: error.message }, 'Resource fetch failed');
          return {
            contents: [{
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify({ error: error.message }),
            }],
          };
        }

        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(data, null, 2),
          }],
        };
      } catch (err) {
        logger.error({ uri: uri.href, error: (err as Error).message }, 'Resource error');
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ error: (err as Error).message }),
          }],
        };
      }
    }
  );

  // =========================================================================
  // kodo://project/{id} - Get a specific project (template resource)
  // =========================================================================
  server.registerResource(
    'project',
    new ResourceTemplate('kodo://project/{id}', { list: undefined }),
    { title: 'Project Details', description: 'Details of a specific project including members and stats', mimeType: 'application/json' },
    async (uri, variables) => {
      const id = variables.id as string;
      try {
        const supabase = getSupabaseClient();

        // Get project details
        const { data: project, error: projectError } = await supabase
          .from('projects')
          .select('*')
          .eq('id', id)
          .single();

        if (projectError || !project) {
          return {
            contents: [{
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify({ error: 'Project not found' }),
            }],
          };
        }

        // Get member count
        const { count: memberCount } = await supabase
          .from('project_members')
          .select('*', { count: 'exact', head: true })
          .eq('project_id', id);

        // Get document count
        const { count: documentCount } = await supabase
          .from('documents')
          .select('*', { count: 'exact', head: true })
          .eq('project_id', id);

        const result = {
          ...project,
          stats: {
            members: memberCount || 0,
            documents: documentCount || 0,
          },
        };

        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(result, null, 2),
          }],
        };
      } catch (err) {
        logger.error({ uri: uri.href, error: (err as Error).message }, 'Resource error');
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ error: (err as Error).message }),
          }],
        };
      }
    }
  );

  // =========================================================================
  // kodo://project/{id}/stats - Get project statistics (template resource)
  // =========================================================================
  server.registerResource(
    'project-stats',
    new ResourceTemplate('kodo://project/{id}/stats', { list: undefined }),
    { title: 'Project Statistics', description: 'Detailed statistics for a project including task counts by status', mimeType: 'application/json' },
    async (uri, variables) => {
      const id = variables.id as string;
      try {
        const supabase = getSupabaseClient();

        // Get document count
        const { count: documentCount } = await supabase
          .from('documents')
          .select('*', { count: 'exact', head: true })
          .eq('project_id', id);

        // Get member count
        const { count: memberCount } = await supabase
          .from('project_members')
          .select('*', { count: 'exact', head: true })
          .eq('project_id', id);

        // Get databases
        const { data: databases } = await supabase
          .from('document_databases')
          .select('database_id, name, config')
          .eq('document_id', id);

        // Get recent activity (last 7 days)
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);

        const { count: recentDocuments } = await supabase
          .from('documents')
          .select('*', { count: 'exact', head: true })
          .eq('project_id', id)
          .gte('updated_at', weekAgo.toISOString());

        const stats = {
          project_id: id,
          documents: {
            total: documentCount || 0,
            recent_7_days: recentDocuments || 0,
          },
          members: memberCount || 0,
          databases: databases?.length || 0,
          generated_at: new Date().toISOString(),
        };

        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(stats, null, 2),
          }],
        };
      } catch (err) {
        logger.error({ uri: uri.href, error: (err as Error).message }, 'Resource error');
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ error: (err as Error).message }),
          }],
        };
      }
    }
  );

  // =========================================================================
  // kodo://database/{id}/schema - Get database schema (template resource)
  // =========================================================================
  server.registerResource(
    'database-schema',
    new ResourceTemplate('kodo://database/{id}/schema', { list: undefined }),
    { title: 'Database Schema', description: 'Schema definition of a database including columns and their types', mimeType: 'application/json' },
    async (uri, variables) => {
      const id = variables.id as string;
      try {
        const supabase = getSupabaseClient();

        const { data: dbMeta, error } = await supabase
          .from('document_databases')
          .select('*')
          .eq('database_id', id)
          .single();

        if (error || !dbMeta) {
          return {
            contents: [{
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify({ error: 'Database not found' }),
            }],
          };
        }

        const config = dbMeta.config as {
          name?: string;
          type?: string;
          columns?: Array<{
            id: string;
            name: string;
            type: string;
            visible?: boolean;
            options?: Array<{ label: string; color?: string }>;
          }>;
        };

        const schema = {
          database_id: dbMeta.database_id,
          name: dbMeta.name || config.name,
          type: config.type || 'generic',
          table_name: dbMeta.table_name,
          columns: (config.columns || []).map((col) => ({
            id: col.id,
            name: col.name,
            type: col.type,
            visible: col.visible !== false,
            options: col.options,
          })),
          created_at: dbMeta.created_at,
          updated_at: dbMeta.updated_at,
        };

        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(schema, null, 2),
          }],
        };
      } catch (err) {
        logger.error({ uri: uri.href, error: (err as Error).message }, 'Resource error');
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ error: (err as Error).message }),
          }],
        };
      }
    }
  );

  // =========================================================================
  // kodo://server/info - Server information (static resource)
  // =========================================================================
  server.registerResource(
    'server-info',
    'kodo://server/info',
    { title: 'Server Info', description: 'Information about the Kodo MCP server including version and capabilities', mimeType: 'application/json' },
    async (uri) => {
      const info = {
        name: 'kodo-mcp',
        version: '0.3.1',
        description: 'MCP Server for Kodo - Task and document management',
        capabilities: {
          tools: 96,
          resources: 5,
          prompts: 13,
        },
        features: [
          'Projects management',
          'Rich-text documents',
          'Notion-like databases',
          'Tasks with Kanban views',
          'Calendar/Event management',
          'Google Calendar sync',
          'Spreadsheets',
          'Comments',
          'Tabs and sections',
          'File storage',
        ],
        generated_at: new Date().toISOString(),
      };

      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(info, null, 2),
        }],
      };
    }
  );

  logger.info('Registered 5 MCP resources');
}
