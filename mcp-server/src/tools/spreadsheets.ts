import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getSupabaseClient } from '../services/supabase-client.js';

/**
 * Register all spreadsheet-related tools (Excel-like spreadsheets embedded in documents)
 */
export function registerSpreadsheetTools(server: McpServer): void {
  // =========================================================================
  // list_spreadsheets - List all spreadsheets
  // =========================================================================
  server.tool(
    'list_spreadsheets',
    'List all spreadsheets, optionally filtered by document.',
    {
      document_id: z.string().uuid().optional().describe('Filter spreadsheets by document ID'),
    },
    async ({ document_id }) => {
      try {
        const supabase = getSupabaseClient();
        let query = supabase
          .from('document_spreadsheets')
          .select('*')
          .order('created_at', { ascending: false });

        if (document_id) {
          query = query.eq('document_id', document_id);
        }

        const { data, error } = await query;

        if (error) {
          return {
            content: [{ type: 'text', text: `Error listing spreadsheets: ${error.message}` }],
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
  // get_spreadsheet - Get a spreadsheet with its configuration
  // =========================================================================
  server.tool(
    'get_spreadsheet',
    'Get a spreadsheet by ID including its configuration.',
    {
      spreadsheet_id: z.string().uuid().describe('The UUID of the spreadsheet'),
    },
    async ({ spreadsheet_id }) => {
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from('document_spreadsheets')
          .select('*')
          .eq('spreadsheet_id', spreadsheet_id)
          .single();

        if (error) {
          return {
            content: [{ type: 'text', text: `Error getting spreadsheet: ${error.message}` }],
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
  // create_spreadsheet - Create a new spreadsheet
  // =========================================================================
  server.tool(
    'create_spreadsheet',
    'Create a new Excel-like spreadsheet.',
    {
      document_id: z.string().uuid().describe('The parent document ID'),
      name: z.string().min(1).max(255).optional().default('Spreadsheet').describe('Spreadsheet name'),
      rows: z.number().min(1).max(1000).optional().default(100).describe('Initial number of rows'),
      columns: z.number().min(1).max(26).optional().default(10).describe('Initial number of columns'),
    },
    async ({ document_id, name, rows, columns }) => {
      try {
        const supabase = getSupabaseClient();

        const spreadsheetId = crypto.randomUUID();
        const tableName = `spreadsheet_${spreadsheetId.replace(/-/g, '_')}_cells`;

        const config = {
          name,
          sheets: [
            {
              id: 'sheet1',
              name: 'Sheet 1',
              rowCount: rows,
              columnCount: columns,
              frozenRowCount: 0,
              frozenColumnCount: 0,
            },
          ],
          activeSheet: 'sheet1',
        };

        // Create spreadsheet metadata
        const { data, error } = await supabase
          .from('document_spreadsheets')
          .insert({
            spreadsheet_id: spreadsheetId,
            document_id,
            table_name: tableName,
            config,
          })
          .select()
          .single();

        if (error) {
          return {
            content: [{ type: 'text', text: `Error creating spreadsheet: ${error.message}` }],
            isError: true,
          };
        }

        // Create the cells table via RPC
        const { error: tableError } = await supabase.rpc('create_spreadsheet_table', {
          p_spreadsheet_id: spreadsheetId,
        });

        if (tableError) {
          // Rollback metadata
          await supabase.from('document_spreadsheets').delete().eq('spreadsheet_id', spreadsheetId);
          return {
            content: [{ type: 'text', text: `Error creating cells table: ${tableError.message}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Spreadsheet created successfully:\n${JSON.stringify(data, null, 2)}` }],
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
  // update_spreadsheet - Update spreadsheet configuration
  // =========================================================================
  server.tool(
    'update_spreadsheet',
    'Update a spreadsheet\'s configuration.',
    {
      spreadsheet_id: z.string().uuid().describe('The UUID of the spreadsheet'),
      config: z.record(z.unknown()).describe('Configuration updates (merged with existing)'),
    },
    async ({ spreadsheet_id, config }) => {
      try {
        const supabase = getSupabaseClient();

        // Get current config
        const { data: current, error: getError } = await supabase
          .from('document_spreadsheets')
          .select('config')
          .eq('spreadsheet_id', spreadsheet_id)
          .single();

        if (getError || !current) {
          return {
            content: [{ type: 'text', text: `Spreadsheet not found: ${spreadsheet_id}` }],
            isError: true,
          };
        }

        // Merge configs
        const mergedConfig = { ...current.config, ...config };

        const { data, error } = await supabase
          .from('document_spreadsheets')
          .update({
            config: mergedConfig,
            updated_at: new Date().toISOString(),
          })
          .eq('spreadsheet_id', spreadsheet_id)
          .select()
          .single();

        if (error) {
          return {
            content: [{ type: 'text', text: `Error updating spreadsheet: ${error.message}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Spreadsheet updated successfully:\n${JSON.stringify(data, null, 2)}` }],
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
  // delete_spreadsheet - Delete a spreadsheet
  // =========================================================================
  server.tool(
    'delete_spreadsheet',
    'Delete a spreadsheet and all its cell data.',
    {
      spreadsheet_id: z.string().uuid().describe('The UUID of the spreadsheet to delete'),
      confirm: z.boolean().describe('Must be true to confirm deletion'),
    },
    async ({ spreadsheet_id, confirm }) => {
      if (!confirm) {
        return {
          content: [{ type: 'text', text: 'Deletion not confirmed. Set confirm=true to proceed.' }],
          isError: true,
        };
      }

      try {
        const supabase = getSupabaseClient();

        // Try cascade delete RPC
        const { error: rpcError } = await supabase.rpc('delete_spreadsheet_cascade', {
          p_spreadsheet_id: spreadsheet_id,
        });

        if (rpcError) {
          // Fallback: just delete metadata
          const { error } = await supabase
            .from('document_spreadsheets')
            .delete()
            .eq('spreadsheet_id', spreadsheet_id);

          if (error) {
            return {
              content: [{ type: 'text', text: `Error deleting spreadsheet: ${error.message}` }],
              isError: true,
            };
          }
        }

        return {
          content: [{ type: 'text', text: `Spreadsheet ${spreadsheet_id} deleted successfully.` }],
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
  // get_cells - Get cells from a spreadsheet
  // =========================================================================
  server.tool(
    'get_cells',
    'Get cells from a spreadsheet for a given range.',
    {
      spreadsheet_id: z.string().uuid().describe('The UUID of the spreadsheet'),
      sheet_id: z.string().optional().default('sheet1').describe('Sheet ID'),
      start_row: z.number().min(0).optional().default(0).describe('Starting row (0-indexed)'),
      start_col: z.number().min(0).optional().default(0).describe('Starting column (0-indexed)'),
      end_row: z.number().min(0).optional().default(99).describe('Ending row (inclusive)'),
      end_col: z.number().min(0).optional().default(9).describe('Ending column (inclusive)'),
    },
    async ({ spreadsheet_id, sheet_id, start_row, start_col, end_row, end_col }) => {
      try {
        const supabase = getSupabaseClient();

        // Get spreadsheet to find table name
        const { data: spreadsheet, error: ssError } = await supabase
          .from('document_spreadsheets')
          .select('table_name')
          .eq('spreadsheet_id', spreadsheet_id)
          .single();

        if (ssError || !spreadsheet) {
          return {
            content: [{ type: 'text', text: `Spreadsheet not found: ${spreadsheet_id}` }],
            isError: true,
          };
        }

        // Try RPC first
        const { data, error } = await supabase.rpc('get_spreadsheet_cells', {
          p_spreadsheet_id: spreadsheet_id,
          p_sheet_id: sheet_id,
          p_start_row: start_row,
          p_start_col: start_col,
          p_end_row: end_row,
          p_end_col: end_col,
        });

        if (error) {
          return {
            content: [{ type: 'text', text: `Error getting cells: ${error.message}` }],
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
  // update_cell - Update a single cell
  // =========================================================================
  server.tool(
    'update_cell',
    'Update a single cell in a spreadsheet.',
    {
      spreadsheet_id: z.string().uuid().describe('The UUID of the spreadsheet'),
      sheet_id: z.string().optional().default('sheet1').describe('Sheet ID'),
      row: z.number().min(0).describe('Row index (0-indexed)'),
      col: z.number().min(0).describe('Column index (0-indexed)'),
      value: z.unknown().describe('Cell value (string, number, or formula)'),
    },
    async ({ spreadsheet_id, sheet_id, row, col, value }) => {
      try {
        const supabase = getSupabaseClient();

        const { data: spreadsheet, error: ssError } = await supabase
          .from('document_spreadsheets')
          .select('table_name')
          .eq('spreadsheet_id', spreadsheet_id)
          .single();

        if (ssError || !spreadsheet) {
          return {
            content: [{ type: 'text', text: `Spreadsheet not found: ${spreadsheet_id}` }],
            isError: true,
          };
        }

        const tableName = spreadsheet.table_name;

        // Upsert cell
        const { error } = await supabase
          .from(tableName)
          .upsert({
            spreadsheet_id,
            sheet_id,
            row,
            col,
            value: typeof value === 'string' && value.startsWith('=') ? null : value,
            formula: typeof value === 'string' && value.startsWith('=') ? value : null,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'spreadsheet_id,sheet_id,row,col',
          });

        if (error) {
          return {
            content: [{ type: 'text', text: `Error updating cell: ${error.message}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Cell (${row}, ${col}) updated to: ${JSON.stringify(value)}` }],
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
  // update_cells_batch - Update multiple cells at once
  // =========================================================================
  server.tool(
    'update_cells_batch',
    'Update multiple cells in a spreadsheet at once.',
    {
      spreadsheet_id: z.string().uuid().describe('The UUID of the spreadsheet'),
      sheet_id: z.string().optional().default('sheet1').describe('Sheet ID'),
      cells: z.array(z.object({
        row: z.number().min(0).describe('Row index'),
        col: z.number().min(0).describe('Column index'),
        value: z.unknown().describe('Cell value'),
      })).min(1).describe('Array of cells to update'),
    },
    async ({ spreadsheet_id, sheet_id, cells }) => {
      try {
        const supabase = getSupabaseClient();

        // Use batch update RPC
        const updates = cells.map(cell => ({
          spreadsheet_id,
          sheet_id,
          row: cell.row,
          col: cell.col,
          value: typeof cell.value === 'string' && cell.value.startsWith('=') ? null : cell.value,
          formula: typeof cell.value === 'string' && cell.value.startsWith('=') ? cell.value : null,
        }));

        const { error } = await supabase.rpc('batch_update_spreadsheet_cells', {
          p_updates: updates,
        });

        if (error) {
          return {
            content: [{ type: 'text', text: `Error updating cells: ${error.message}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Successfully updated ${cells.length} cells.` }],
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
  // add_sheet - Add a new sheet to a spreadsheet
  // =========================================================================
  server.tool(
    'add_sheet',
    'Add a new sheet to a spreadsheet.',
    {
      spreadsheet_id: z.string().uuid().describe('The UUID of the spreadsheet'),
      name: z.string().min(1).max(100).describe('Sheet name'),
      rows: z.number().min(1).max(1000).optional().default(100).describe('Number of rows'),
      columns: z.number().min(1).max(26).optional().default(10).describe('Number of columns'),
    },
    async ({ spreadsheet_id, name, rows, columns }) => {
      try {
        const supabase = getSupabaseClient();

        // Get current config
        const { data: spreadsheet, error: ssError } = await supabase
          .from('document_spreadsheets')
          .select('config')
          .eq('spreadsheet_id', spreadsheet_id)
          .single();

        if (ssError || !spreadsheet) {
          return {
            content: [{ type: 'text', text: `Spreadsheet not found: ${spreadsheet_id}` }],
            isError: true,
          };
        }

        const config = spreadsheet.config as { sheets: Array<Record<string, unknown>> };
        const sheets = config.sheets || [];

        // Generate new sheet ID
        const newSheetId = `sheet${sheets.length + 1}`;

        sheets.push({
          id: newSheetId,
          name,
          rowCount: rows,
          columnCount: columns,
          frozenRowCount: 0,
          frozenColumnCount: 0,
        });

        const { error } = await supabase
          .from('document_spreadsheets')
          .update({
            config: { ...config, sheets },
            updated_at: new Date().toISOString(),
          })
          .eq('spreadsheet_id', spreadsheet_id);

        if (error) {
          return {
            content: [{ type: 'text', text: `Error adding sheet: ${error.message}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Sheet "${name}" added successfully with ID: ${newSheetId}` }],
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
  // rename_sheet - Rename a sheet
  // =========================================================================
  server.tool(
    'rename_sheet',
    'Rename a sheet in a spreadsheet.',
    {
      spreadsheet_id: z.string().uuid().describe('The UUID of the spreadsheet'),
      sheet_id: z.string().describe('The sheet ID to rename'),
      name: z.string().min(1).max(100).describe('New sheet name'),
    },
    async ({ spreadsheet_id, sheet_id, name }) => {
      try {
        const supabase = getSupabaseClient();

        const { data: spreadsheet, error: ssError } = await supabase
          .from('document_spreadsheets')
          .select('config')
          .eq('spreadsheet_id', spreadsheet_id)
          .single();

        if (ssError || !spreadsheet) {
          return {
            content: [{ type: 'text', text: `Spreadsheet not found: ${spreadsheet_id}` }],
            isError: true,
          };
        }

        const config = spreadsheet.config as { sheets: Array<{ id: string; name: string }> };
        const sheets = config.sheets || [];

        const sheetIndex = sheets.findIndex(s => s.id === sheet_id);
        if (sheetIndex === -1) {
          return {
            content: [{ type: 'text', text: `Sheet not found: ${sheet_id}` }],
            isError: true,
          };
        }

        sheets[sheetIndex].name = name;

        const { error } = await supabase
          .from('document_spreadsheets')
          .update({
            config: { ...config, sheets },
            updated_at: new Date().toISOString(),
          })
          .eq('spreadsheet_id', spreadsheet_id);

        if (error) {
          return {
            content: [{ type: 'text', text: `Error renaming sheet: ${error.message}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Sheet renamed to "${name}" successfully.` }],
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
  // delete_sheet - Delete a sheet
  // =========================================================================
  server.tool(
    'delete_sheet',
    'Delete a sheet from a spreadsheet.',
    {
      spreadsheet_id: z.string().uuid().describe('The UUID of the spreadsheet'),
      sheet_id: z.string().describe('The sheet ID to delete'),
    },
    async ({ spreadsheet_id, sheet_id }) => {
      try {
        const supabase = getSupabaseClient();

        const { data: spreadsheet, error: ssError } = await supabase
          .from('document_spreadsheets')
          .select('config, table_name')
          .eq('spreadsheet_id', spreadsheet_id)
          .single();

        if (ssError || !spreadsheet) {
          return {
            content: [{ type: 'text', text: `Spreadsheet not found: ${spreadsheet_id}` }],
            isError: true,
          };
        }

        const config = spreadsheet.config as { sheets: Array<{ id: string; name: string }>; activeSheet?: string };
        const sheets = config.sheets || [];

        if (sheets.length <= 1) {
          return {
            content: [{ type: 'text', text: 'Cannot delete the last sheet. A spreadsheet must have at least one sheet.' }],
            isError: true,
          };
        }

        const sheetIndex = sheets.findIndex(s => s.id === sheet_id);
        if (sheetIndex === -1) {
          return {
            content: [{ type: 'text', text: `Sheet not found: ${sheet_id}` }],
            isError: true,
          };
        }

        const deletedSheet = sheets.splice(sheetIndex, 1)[0];

        // If active sheet was deleted, set first remaining sheet as active
        if (config.activeSheet === sheet_id) {
          config.activeSheet = sheets[0].id;
        }

        // Delete cells for this sheet
        const tableName = spreadsheet.table_name;
        await supabase
          .from(tableName)
          .delete()
          .eq('sheet_id', sheet_id);

        // Update config
        const { error } = await supabase
          .from('document_spreadsheets')
          .update({
            config: { ...config, sheets },
            updated_at: new Date().toISOString(),
          })
          .eq('spreadsheet_id', spreadsheet_id);

        if (error) {
          return {
            content: [{ type: 'text', text: `Error deleting sheet: ${error.message}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Sheet "${deletedSheet.name}" deleted successfully.` }],
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
  // clear_range - Clear a range of cells
  // =========================================================================
  server.tool(
    'clear_range',
    'Clear a range of cells in a spreadsheet.',
    {
      spreadsheet_id: z.string().uuid().describe('The UUID of the spreadsheet'),
      sheet_id: z.string().optional().default('sheet1').describe('Sheet ID'),
      start_row: z.number().min(0).describe('Starting row (0-indexed)'),
      start_col: z.number().min(0).describe('Starting column (0-indexed)'),
      end_row: z.number().min(0).describe('Ending row (inclusive)'),
      end_col: z.number().min(0).describe('Ending column (inclusive)'),
    },
    async ({ spreadsheet_id, sheet_id, start_row, start_col, end_row, end_col }) => {
      try {
        const supabase = getSupabaseClient();

        // Try RPC first
        const { data, error } = await supabase.rpc('clear_spreadsheet_range', {
          p_spreadsheet_id: spreadsheet_id,
          p_sheet_id: sheet_id,
          p_start_row: start_row,
          p_start_col: start_col,
          p_end_row: end_row,
          p_end_col: end_col,
        });

        if (error) {
          return {
            content: [{ type: 'text', text: `Error clearing range: ${error.message}` }],
            isError: true,
          };
        }

        const clearedCount = data || 0;

        return {
          content: [{ type: 'text', text: `Cleared ${clearedCount} cells in range (${start_row},${start_col}) to (${end_row},${end_col}).` }],
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
