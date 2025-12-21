import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getSupabaseClient } from '../services/supabase-client.js';

/**
 * Register all tab-related tools (tabs, groups, sections for document organization)
 */
export function registerTabTools(server: McpServer): void {
  // =========================================================================
  // list_tabs - List all tabs for a project
  // =========================================================================
  server.tool(
    'list_tabs',
    `List all tabs for a project. Tabs are the primary organizational structure in the project sidebar - they group related documents and content. Each tab has a name, optional icon/color, and position. Tabs can belong to tab groups for further organization. Returns tabs sorted by position. Use this to understand project structure before creating documents or sections. Related tools: create_tab, list_sections (content within tabs).`,
    {
      project_id: z.string().uuid().describe('The project UUID to list tabs for.'),
    },
    async ({ project_id }) => {
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from('document_tabs')
          .select('*')
          .eq('project_id', project_id)
          .order('position', { ascending: true });

        if (error) {
          return {
            content: [{ type: 'text', text: `Error listing tabs: ${error.message}` }],
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
  // create_tab - Create a new tab
  // =========================================================================
  server.tool(
    'create_tab',
    `Create a new tab in a project's sidebar. Tabs organize content hierarchically - after creating a tab, add sections to it, then documents within sections. Position is auto-assigned to the end. Can optionally be placed in a tab group for categorization. Returns the created tab with its ID. Typical workflow: create_tab -> create_section -> create_document. Related tools: list_tabs, create_section, update_tab.`,
    {
      project_id: z.string().uuid().describe('The project to add the tab to.'),
      name: z.string().min(1).max(100).describe('Tab display name shown in sidebar.'),
      icon: z.string().optional().describe('Icon for the tab (emoji like "📋" or icon name).'),
      color: z.string().optional().describe('Tab color (CSS color name or hex like "#FF5733").'),
      tab_group_id: z.string().uuid().optional().describe('Add to this tab group. Get IDs from list_tab_groups.'),
    },
    async ({ project_id, name, icon, color, tab_group_id }) => {
      try {
        const supabase = getSupabaseClient();

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
            content: [{ type: 'text', text: `Error creating tab: ${error.message}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Tab created successfully:\n${JSON.stringify(data, null, 2)}` }],
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
  // update_tab - Update a tab
  // =========================================================================
  server.tool(
    'update_tab',
    `Update a tab's display properties. Only provide fields you want to change. Use tab_group_id=null to remove from a group. Position changes require reorder_tabs. Returns the updated tab. Related tools: reorder_tabs (change order), delete_tab, list_tabs.`,
    {
      tab_id: z.string().uuid().describe('The tab UUID to update. Get from list_tabs.'),
      name: z.string().min(1).max(100).optional().describe('New display name.'),
      icon: z.string().optional().describe('New icon (emoji or icon name).'),
      color: z.string().optional().describe('New color.'),
      tab_group_id: z.string().uuid().nullable().optional().describe('Move to this group. Set null to remove from current group.'),
    },
    async ({ tab_id, name, icon, color, tab_group_id }) => {
      try {
        const supabase = getSupabaseClient();

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

        const { data, error } = await supabase
          .from('document_tabs')
          .update(updates)
          .eq('id', tab_id)
          .select()
          .single();

        if (error) {
          return {
            content: [{ type: 'text', text: `Error updating tab: ${error.message}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Tab updated successfully:\n${JSON.stringify(data, null, 2)}` }],
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
  // delete_tab - Delete a tab
  // =========================================================================
  server.tool(
    'delete_tab',
    `Delete a tab from a project. WARNING: This also removes all sections within the tab. Documents may become orphaned (not linked to any tab). Consider the impact on project organization before deleting. Default tabs cannot be deleted - change the default first using set_default_tab. Returns confirmation of deletion.`,
    {
      tab_id: z.string().uuid().describe('The tab UUID to delete. Get from list_tabs.'),
    },
    async ({ tab_id }) => {
      try {
        const supabase = getSupabaseClient();

        const { error } = await supabase
          .from('document_tabs')
          .delete()
          .eq('id', tab_id);

        if (error) {
          return {
            content: [{ type: 'text', text: `Error deleting tab: ${error.message}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Tab ${tab_id} deleted successfully.` }],
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
  // set_default_tab - Set a tab as the default
  // =========================================================================
  server.tool(
    'set_default_tab',
    `Set a tab as the default for a project. The default tab is shown when users first open the project. Only one tab can be default - this automatically unsets any previous default. The default tab cannot be deleted without first setting another as default. Related tools: list_tabs (see current is_default flags), create_tab.`,
    {
      tab_id: z.string().uuid().describe('The tab UUID to make default.'),
      project_id: z.string().uuid().describe('The project UUID (required to unset other defaults).'),
    },
    async ({ tab_id, project_id }) => {
      try {
        const supabase = getSupabaseClient();

        // First, unset any existing default
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
            content: [{ type: 'text', text: `Error setting default tab: ${error.message}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Tab set as default:\n${JSON.stringify(data, null, 2)}` }],
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
  // reorder_tabs - Reorder tabs
  // =========================================================================
  server.tool(
    'reorder_tabs',
    `Reorder tabs in the sidebar by providing the complete ordered list of tab IDs. Position 0 is at the top. All tabs to be reordered should be included in the array - missing tabs retain their position. Use list_tabs first to get current tab IDs and order. Returns success count.`,
    {
      tab_ids: z.array(z.string().uuid()).min(1).describe('Array of tab UUIDs in desired order. First = position 0 (top).'),
    },
    async ({ tab_ids }) => {
      try {
        const supabase = getSupabaseClient();

        // Update each tab with its new position
        for (let i = 0; i < tab_ids.length; i++) {
          const { error } = await supabase
            .from('document_tabs')
            .update({ position: i })
            .eq('id', tab_ids[i]);

          if (error) {
            return {
              content: [{ type: 'text', text: `Error reordering tab ${tab_ids[i]}: ${error.message}` }],
              isError: true,
            };
          }
        }

        return {
          content: [{ type: 'text', text: `Successfully reordered ${tab_ids.length} tabs.` }],
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
  // list_tab_groups - List all tab groups for a project
  // =========================================================================
  server.tool(
    'list_tab_groups',
    `List all tab groups for a project. Tab groups are containers that organize multiple tabs together in the sidebar - similar to folders. Groups can be collapsed to hide contained tabs. Returns groups sorted by position with id, name, color, is_collapsed, and position. Use this to understand project sidebar organization. Related tools: create_tab_group, update_tab (to assign tabs to groups).`,
    {
      project_id: z.string().uuid().describe('The project UUID to list tab groups for.'),
    },
    async ({ project_id }) => {
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from('document_tab_groups')
          .select('*')
          .eq('project_id', project_id)
          .order('position', { ascending: true });

        if (error) {
          return {
            content: [{ type: 'text', text: `Error listing tab groups: ${error.message}` }],
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
  // create_tab_group - Create a tab group
  // =========================================================================
  server.tool(
    'create_tab_group',
    `Create a new tab group in a project to organize tabs. Tab groups appear as collapsible sections in the sidebar. After creating a group, use update_tab with tab_group_id to add tabs to it. Position is auto-assigned to the end. Groups start expanded (is_collapsed=false). Related tools: list_tab_groups, update_tab_group, update_tab.`,
    {
      project_id: z.string().uuid().describe('The project to add the tab group to.'),
      name: z.string().min(1).max(100).describe('Group display name.'),
      color: z.string().optional().describe('Group header color.'),
    },
    async ({ project_id, name, color }) => {
      try {
        const supabase = getSupabaseClient();

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
            content: [{ type: 'text', text: `Error creating tab group: ${error.message}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Tab group created successfully:\n${JSON.stringify(data, null, 2)}` }],
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
  // update_tab_group - Update a tab group
  // =========================================================================
  server.tool(
    'update_tab_group',
    `Update a tab group's properties. Only provide fields you want to change. Set is_collapsed=true to collapse the group (hide its tabs in the sidebar UI). Returns the updated group. Related tools: delete_tab_group, list_tab_groups.`,
    {
      group_id: z.string().uuid().describe('The tab group UUID. Get from list_tab_groups.'),
      name: z.string().min(1).max(100).optional().describe('New display name.'),
      color: z.string().optional().describe('New header color.'),
      is_collapsed: z.boolean().optional().describe('Set true to collapse (hide contained tabs in UI).'),
    },
    async ({ group_id, name, color, is_collapsed }) => {
      try {
        const supabase = getSupabaseClient();

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

        const { data, error } = await supabase
          .from('document_tab_groups')
          .update(updates)
          .eq('id', group_id)
          .select()
          .single();

        if (error) {
          return {
            content: [{ type: 'text', text: `Error updating tab group: ${error.message}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Tab group updated successfully:\n${JSON.stringify(data, null, 2)}` }],
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
  // delete_tab_group - Delete a tab group
  // =========================================================================
  server.tool(
    'delete_tab_group',
    `Delete a tab group from a project. SAFE: Tabs that belong to this group are NOT deleted - they become ungrouped (tab_group_id set to null) and remain visible in the sidebar. Only the grouping is removed. Returns confirmation of deletion.`,
    {
      group_id: z.string().uuid().describe('The tab group UUID to delete. Get from list_tab_groups.'),
    },
    async ({ group_id }) => {
      try {
        const supabase = getSupabaseClient();

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
            content: [{ type: 'text', text: `Error deleting tab group: ${error.message}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Tab group ${group_id} deleted successfully.` }],
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
  // list_sections - List all sections for a tab
  // =========================================================================
  server.tool(
    'list_sections',
    `List all sections within a tab. Sections are subdivisions within a tab that group related documents - think of them as chapter headings. Each section has a title, optional icon/color, and can be collapsed. Documents are linked to sections for organization. Returns sections sorted by position. Use this to understand tab structure before adding documents. Related tools: create_section, list_tabs.`,
    {
      tab_id: z.string().uuid().describe('The tab UUID to list sections for. Get from list_tabs.'),
    },
    async ({ tab_id }) => {
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from('document_sections')
          .select('*')
          .eq('tab_id', tab_id)
          .order('position', { ascending: true });

        if (error) {
          return {
            content: [{ type: 'text', text: `Error listing sections: ${error.message}` }],
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
  // create_section - Create a section in a tab
  // =========================================================================
  server.tool(
    'create_section',
    `Create a new section within a tab to organize documents. Sections act as headings/dividers that group related documents. Position is auto-assigned to the end. Sections start expanded. After creating a section, you can link documents to it. Typical hierarchy: Project -> Tab -> Section -> Document. Related tools: list_sections, update_section, create_document.`,
    {
      tab_id: z.string().uuid().describe('The tab UUID to add the section to. Get from list_tabs.'),
      title: z.string().min(1).max(100).describe('Section heading text.'),
      icon: z.string().optional().describe('Section icon (emoji or icon name).'),
      color: z.string().optional().describe('Section header color.'),
    },
    async ({ tab_id, title, icon, color }) => {
      try {
        const supabase = getSupabaseClient();

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
            content: [{ type: 'text', text: `Error creating section: ${error.message}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Section created successfully:\n${JSON.stringify(data, null, 2)}` }],
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
  // update_section - Update a section
  // =========================================================================
  server.tool(
    'update_section',
    `Update a section's properties. Only provide fields you want to change. Set is_collapsed=true to collapse the section (hide documents under it in the UI). Returns the updated section. Related tools: delete_section, list_sections.`,
    {
      section_id: z.string().uuid().describe('The section UUID. Get from list_sections.'),
      title: z.string().min(1).max(100).optional().describe('New heading text.'),
      icon: z.string().optional().describe('New icon.'),
      color: z.string().optional().describe('New header color.'),
      is_collapsed: z.boolean().optional().describe('Set true to collapse (hide documents in UI).'),
    },
    async ({ section_id, title, icon, color, is_collapsed }) => {
      try {
        const supabase = getSupabaseClient();

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

        const { data, error } = await supabase
          .from('document_sections')
          .update(updates)
          .eq('id', section_id)
          .select()
          .single();

        if (error) {
          return {
            content: [{ type: 'text', text: `Error updating section: ${error.message}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Section updated successfully:\n${JSON.stringify(data, null, 2)}` }],
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
  // delete_section - Delete a section
  // =========================================================================
  server.tool(
    'delete_section',
    `Delete a section from a tab. Documents in the section may become orphaned (not linked to any section) but are not deleted. The section heading and organization is removed. Returns confirmation of deletion. Related tools: list_sections, create_section.`,
    {
      section_id: z.string().uuid().describe('The section UUID to delete. Get from list_sections.'),
    },
    async ({ section_id }) => {
      try {
        const supabase = getSupabaseClient();

        const { error } = await supabase
          .from('document_sections')
          .delete()
          .eq('id', section_id);

        if (error) {
          return {
            content: [{ type: 'text', text: `Error deleting section: ${error.message}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Section ${section_id} deleted successfully.` }],
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
