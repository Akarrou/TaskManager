import { z } from 'zod';
import { getSupabaseClient } from '../services/supabase-client.js';
/**
 * Register all project-related tools
 */
export function registerProjectTools(server) {
    // =========================================================================
    // list_projects - List all projects
    // =========================================================================
    server.tool('list_projects', 'List all projects. Can filter to include/exclude archived projects.', {
        include_archived: z.boolean().optional().default(false).describe('Include archived projects in the results'),
    }, async ({ include_archived }) => {
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
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // get_project - Get a single project by ID
    // =========================================================================
    server.tool('get_project', 'Get detailed information about a specific project by its ID.', {
        project_id: z.string().uuid().describe('The UUID of the project'),
    }, async ({ project_id }) => {
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
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // create_project - Create a new project
    // =========================================================================
    server.tool('create_project', 'Create a new project with a name and optional description.', {
        name: z.string().min(1).max(255).describe('The name of the project'),
        description: z.string().optional().describe('Optional description of the project'),
    }, async ({ name, description }) => {
        try {
            const supabase = getSupabaseClient();
            const projectData = {
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
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // update_project - Update an existing project
    // =========================================================================
    server.tool('update_project', 'Update an existing project\'s name or description.', {
        project_id: z.string().uuid().describe('The UUID of the project to update'),
        name: z.string().min(1).max(255).optional().describe('New name for the project'),
        description: z.string().optional().describe('New description for the project'),
    }, async ({ project_id, name, description }) => {
        try {
            const supabase = getSupabaseClient();
            const updates = {};
            if (name !== undefined)
                updates.name = name;
            if (description !== undefined)
                updates.description = description;
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
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // archive_project - Archive a project
    // =========================================================================
    server.tool('archive_project', 'Archive a project. Archived projects can be restored later.', {
        project_id: z.string().uuid().describe('The UUID of the project to archive'),
    }, async ({ project_id }) => {
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
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // restore_project - Restore an archived project
    // =========================================================================
    server.tool('restore_project', 'Restore a previously archived project.', {
        project_id: z.string().uuid().describe('The UUID of the project to restore'),
    }, async ({ project_id }) => {
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
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // list_project_members - List members of a project
    // =========================================================================
    server.tool('list_project_members', 'List all members of a project with their roles.', {
        project_id: z.string().uuid().describe('The UUID of the project'),
    }, async ({ project_id }) => {
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
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
}
//# sourceMappingURL=projects.js.map