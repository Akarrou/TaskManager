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
    'List all tabs for a project.',
    {
      project_id: z.string().uuid().describe('The UUID of the project'),
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
    'Create a new tab in a project.',
    {
      project_id: z.string().uuid().describe('The UUID of the project'),
      name: z.string().min(1).max(100).describe('Tab name'),
      icon: z.string().optional().describe('Tab icon (emoji or icon name)'),
      color: z.string().optional().describe('Tab color'),
      tab_group_id: z.string().uuid().optional().describe('Optional tab group to add the tab to'),
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
    'Update a tab\'s properties.',
    {
      tab_id: z.string().uuid().describe('The UUID of the tab'),
      name: z.string().min(1).max(100).optional().describe('New tab name'),
      icon: z.string().optional().describe('New tab icon'),
      color: z.string().optional().describe('New tab color'),
      tab_group_id: z.string().uuid().nullable().optional().describe('Tab group ID (null to remove from group)'),
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
    'Delete a tab from a project.',
    {
      tab_id: z.string().uuid().describe('The UUID of the tab to delete'),
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
    'Set a tab as the default tab for a project.',
    {
      tab_id: z.string().uuid().describe('The UUID of the tab to set as default'),
      project_id: z.string().uuid().describe('The UUID of the project'),
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
    'Reorder tabs by providing an ordered array of tab IDs.',
    {
      tab_ids: z.array(z.string().uuid()).min(1).describe('Ordered array of tab IDs'),
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
    'List all tab groups for a project.',
    {
      project_id: z.string().uuid().describe('The UUID of the project'),
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
    'Create a new tab group in a project.',
    {
      project_id: z.string().uuid().describe('The UUID of the project'),
      name: z.string().min(1).max(100).describe('Group name'),
      color: z.string().optional().describe('Group color'),
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
    'Update a tab group\'s properties.',
    {
      group_id: z.string().uuid().describe('The UUID of the tab group'),
      name: z.string().min(1).max(100).optional().describe('New group name'),
      color: z.string().optional().describe('New group color'),
      is_collapsed: z.boolean().optional().describe('Collapsed state'),
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
    'Delete a tab group. Tabs in the group will be ungrouped, not deleted.',
    {
      group_id: z.string().uuid().describe('The UUID of the tab group to delete'),
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
    'List all sections for a tab.',
    {
      tab_id: z.string().uuid().describe('The UUID of the tab'),
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
    'Create a new section in a tab.',
    {
      tab_id: z.string().uuid().describe('The UUID of the tab'),
      title: z.string().min(1).max(100).describe('Section title'),
      icon: z.string().optional().describe('Section icon'),
      color: z.string().optional().describe('Section color'),
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
    'Update a section\'s properties.',
    {
      section_id: z.string().uuid().describe('The UUID of the section'),
      title: z.string().min(1).max(100).optional().describe('New section title'),
      icon: z.string().optional().describe('New section icon'),
      color: z.string().optional().describe('New section color'),
      is_collapsed: z.boolean().optional().describe('Collapsed state'),
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
    'Delete a section from a tab.',
    {
      section_id: z.string().uuid().describe('The UUID of the section to delete'),
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
