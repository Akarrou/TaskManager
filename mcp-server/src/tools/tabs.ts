import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getSupabaseClient } from '../services/supabase-client.js';
import { getCurrentUserId } from '../services/user-auth.js';
import { saveSnapshot } from '../services/snapshot.js';

/**
 * Check if user has access to a project (owner or member)
 */
async function userHasProjectAccess(supabase: ReturnType<typeof getSupabaseClient>, projectId: string, userId: string): Promise<boolean> {
  // Check if user is owner
  const { data: project } = await supabase
    .from('projects')
    .select('owner_id')
    .eq('id', projectId)
    .single();

  if (project?.owner_id === userId) return true;

  // Check if user is member
  const { data: membership } = await supabase
    .from('project_members')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .single();

  return !!membership;
}

/**
 * Check if user has access to a tab via project ownership/membership
 */
async function userHasTabAccess(supabase: ReturnType<typeof getSupabaseClient>, tabId: string, userId: string): Promise<boolean> {
  const { data: tab } = await supabase
    .from('document_tabs')
    .select('project_id')
    .eq('id', tabId)
    .single();

  if (!tab) return false;

  return userHasProjectAccess(supabase, tab.project_id, userId);
}

/**
 * Register all tab-related tools (tabs, groups, sections for document organization)
 */
export function registerTabTools(server: McpServer): void {
  // =========================================================================
  // list_tabs - List all tabs for a project
  // =========================================================================
  server.registerTool(
    'list_tabs',
    {
      description: `List all tabs for a project. Tabs are the primary organizational structure in the project sidebar - they group related documents and content. Each tab has a name, optional icon/color, and position. Tabs can belong to tab groups for further organization. Returns tabs sorted by position. Use this to understand project structure before creating documents or sections. Related tools: create_tab, list_sections (content within tabs).`,
      inputSchema: {
        project_id: z.string().uuid().describe('The project UUID to list tabs for.'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ project_id }) => {
      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();

        // Verify user has access to this project
        const hasAccess = await userHasProjectAccess(supabase, project_id, userId);
        if (!hasAccess) {
          return {
            content: [{ type: 'text', text: `Access denied: You do not have permission to access this project.` }],
            isError: true,
          };
        }

        const { data, error } = await supabase
          .from('document_tabs')
          .select('*')
          .eq('project_id', project_id)
          .order('position', { ascending: true });

        if (error) {
          return {
            content: [{ type: 'text', text: `Error listing tabs. Please try again.` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // create_tab - Create a new tab
  // =========================================================================
  server.registerTool(
    'create_tab',
    {
      description: `Create a new tab in a project's sidebar. Tabs organize content hierarchically - after creating a tab, add sections to it, then documents within sections. Position is auto-assigned to the end. Can optionally be placed in a tab group for categorization. Returns the created tab with its ID. Typical workflow: create_tab -> create_section -> create_document. Related tools: list_tabs, create_section, update_tab.`,
      inputSchema: {
        project_id: z.string().uuid().describe('The project to add the tab to.'),
        name: z.string().min(1).max(100).describe('Tab display name shown in sidebar.'),
        icon: z.string().optional().describe('Icon for the tab (emoji like "📋" or icon name).'),
        color: z.string().optional().describe('Tab color (CSS color name or hex like "#FF5733").'),
        tab_group_id: z.string().uuid().optional().describe('Add to this tab group. Get IDs from list_tab_groups.'),
      },
    },
    async ({ project_id, name, icon, color, tab_group_id }) => {
      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();

        // Verify user has access to this project
        const hasAccess = await userHasProjectAccess(supabase, project_id, userId);
        if (!hasAccess) {
          return {
            content: [{ type: 'text', text: `Access denied: You do not have permission to modify this project.` }],
            isError: true,
          };
        }

        // Get next position
        const { data: posData } = await supabase.rpc('get_next_tab_position', {
          p_project_id: project_id,
        });

        const position = posData ?? 0;

        const tabData: Record<string, unknown> = {
          project_id,
          name,
          position,
          is_default: false,
        };

        if (icon) tabData.icon = icon;
        if (color) tabData.color = color;
        if (tab_group_id) tabData.tab_group_id = tab_group_id;

        const { data, error } = await supabase
          .from('document_tabs')
          .insert(tabData)
          .select()
          .single();

        if (error) {
          return {
            content: [{ type: 'text', text: `Error creating tab. Please try again.` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Tab created successfully:\n${JSON.stringify(data, null, 2)}` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // update_tab - Update a tab
  // =========================================================================
  server.registerTool(
    'update_tab',
    {
      description: `Update a tab's display properties. Only provide fields you want to change. Use tab_group_id=null to remove from a group. Position changes require reorder_tabs. Returns the updated tab. Related tools: reorder_tabs (change order), delete_tab, list_tabs.`,
      inputSchema: {
        tab_id: z.string().uuid().describe('The tab UUID to update. Get from list_tabs.'),
        name: z.string().min(1).max(100).optional().describe('New display name.'),
        icon: z.string().optional().describe('New icon (emoji or icon name).'),
        color: z.string().optional().describe('New color.'),
        tab_group_id: z.string().uuid().nullable().optional().describe('Move to this group. Set null to remove from current group.'),
      },
      annotations: { idempotentHint: true },
    },
    async ({ tab_id, name, icon, color, tab_group_id }) => {
      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();

        // Verify user has access to this tab
        const hasAccess = await userHasTabAccess(supabase, tab_id, userId);
        if (!hasAccess) {
          return {
            content: [{ type: 'text', text: `Access denied: You do not have permission to modify this tab.` }],
            isError: true,
          };
        }

        const updates: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };

        if (name !== undefined) updates.name = name;
        if (icon !== undefined) updates.icon = icon;
        if (color !== undefined) updates.color = color;
        if (tab_group_id !== undefined) updates.tab_group_id = tab_group_id;

        if (Object.keys(updates).length === 1) {
          return {
            content: [{ type: 'text', text: 'No updates provided.' }],
            isError: true,
          };
        }

        // Snapshot before modification
        let snapshotToken = '';
        const { data: currentTab } = await supabase.from('document_tabs').select('*').eq('id', tab_id).single();
        if (currentTab) {
          const snapshot = await saveSnapshot({
            entityType: 'tab',
            entityId: tab_id,
            tableName: 'document_tabs',
            toolName: 'update_tab',
            operation: 'update',
            data: currentTab,
            userId,
          });
          snapshotToken = snapshot.token;
        }

        const { data, error } = await supabase
          .from('document_tabs')
          .update(updates)
          .eq('id', tab_id)
          .select()
          .single();

        if (error) {
          return {
            content: [{ type: 'text', text: `Error updating tab. Please try again.` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Tab updated (snapshot: ${snapshotToken}):\n${JSON.stringify(data, null, 2)}` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // delete_tab - Delete a tab
  // =========================================================================
  server.registerTool(
    'delete_tab',
    {
      description: `Delete a tab from a project. WARNING: This also removes all sections within the tab. Documents may become orphaned (not linked to any tab). Consider the impact on project organization before deleting. Default tabs cannot be deleted - change the default first using set_default_tab. Returns confirmation of deletion.`,
      inputSchema: {
        tab_id: z.string().uuid().describe('The tab UUID to delete. Get from list_tabs.'),
      },
      annotations: { destructiveHint: true },
    },
    async ({ tab_id }) => {
      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();

        // Verify user has access to this tab
        const hasAccess = await userHasTabAccess(supabase, tab_id, userId);
        if (!hasAccess) {
          return {
            content: [{ type: 'text', text: `Access denied: You do not have permission to delete this tab.` }],
            isError: true,
          };
        }

        // Snapshot before modification
        const snapshotTokens: string[] = [];
        const { data: currentTab } = await supabase.from('document_tabs').select('*').eq('id', tab_id).single();
        if (currentTab) {
          const snapshot = await saveSnapshot({
            entityType: 'tab',
            entityId: tab_id,
            tableName: 'document_tabs',
            toolName: 'delete_tab',
            operation: 'delete',
            data: currentTab,
            userId,
          });
          snapshotTokens.push(snapshot.token);
        }

        // Snapshot sections that will be cascade-deleted with the tab
        const { data: affectedSections } = await supabase
          .from('document_sections')
          .select('*')
          .eq('tab_id', tab_id);

        if (affectedSections) {
          for (const section of affectedSections) {
            const snapshot = await saveSnapshot({
              entityType: 'section',
              entityId: section.id,
              tableName: 'document_sections',
              toolName: 'delete_tab',
              operation: 'delete',
              data: section,
              userId,
            });
            snapshotTokens.push(snapshot.token);
          }
        }

        const { error } = await supabase
          .from('document_tabs')
          .delete()
          .eq('id', tab_id);

        if (error) {
          return {
            content: [{ type: 'text', text: `Error deleting tab. Please try again.` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Tab ${tab_id} deleted (snapshots: ${snapshotTokens.join(', ')}).` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // set_default_tab - Set a tab as the default
  // =========================================================================
  server.registerTool(
    'set_default_tab',
    {
      description: `Set a tab as the default for a project. The default tab is shown when users first open the project. Only one tab can be default - this automatically unsets any previous default. The default tab cannot be deleted without first setting another as default. Related tools: list_tabs (see current is_default flags), create_tab.`,
      inputSchema: {
        tab_id: z.string().uuid().describe('The tab UUID to make default.'),
        project_id: z.string().uuid().describe('The project UUID (required to unset other defaults).'),
      },
      annotations: { idempotentHint: true },
    },
    async ({ tab_id, project_id }) => {
      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();

        // Verify user has access to this project
        const hasAccess = await userHasProjectAccess(supabase, project_id, userId);
        if (!hasAccess) {
          return {
            content: [{ type: 'text', text: `Access denied: You do not have permission to modify this project.` }],
            isError: true,
          };
        }

        // Snapshot before modification (target tab + previous default tab)
        const snapshotTokens: string[] = [];
        const { data: currentTab } = await supabase.from('document_tabs').select('*').eq('id', tab_id).single();
        if (currentTab) {
          const snapshot = await saveSnapshot({
            entityType: 'tab',
            entityId: tab_id,
            tableName: 'document_tabs',
            toolName: 'set_default_tab',
            operation: 'update',
            data: currentTab,
            userId,
          });
          snapshotTokens.push(snapshot.token);
        }

        // Snapshot the previous default tab before unsetting it
        const { data: previousDefault } = await supabase
          .from('document_tabs')
          .select('*')
          .eq('project_id', project_id)
          .eq('is_default', true)
          .neq('id', tab_id)
          .maybeSingle();

        if (previousDefault) {
          const snapshot = await saveSnapshot({
            entityType: 'tab',
            entityId: previousDefault.id,
            tableName: 'document_tabs',
            toolName: 'set_default_tab',
            operation: 'update',
            data: previousDefault,
            userId,
          });
          snapshotTokens.push(snapshot.token);
        }

        // Unset any existing default
        await supabase
          .from('document_tabs')
          .update({ is_default: false })
          .eq('project_id', project_id)
          .eq('is_default', true);

        // Set the new default
        const { data, error } = await supabase
          .from('document_tabs')
          .update({ is_default: true })
          .eq('id', tab_id)
          .select()
          .single();

        if (error) {
          return {
            content: [{ type: 'text', text: `Error setting default tab. Please try again.` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Tab set as default (snapshots: ${snapshotTokens.join(', ')}):\n${JSON.stringify(data, null, 2)}` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // reorder_tabs - Reorder tabs
  // =========================================================================
  server.registerTool(
    'reorder_tabs',
    {
      description: `Reorder tabs in the sidebar by providing the complete ordered list of tab IDs. Position 0 is at the top. All tabs to be reordered should be included in the array - missing tabs retain their position. Use list_tabs first to get current tab IDs and order. Returns success count.`,
      inputSchema: {
        tab_ids: z.array(z.string().uuid()).min(1).describe('Array of tab UUIDs in desired order. First = position 0 (top).'),
      },
      annotations: { idempotentHint: true },
    },
    async ({ tab_ids }) => {
      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();

        // Verify user has access to at least the first tab (all should be in same project)
        if (tab_ids.length > 0) {
          const hasAccess = await userHasTabAccess(supabase, tab_ids[0], userId);
          if (!hasAccess) {
            return {
              content: [{ type: 'text', text: `Access denied: You do not have permission to modify these tabs.` }],
              isError: true,
            };
          }
        }

        // Snapshot before modification
        const tokens: string[] = [];
        const { data: currentTabs } = await supabase.from('document_tabs').select('*').in('id', tab_ids);
        if (currentTabs) {
          for (const tab of currentTabs) {
            const snapshot = await saveSnapshot({
              entityType: 'tab',
              entityId: tab.id,
              tableName: 'document_tabs',
              toolName: 'reorder_tabs',
              operation: 'update',
              data: tab,
              userId,
            });
            tokens.push(snapshot.token);
          }
        }

        // Update each tab with its new position
        for (let i = 0; i < tab_ids.length; i++) {
          const { error } = await supabase
            .from('document_tabs')
            .update({ position: i })
            .eq('id', tab_ids[i]);

          if (error) {
            return {
              content: [{ type: 'text', text: `Error reordering tab. Please try again.` }],
              isError: true,
            };
          }
        }

        return {
          content: [{ type: 'text', text: `Successfully reordered ${tab_ids.length} tabs (snapshots: ${tokens.join(', ')}).` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // list_tab_groups - List all tab groups for a project
  // =========================================================================
  server.registerTool(
    'list_tab_groups',
    {
      description: `List all tab groups for a project. Tab groups are containers that organize multiple tabs together in the sidebar - similar to folders. Groups can be collapsed to hide contained tabs. Returns groups sorted by position with id, name, color, is_collapsed, and position. Use this to understand project sidebar organization. Related tools: create_tab_group, update_tab (to assign tabs to groups).`,
      inputSchema: {
        project_id: z.string().uuid().describe('The project UUID to list tab groups for.'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ project_id }) => {
      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();

        // Verify user has access to this project
        const hasAccess = await userHasProjectAccess(supabase, project_id, userId);
        if (!hasAccess) {
          return {
            content: [{ type: 'text', text: `Access denied: You do not have permission to access this project.` }],
            isError: true,
          };
        }

        const { data, error } = await supabase
          .from('document_tab_groups')
          .select('*')
          .eq('project_id', project_id)
          .order('position', { ascending: true });

        if (error) {
          return {
            content: [{ type: 'text', text: `Error listing tab groups. Please try again.` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // create_tab_group - Create a tab group
  // =========================================================================
  server.registerTool(
    'create_tab_group',
    {
      description: `Create a new tab group in a project to organize tabs. Tab groups appear as collapsible sections in the sidebar. After creating a group, use update_tab with tab_group_id to add tabs to it. Position is auto-assigned to the end. Groups start expanded (is_collapsed=false). Related tools: list_tab_groups, update_tab_group, update_tab.`,
      inputSchema: {
        project_id: z.string().uuid().describe('The project to add the tab group to.'),
        name: z.string().min(1).max(100).describe('Group display name.'),
        color: z.string().optional().describe('Group header color.'),
      },
    },
    async ({ project_id, name, color }) => {
      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();

        // Verify user has access to this project
        const hasAccess = await userHasProjectAccess(supabase, project_id, userId);
        if (!hasAccess) {
          return {
            content: [{ type: 'text', text: `Access denied: You do not have permission to modify this project.` }],
            isError: true,
          };
        }

        // Get next position
        const { data: posData } = await supabase.rpc('get_next_tab_group_position', {
          p_project_id: project_id,
        });

        const position = posData ?? 0;

        const groupData: Record<string, unknown> = {
          project_id,
          name,
          position,
          is_collapsed: false,
        };

        if (color) groupData.color = color;

        const { data, error } = await supabase
          .from('document_tab_groups')
          .insert(groupData)
          .select()
          .single();

        if (error) {
          return {
            content: [{ type: 'text', text: `Error creating tab group. Please try again.` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Tab group created successfully:\n${JSON.stringify(data, null, 2)}` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // update_tab_group - Update a tab group
  // =========================================================================
  server.registerTool(
    'update_tab_group',
    {
      description: `Update a tab group's properties. Only provide fields you want to change. Set is_collapsed=true to collapse the group (hide its tabs in the sidebar UI). Returns the updated group. Related tools: delete_tab_group, list_tab_groups.`,
      inputSchema: {
        group_id: z.string().uuid().describe('The tab group UUID. Get from list_tab_groups.'),
        name: z.string().min(1).max(100).optional().describe('New display name.'),
        color: z.string().optional().describe('New header color.'),
        is_collapsed: z.boolean().optional().describe('Set true to collapse (hide contained tabs in UI).'),
      },
      annotations: { idempotentHint: true },
    },
    async ({ group_id, name, color, is_collapsed }) => {
      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();

        // Get group's project and verify access
        const { data: group } = await supabase
          .from('document_tab_groups')
          .select('project_id')
          .eq('id', group_id)
          .single();

        if (!group) {
          return {
            content: [{ type: 'text', text: `Tab group not found: ${group_id}` }],
            isError: true,
          };
        }

        const hasAccess = await userHasProjectAccess(supabase, group.project_id, userId);
        if (!hasAccess) {
          return {
            content: [{ type: 'text', text: `Access denied: You do not have permission to modify this tab group.` }],
            isError: true,
          };
        }

        const updates: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };

        if (name !== undefined) updates.name = name;
        if (color !== undefined) updates.color = color;
        if (is_collapsed !== undefined) updates.is_collapsed = is_collapsed;

        if (Object.keys(updates).length === 1) {
          return {
            content: [{ type: 'text', text: 'No updates provided.' }],
            isError: true,
          };
        }

        // Snapshot before modification
        let snapshotToken = '';
        const { data: currentGroup } = await supabase.from('document_tab_groups').select('*').eq('id', group_id).single();
        if (currentGroup) {
          const snapshot = await saveSnapshot({
            entityType: 'tab_group',
            entityId: group_id,
            tableName: 'document_tab_groups',
            toolName: 'update_tab_group',
            operation: 'update',
            data: currentGroup,
            userId,
          });
          snapshotToken = snapshot.token;
        }

        const { data, error } = await supabase
          .from('document_tab_groups')
          .update(updates)
          .eq('id', group_id)
          .select()
          .single();

        if (error) {
          return {
            content: [{ type: 'text', text: `Error updating tab group. Please try again.` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Tab group updated (snapshot: ${snapshotToken}):\n${JSON.stringify(data, null, 2)}` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // delete_tab_group - Delete a tab group
  // =========================================================================
  server.registerTool(
    'delete_tab_group',
    {
      description: `Delete a tab group from a project. SAFE: Tabs that belong to this group are NOT deleted - they become ungrouped (tab_group_id set to null) and remain visible in the sidebar. Only the grouping is removed. Returns confirmation of deletion.`,
      inputSchema: {
        group_id: z.string().uuid().describe('The tab group UUID to delete. Get from list_tab_groups.'),
      },
      annotations: { destructiveHint: true },
    },
    async ({ group_id }) => {
      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();

        // Get group's project and verify access
        const { data: group } = await supabase
          .from('document_tab_groups')
          .select('project_id')
          .eq('id', group_id)
          .single();

        if (!group) {
          return {
            content: [{ type: 'text', text: `Tab group not found: ${group_id}` }],
            isError: true,
          };
        }

        const hasAccess = await userHasProjectAccess(supabase, group.project_id, userId);
        if (!hasAccess) {
          return {
            content: [{ type: 'text', text: `Access denied: You do not have permission to delete this tab group.` }],
            isError: true,
          };
        }

        // Snapshot before modification
        const snapshotTokens: string[] = [];
        const { data: currentGroup } = await supabase.from('document_tab_groups').select('*').eq('id', group_id).single();
        if (currentGroup) {
          const snapshot = await saveSnapshot({
            entityType: 'tab_group',
            entityId: group_id,
            tableName: 'document_tab_groups',
            toolName: 'delete_tab_group',
            operation: 'delete',
            data: currentGroup,
            userId,
          });
          snapshotTokens.push(snapshot.token);
        }

        // Snapshot affected tabs before ungrouping them
        const { data: affectedTabs } = await supabase
          .from('document_tabs')
          .select('*')
          .eq('tab_group_id', group_id);

        if (affectedTabs) {
          for (const tab of affectedTabs) {
            const snapshot = await saveSnapshot({
              entityType: 'tab',
              entityId: tab.id,
              tableName: 'document_tabs',
              toolName: 'delete_tab_group',
              operation: 'update',
              data: tab,
              userId,
            });
            snapshotTokens.push(snapshot.token);
          }
        }

        // First, ungroup all tabs in this group
        await supabase
          .from('document_tabs')
          .update({ tab_group_id: null })
          .eq('tab_group_id', group_id);

        // Then delete the group
        const { error } = await supabase
          .from('document_tab_groups')
          .delete()
          .eq('id', group_id);

        if (error) {
          return {
            content: [{ type: 'text', text: `Error deleting tab group. Please try again.` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Tab group ${group_id} deleted (snapshots: ${snapshotTokens.join(', ')}).` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // list_sections - List all sections for a tab
  // =========================================================================
  server.registerTool(
    'list_sections',
    {
      description: `List all sections within a tab. Sections are subdivisions within a tab that group related documents - think of them as chapter headings. Each section has a title, optional icon/color, and can be collapsed. Documents are linked to sections for organization. Returns sections sorted by position. Use this to understand tab structure before adding documents. Related tools: create_section, list_tabs.`,
      inputSchema: {
        tab_id: z.string().uuid().describe('The tab UUID to list sections for. Get from list_tabs.'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ tab_id }) => {
      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();

        // Verify user has access to this tab
        const hasAccess = await userHasTabAccess(supabase, tab_id, userId);
        if (!hasAccess) {
          return {
            content: [{ type: 'text', text: `Access denied: You do not have permission to access this tab.` }],
            isError: true,
          };
        }

        const { data, error } = await supabase
          .from('document_sections')
          .select('*')
          .eq('tab_id', tab_id)
          .order('position', { ascending: true });

        if (error) {
          return {
            content: [{ type: 'text', text: `Error listing sections. Please try again.` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // create_section - Create a section in a tab
  // =========================================================================
  server.registerTool(
    'create_section',
    {
      description: `Create a new section within a tab to organize documents. Sections act as headings/dividers that group related documents. Position is auto-assigned to the end. Sections start expanded. After creating a section, you can link documents to it. Typical hierarchy: Project -> Tab -> Section -> Document. Related tools: list_sections, update_section, create_document.`,
      inputSchema: {
        tab_id: z.string().uuid().describe('The tab UUID to add the section to. Get from list_tabs.'),
        title: z.string().min(1).max(100).describe('Section heading text.'),
        icon: z.string().optional().describe('Section icon (emoji or icon name).'),
        color: z.string().optional().describe('Section header color.'),
      },
    },
    async ({ tab_id, title, icon, color }) => {
      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();

        // Verify user has access to this tab
        const hasAccess = await userHasTabAccess(supabase, tab_id, userId);
        if (!hasAccess) {
          return {
            content: [{ type: 'text', text: `Access denied: You do not have permission to modify this tab.` }],
            isError: true,
          };
        }

        // Get next position
        const { data: posData } = await supabase.rpc('get_next_section_position', {
          p_tab_id: tab_id,
        });

        const position = posData ?? 0;

        const sectionData: Record<string, unknown> = {
          tab_id,
          title,
          position,
          is_collapsed: false,
        };

        if (icon) sectionData.icon = icon;
        if (color) sectionData.color = color;

        const { data, error } = await supabase
          .from('document_sections')
          .insert(sectionData)
          .select()
          .single();

        if (error) {
          return {
            content: [{ type: 'text', text: `Error creating section. Please try again.` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Section created successfully:\n${JSON.stringify(data, null, 2)}` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // update_section - Update a section
  // =========================================================================
  server.registerTool(
    'update_section',
    {
      description: `Update a section's properties. Only provide fields you want to change. Set is_collapsed=true to collapse the section (hide documents under it in the UI). Returns the updated section. Related tools: delete_section, list_sections.`,
      inputSchema: {
        section_id: z.string().uuid().describe('The section UUID. Get from list_sections.'),
        title: z.string().min(1).max(100).optional().describe('New heading text.'),
        icon: z.string().optional().describe('New icon.'),
        color: z.string().optional().describe('New header color.'),
        is_collapsed: z.boolean().optional().describe('Set true to collapse (hide documents in UI).'),
      },
      annotations: { idempotentHint: true },
    },
    async ({ section_id, title, icon, color, is_collapsed }) => {
      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();

        // Get section's tab and verify access
        const { data: section } = await supabase
          .from('document_sections')
          .select('tab_id')
          .eq('id', section_id)
          .single();

        if (!section) {
          return {
            content: [{ type: 'text', text: `Section not found: ${section_id}` }],
            isError: true,
          };
        }

        const hasAccess = await userHasTabAccess(supabase, section.tab_id, userId);
        if (!hasAccess) {
          return {
            content: [{ type: 'text', text: `Access denied: You do not have permission to modify this section.` }],
            isError: true,
          };
        }

        const updates: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };

        if (title !== undefined) updates.title = title;
        if (icon !== undefined) updates.icon = icon;
        if (color !== undefined) updates.color = color;
        if (is_collapsed !== undefined) updates.is_collapsed = is_collapsed;

        if (Object.keys(updates).length === 1) {
          return {
            content: [{ type: 'text', text: 'No updates provided.' }],
            isError: true,
          };
        }

        // Snapshot before modification
        let snapshotToken = '';
        const { data: currentSection } = await supabase.from('document_sections').select('*').eq('id', section_id).single();
        if (currentSection) {
          const snapshot = await saveSnapshot({
            entityType: 'section',
            entityId: section_id,
            tableName: 'document_sections',
            toolName: 'update_section',
            operation: 'update',
            data: currentSection,
            userId,
          });
          snapshotToken = snapshot.token;
        }

        const { data, error } = await supabase
          .from('document_sections')
          .update(updates)
          .eq('id', section_id)
          .select()
          .single();

        if (error) {
          return {
            content: [{ type: 'text', text: `Error updating section. Please try again.` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Section updated (snapshot: ${snapshotToken}):\n${JSON.stringify(data, null, 2)}` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // delete_section - Delete a section
  // =========================================================================
  server.registerTool(
    'delete_section',
    {
      description: `Delete a section from a tab. Documents in the section may become orphaned (not linked to any section) but are not deleted. The section heading and organization is removed. Returns confirmation of deletion. Related tools: list_sections, create_section.`,
      inputSchema: {
        section_id: z.string().uuid().describe('The section UUID to delete. Get from list_sections.'),
      },
      annotations: { destructiveHint: true },
    },
    async ({ section_id }) => {
      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();

        // Get section's tab and verify access
        const { data: section } = await supabase
          .from('document_sections')
          .select('tab_id')
          .eq('id', section_id)
          .single();

        if (!section) {
          return {
            content: [{ type: 'text', text: `Section not found: ${section_id}` }],
            isError: true,
          };
        }

        const hasAccess = await userHasTabAccess(supabase, section.tab_id, userId);
        if (!hasAccess) {
          return {
            content: [{ type: 'text', text: `Access denied: You do not have permission to delete this section.` }],
            isError: true,
          };
        }

        // Snapshot before modification
        let snapshotToken = '';
        const { data: currentSection } = await supabase.from('document_sections').select('*').eq('id', section_id).single();
        if (currentSection) {
          const snapshot = await saveSnapshot({
            entityType: 'section',
            entityId: section_id,
            tableName: 'document_sections',
            toolName: 'delete_section',
            operation: 'delete',
            data: currentSection,
            userId,
          });
          snapshotToken = snapshot.token;
        }

        const { error } = await supabase
          .from('document_sections')
          .delete()
          .eq('id', section_id);

        if (error) {
          return {
            content: [{ type: 'text', text: `Error deleting section. Please try again.` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Section ${section_id} deleted (snapshot: ${snapshotToken}).` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
          isError: true,
        };
      }
    }
  );
}
