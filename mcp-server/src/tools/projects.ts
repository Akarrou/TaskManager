import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getSupabaseClient } from '../services/supabase-client.js';

/**
 * Register all project-related tools
 */
export function registerProjectTools(server: McpServer): void {
  // =========================================================================
  // list_projects - List all projects
  // =========================================================================
  server.tool(
    'list_projects',
    `List all projects in the Kodo workspace. Projects are the top-level containers that organize all work - each project contains documents, databases, tasks, tabs, and members. Use this as the starting point to understand what work exists. Returns an array of project objects with id, name, description, archived status, and timestamps. By default excludes archived projects. Related tools: get_project (for details), create_project (to add new).`,
    {
      include_archived: z.boolean().optional().default(false).describe('Set to true to include archived projects. Archived projects are hidden by default but can be restored.'),
    },
    async ({ include_archived }) => {
      try {
        const supabase = getSupabaseClient();
        let query = supabase.from('projects').select('*').order('created_at', { ascending: false });

        if (!include_archived) {
          query = query.eq('archived', false);
        }

        const { data, error } = await query;

        if (error) {
          return {
            content: [{ type: 'text', text: `Error listing projects: ${error.message}` }],
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
  // get_project - Get a single project by ID
  // =========================================================================
  server.tool(
    'get_project',
    `Get detailed information about a specific project. Use this after list_projects to get full details including description and metadata. Returns complete project object with all fields. Useful for checking project status before performing operations. Related tools: list_project_members (to see who has access), list_tabs (to see sidebar structure), list_documents (to see content).`,
    {
      project_id: z.string().uuid().describe('The UUID of the project. Get this from list_projects or from a previous operation.'),
    },
    async ({ project_id }) => {
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .eq('id', project_id)
          .single();

        if (error) {
          return {
            content: [{ type: 'text', text: `Error getting project: ${error.message}` }],
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
  // create_project - Create a new project
  // =========================================================================
  server.tool(
    'create_project',
    `Create a new project in the Kodo workspace. Projects are the primary organizational unit - they contain documents, databases, tasks, and have their own member access controls. After creating a project, typically you would create tabs (for sidebar organization), then documents or databases within those tabs. Returns the created project with its generated UUID. Related tools: create_tab (organize sidebar), create_document (add content).`,
    {
      name: z.string().min(1).max(255).describe('The display name for the project. Should be descriptive and unique enough to identify the project purpose.'),
      description: z.string().optional().describe('A longer description explaining the project purpose, goals, or scope. Shown in project details.'),
    },
    async ({ name, description }) => {
      try {
        const supabase = getSupabaseClient();

        const projectData: Record<string, unknown> = {
          name,
          archived: false,
        };

        if (description) {
          projectData.description = description;
        }

        const { data, error } = await supabase
          .from('projects')
          .insert(projectData)
          .select()
          .single();

        if (error) {
          return {
            content: [{ type: 'text', text: `Error creating project: ${error.message}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Project created successfully:\n${JSON.stringify(data, null, 2)}` }],
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
  // update_project - Update an existing project
  // =========================================================================
  server.tool(
    'update_project',
    `Update a project's name or description. Use this to rename projects or update their description. Only provide the fields you want to change - unchanged fields keep their current values. Returns the updated project object. Note: This does not change project membership or archive status - use specific tools for those operations.`,
    {
      project_id: z.string().uuid().describe('The UUID of the project to update. Get this from list_projects.'),
      name: z.string().min(1).max(255).optional().describe('New display name for the project. Leave undefined to keep current name.'),
      description: z.string().optional().describe('New description for the project. Leave undefined to keep current description.'),
    },
    async ({ project_id, name, description }) => {
      try {
        const supabase = getSupabaseClient();

        const updates: Record<string, unknown> = {};
        if (name !== undefined) updates.name = name;
        if (description !== undefined) updates.description = description;

        if (Object.keys(updates).length === 0) {
          return {
            content: [{ type: 'text', text: 'No updates provided. Please specify at least one field to update.' }],
            isError: true,
          };
        }

        const { data, error } = await supabase
          .from('projects')
          .update(updates)
          .eq('id', project_id)
          .select()
          .single();

        if (error) {
          return {
            content: [{ type: 'text', text: `Error updating project: ${error.message}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Project updated successfully:\n${JSON.stringify(data, null, 2)}` }],
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
  // archive_project - Archive a project
  // =========================================================================
  server.tool(
    'archive_project',
    `Archive a project to hide it from the default project list. Archived projects are not deleted - they retain all their data and can be restored with restore_project. Use archiving for completed projects or ones no longer actively used. Archived projects are still accessible via list_projects with include_archived=true. This is a soft-delete operation - use delete_project for permanent removal.`,
    {
      project_id: z.string().uuid().describe('The UUID of the project to archive. The project will be hidden from default listings but not deleted.'),
    },
    async ({ project_id }) => {
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from('projects')
          .update({ archived: true })
          .eq('id', project_id)
          .select()
          .single();

        if (error) {
          return {
            content: [{ type: 'text', text: `Error archiving project: ${error.message}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Project archived successfully:\n${JSON.stringify(data, null, 2)}` }],
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
  // restore_project - Restore an archived project
  // =========================================================================
  server.tool(
    'restore_project',
    `Restore a previously archived project back to active status. The project will appear again in the default project list. All project data (documents, databases, tasks, members) remains intact during archiving and is immediately available after restoration. Use list_projects with include_archived=true to find archived projects to restore.`,
    {
      project_id: z.string().uuid().describe('The UUID of the archived project to restore. Find this using list_projects with include_archived=true.'),
    },
    async ({ project_id }) => {
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from('projects')
          .update({ archived: false })
          .eq('id', project_id)
          .select()
          .single();

        if (error) {
          return {
            content: [{ type: 'text', text: `Error restoring project: ${error.message}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Project restored successfully:\n${JSON.stringify(data, null, 2)}` }],
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
  // list_project_members - List members of a project
  // =========================================================================
  server.tool(
    'list_project_members',
    `List all members who have access to a project. Each member has a role (owner, admin, editor, viewer) that determines their permissions. Returns member details including user_id, role, and when they were invited. Use this to understand who can access and modify project content. The project owner has full control and cannot be removed.`,
    {
      project_id: z.string().uuid().describe('The UUID of the project to list members for.'),
    },
    async ({ project_id }) => {
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from('project_members')
          .select('*')
          .eq('project_id', project_id)
          .order('invited_at', { ascending: true });

        if (error) {
          return {
            content: [{ type: 'text', text: `Error listing project members: ${error.message}` }],
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
  // delete_project - Delete a project and all its related data
  // =========================================================================
  server.tool(
    'delete_project',
    `DESTRUCTIVE: Permanently delete a project and ALL its related data including documents, databases, database rows, tasks, tabs, sections, comments, and file attachments. This action CANNOT be undone. For temporary removal, use archive_project instead. The confirm parameter must be explicitly set to true as a safety measure. Returns confirmation of what was deleted. WARNING: Use with extreme caution.`,
    {
      project_id: z.string().uuid().describe('The UUID of the project to permanently delete. All related data will be destroyed.'),
      confirm: z.boolean().describe('REQUIRED: Must be explicitly set to true to proceed with deletion. This is a safety measure to prevent accidental data loss.'),
    },
    async ({ project_id, confirm }) => {
      if (!confirm) {
        return {
          content: [{ type: 'text', text: 'Deletion not confirmed. Set confirm=true to proceed with deletion.' }],
          isError: true,
        };
      }

      try {
        const supabase = getSupabaseClient();

        // First, get the project to make sure it exists
        const { data: project, error: projectError } = await supabase
          .from('projects')
          .select('id, name')
          .eq('id', project_id)
          .single();

        if (projectError) {
          return {
            content: [{ type: 'text', text: `Error finding project: ${projectError.message}` }],
            isError: true,
          };
        }

        // Delete project members
        await supabase
          .from('project_members')
          .delete()
          .eq('project_id', project_id);

        // Delete project invitations
        await supabase
          .from('project_invitations')
          .delete()
          .eq('project_id', project_id);

        // Delete document tabs, groups, sections for this project
        await supabase
          .from('document_tabs')
          .delete()
          .eq('project_id', project_id);

        await supabase
          .from('document_tab_groups')
          .delete()
          .eq('project_id', project_id);

        // Delete documents (this will cascade to related data via DB triggers/constraints)
        await supabase
          .from('documents')
          .delete()
          .eq('project_id', project_id);

        // Finally delete the project itself
        const { error: deleteError } = await supabase
          .from('projects')
          .delete()
          .eq('id', project_id);

        if (deleteError) {
          return {
            content: [{ type: 'text', text: `Error deleting project: ${deleteError.message}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Project "${project.name}" (${project_id}) has been permanently deleted along with all its related data.` }],
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
