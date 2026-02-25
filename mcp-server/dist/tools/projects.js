import { z } from 'zod';
import { getSupabaseClient } from '../services/supabase-client.js';
import { getCurrentUserId } from '../services/user-auth.js';
import { saveSnapshot } from '../services/snapshot.js';
/**
 * Register all project-related tools
 */
export function registerProjectTools(server) {
    // =========================================================================
    // list_projects - List all projects
    // =========================================================================
    server.registerTool('list_projects', {
        description: `List all projects in the Kodo workspace. Projects are the top-level containers that organize all work - each project contains documents, databases, tasks, tabs, and members. Use this as the starting point to understand what work exists. Returns an array of project objects with id, name, description, archived status, and timestamps. By default excludes archived projects. Related tools: get_project (for details), create_project (to add new).`,
        inputSchema: {
            include_archived: z.boolean().optional().default(false).describe('Set to true to include archived projects. Archived projects are hidden by default but can be restored.'),
        },
        annotations: { readOnlyHint: true },
    }, async ({ include_archived }) => {
        try {
            const userId = getCurrentUserId();
            const supabase = getSupabaseClient();
            // Get projects where user is owner
            let ownerQuery = supabase
                .from('projects')
                .select('*')
                .eq('owner_id', userId)
                .is('deleted_at', null)
                .order('created_at', { ascending: false });
            if (!include_archived) {
                ownerQuery = ownerQuery.eq('archived', false);
            }
            const { data: ownerProjects, error: ownerError } = await ownerQuery;
            if (ownerError) {
                return {
                    content: [{ type: 'text', text: `Error listing projects. Please try again.` }],
                    isError: true,
                };
            }
            // Get projects where user is a member (but not owner)
            const { data: memberProjects, error: memberError } = await supabase
                .from('project_members')
                .select('project_id, projects(*)')
                .eq('user_id', userId);
            if (memberError) {
                // If member query fails, just return owner projects
                return {
                    content: [{ type: 'text', text: JSON.stringify(ownerProjects, null, 2) }],
                };
            }
            // Combine and deduplicate
            const ownerIds = new Set((ownerProjects || []).map(p => p.id));
            const additionalProjects = (memberProjects || [])
                .filter(m => {
                const proj = m.projects;
                return proj && !ownerIds.has(proj.id);
            })
                .map(m => m.projects);
            const data = [...(ownerProjects || []), ...additionalProjects];
            return {
                content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
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
    // get_project - Get a single project by ID
    // =========================================================================
    server.registerTool('get_project', {
        description: `Get detailed information about a specific project. Use this after list_projects to get full details including description and metadata. Returns complete project object with all fields. Useful for checking project status before performing operations. Related tools: list_project_members (to see who has access), list_tabs (to see sidebar structure), list_documents (to see content).`,
        inputSchema: {
            project_id: z.string().uuid().describe('The UUID of the project. Get this from list_projects or from a previous operation.'),
        },
        annotations: { readOnlyHint: true },
    }, async ({ project_id }) => {
        try {
            const supabase = getSupabaseClient();
            const { data, error } = await supabase
                .from('projects')
                .select('*')
                .eq('id', project_id)
                .is('deleted_at', null)
                .single();
            if (error) {
                return {
                    content: [{ type: 'text', text: `Error getting project. Please try again.` }],
                    isError: true,
                };
            }
            return {
                content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
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
    // create_project - Create a new project
    // =========================================================================
    server.registerTool('create_project', {
        description: `Create a new project in the Kodo workspace. Projects are the primary organizational unit - they contain documents, databases, tasks, and have their own member access controls. After creating a project, typically you would create tabs (for sidebar organization), then documents or databases within those tabs. Returns the created project with its generated UUID. Related tools: create_tab (organize sidebar), create_document (add content).`,
        inputSchema: {
            name: z.string().min(1).max(255).describe('The display name for the project. Should be descriptive and unique enough to identify the project purpose.'),
            description: z.string().optional().describe('A longer description explaining the project purpose, goals, or scope. Shown in project details.'),
        },
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
                    content: [{ type: 'text', text: `Error creating project. Please try again.` }],
                    isError: true,
                };
            }
            return {
                content: [{ type: 'text', text: `Project created successfully:\n${JSON.stringify(data, null, 2)}` }],
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
    // update_project - Update an existing project
    // =========================================================================
    server.registerTool('update_project', {
        description: `Update a project's name or description. Use this to rename projects or update their description. Only provide the fields you want to change - unchanged fields keep their current values. Returns the updated project object. Note: This does not change project membership or archive status - use specific tools for those operations.`,
        inputSchema: {
            project_id: z.string().uuid().describe('The UUID of the project to update. Get this from list_projects.'),
            name: z.string().min(1).max(255).optional().describe('New display name for the project. Leave undefined to keep current name.'),
            description: z.string().optional().describe('New description for the project. Leave undefined to keep current description.'),
        },
        annotations: { idempotentHint: true },
    }, async ({ project_id, name, description }) => {
        try {
            const userId = getCurrentUserId();
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
            // Snapshot before modification
            const { data: currentProject } = await supabase
                .from('projects')
                .select('*')
                .eq('id', project_id)
                .single();
            let snapshotToken = '';
            if (currentProject) {
                const snapshot = await saveSnapshot({
                    entityType: 'project',
                    entityId: project_id,
                    tableName: 'projects',
                    toolName: 'update_project',
                    operation: 'update',
                    data: currentProject,
                    userId,
                });
                snapshotToken = snapshot.token;
            }
            const { data, error } = await supabase
                .from('projects')
                .update(updates)
                .eq('id', project_id)
                .select()
                .single();
            if (error) {
                return {
                    content: [{ type: 'text', text: `Error updating project. Please try again.` }],
                    isError: true,
                };
            }
            return {
                content: [{ type: 'text', text: `Project updated (snapshot: ${snapshotToken}):\n${JSON.stringify(data, null, 2)}` }],
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
    // archive_project - Archive a project
    // =========================================================================
    server.registerTool('archive_project', {
        description: `Archive a project to hide it from the default project list. Archived projects are not deleted - they retain all their data and can be restored with restore_project. Use archiving for completed projects or ones no longer actively used. Archived projects are still accessible via list_projects with include_archived=true. This is a soft-delete operation - use delete_project for permanent removal.`,
        inputSchema: {
            project_id: z.string().uuid().describe('The UUID of the project to archive. The project will be hidden from default listings but not deleted.'),
        },
        annotations: { idempotentHint: true },
    }, async ({ project_id }) => {
        try {
            const userId = getCurrentUserId();
            const supabase = getSupabaseClient();
            // Snapshot before archiving
            const { data: currentProject } = await supabase
                .from('projects')
                .select('*')
                .eq('id', project_id)
                .single();
            let snapshotToken = '';
            if (currentProject) {
                const snapshot = await saveSnapshot({
                    entityType: 'project',
                    entityId: project_id,
                    tableName: 'projects',
                    toolName: 'archive_project',
                    operation: 'update',
                    data: currentProject,
                    userId,
                });
                snapshotToken = snapshot.token;
            }
            const { data, error } = await supabase
                .from('projects')
                .update({ archived: true })
                .eq('id', project_id)
                .select()
                .single();
            if (error) {
                return {
                    content: [{ type: 'text', text: `Error archiving project. Please try again.` }],
                    isError: true,
                };
            }
            return {
                content: [{ type: 'text', text: `Project archived (snapshot: ${snapshotToken}):\n${JSON.stringify(data, null, 2)}` }],
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
    // restore_project - Restore an archived project
    // =========================================================================
    server.registerTool('restore_project', {
        description: `Restore a previously archived project back to active status. The project will appear again in the default project list. All project data (documents, databases, tasks, members) remains intact during archiving and is immediately available after restoration. Use list_projects with include_archived=true to find archived projects to restore.`,
        inputSchema: {
            project_id: z.string().uuid().describe('The UUID of the archived project to restore. Find this using list_projects with include_archived=true.'),
        },
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
                    content: [{ type: 'text', text: `Error restoring project. Please try again.` }],
                    isError: true,
                };
            }
            return {
                content: [{ type: 'text', text: `Project restored successfully:\n${JSON.stringify(data, null, 2)}` }],
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
    // list_project_members - List members of a project
    // =========================================================================
    server.registerTool('list_project_members', {
        description: `List all members who have access to a project. Each member has a role (owner, admin, editor, viewer) that determines their permissions. Returns member details including user_id, role, and when they were invited. Use this to understand who can access and modify project content. The project owner has full control and cannot be removed.`,
        inputSchema: {
            project_id: z.string().uuid().describe('The UUID of the project to list members for.'),
        },
        annotations: { readOnlyHint: true },
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
                    content: [{ type: 'text', text: `Error listing project members. Please try again.` }],
                    isError: true,
                };
            }
            return {
                content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
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
    // delete_project - Soft delete a project (move to trash)
    // =========================================================================
    server.registerTool('delete_project', {
        description: `Move a project to the trash (soft delete). The project is marked as deleted but can be restored within 30 days using restore_from_trash. Child documents remain intact but are inaccessible while the project is in the trash. On restore, everything reappears. For temporary hiding without deletion, use archive_project instead. A snapshot is taken before deletion for additional recovery.`,
        inputSchema: {
            project_id: z.string().uuid().describe('The UUID of the project to move to trash.'),
        },
        annotations: { destructiveHint: true },
    }, async ({ project_id }) => {
        try {
            const userId = getCurrentUserId();
            const supabase = getSupabaseClient();
            // Get the project info
            const { data: project, error: projectError } = await supabase
                .from('projects')
                .select('*')
                .eq('id', project_id)
                .single();
            if (projectError || !project) {
                return {
                    content: [{ type: 'text', text: `Project not found: ${project_id}` }],
                    isError: true,
                };
            }
            // Snapshot before soft delete
            let snapshotToken = '';
            const snapshot = await saveSnapshot({
                entityType: 'project',
                entityId: project_id,
                tableName: 'projects',
                toolName: 'delete_project',
                operation: 'soft_delete',
                data: project,
                userId,
            });
            snapshotToken = snapshot.token;
            const now = new Date().toISOString();
            // Soft delete: set deleted_at
            const { error: updateError } = await supabase
                .from('projects')
                .update({ deleted_at: now })
                .eq('id', project_id);
            if (updateError) {
                return {
                    content: [{ type: 'text', text: `Error soft-deleting project. Please try again.` }],
                    isError: true,
                };
            }
            // Insert into trash_items
            await supabase
                .from('trash_items')
                .insert({
                item_type: 'project',
                item_id: project_id,
                item_table: 'projects',
                display_name: project.name || 'Untitled project',
                parent_info: null,
                user_id: userId,
                deleted_at: now,
            });
            return {
                content: [{ type: 'text', text: `Project "${project.name}" moved to trash (snapshot: ${snapshotToken}). Use restore_from_trash to recover it.` }],
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
//# sourceMappingURL=projects.js.map