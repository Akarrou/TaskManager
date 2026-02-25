import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getSupabaseClient } from '../services/supabase-client.js';
import { getCurrentUserId } from '../services/user-auth.js';
import { saveSnapshot } from '../services/snapshot.js';
import { logger } from '../services/logger.js';

/**
 * Register all spreadsheet-related tools (Excel-like spreadsheets embedded in documents)
 */
export function registerSpreadsheetTools(server: McpServer): void {
  // =========================================================================
  // list_spreadsheets - List all spreadsheets
  // =========================================================================
  server.registerTool(
    'list_spreadsheets',
    {
      description: `List all Excel-like spreadsheets in the workspace. Spreadsheets are grid-based calculation tools embedded in documents, separate from Notion-like databases. They support formulas, multiple sheets, and cell formatting. Returns spreadsheet metadata (id, document_id, config). Use get_spreadsheet for full details or get_cells to access data. Related tools: create_spreadsheet, get_cells, update_cell.`,
      inputSchema: {
        document_id: z.string().uuid().optional().describe('Filter to spreadsheets in a specific document.'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ document_id }) => {
      try {
        const supabase = getSupabaseClient();
        let query = supabase
          .from('document_spreadsheets')
          .select('*')
          .is('deleted_at', null)
          .order('created_at', { ascending: false });

        if (document_id) {
          query = query.eq('document_id', document_id);
        }

        const { data, error } = await query;

        if (error) {
          return {
            content: [{ type: 'text', text: 'Error listing spreadsheets. Please try again.' }],
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
  // get_spreadsheet - Get a spreadsheet with its configuration
  // =========================================================================
  server.registerTool(
    'get_spreadsheet',
    {
      description: `Get a spreadsheet's full configuration including sheets list, active sheet, and table name. Does not return cell data - use get_cells for that. Config includes: name, sheets array (each with id, name, rowCount, columnCount, frozen rows/cols), activeSheet. Related tools: get_cells (data), update_spreadsheet (config changes).`,
      inputSchema: {
        spreadsheet_id: z.string().uuid().describe('The spreadsheet UUID. Get from list_spreadsheets.'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ spreadsheet_id }) => {
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from('document_spreadsheets')
          .select('*')
          .eq('spreadsheet_id', spreadsheet_id)
          .is('deleted_at', null)
          .single();

        if (error) {
          return {
            content: [{ type: 'text', text: 'Error getting spreadsheet. Please try again.' }],
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
  // create_spreadsheet - Create a new spreadsheet
  // =========================================================================
  server.registerTool(
    'create_spreadsheet',
    {
      description: `Create a new Excel-like spreadsheet embedded in a document. Starts with one empty sheet ("Sheet 1"). Columns are limited to 26 (A-Z). Cells support values, numbers, and formulas (starting with "="). Use update_cell or update_cells_batch to populate data. Returns the created spreadsheet with its UUID. Related tools: add_sheet (multiple sheets), update_cell (add data).`,
      inputSchema: {
        document_id: z.string().uuid().describe('The parent document to embed this spreadsheet in.'),
        name: z.string().min(1).max(255).optional().default('Spreadsheet').describe('Display name for the spreadsheet.'),
        rows: z.number().min(1).max(1000).optional().default(100).describe('Initial row count. Default 100, max 1000.'),
        columns: z.number().min(1).max(26).optional().default(10).describe('Initial column count. Default 10, max 26 (A-Z).'),
      },
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
            content: [{ type: 'text', text: 'Error creating spreadsheet. Please try again.' }],
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
            content: [{ type: 'text', text: 'Error creating cells table. Please try again.' }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Spreadsheet created successfully:\n${JSON.stringify(data, null, 2)}` }],
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
  // update_spreadsheet - Update spreadsheet configuration
  // =========================================================================
  server.registerTool(
    'update_spreadsheet',
    {
      description: `Update a spreadsheet's configuration (metadata, not cell data). Config is merged with existing - only provide fields to change. Can update name, activeSheet, or sheet properties. To update cell values, use update_cell or update_cells_batch instead. Related tools: get_spreadsheet (current config), add_sheet.`,
      inputSchema: {
        spreadsheet_id: z.string().uuid().describe('The spreadsheet UUID to update.'),
        config: z.record(z.unknown()).describe('Config fields to merge. Example: { name: "New Name", activeSheet: "sheet2" }.'),
      },
      annotations: { idempotentHint: true },
    },
    async ({ spreadsheet_id, config }) => {
      try {
        const userId = getCurrentUserId();
        let snapshotToken = '';
        const supabase = getSupabaseClient();

        // Get current full row for snapshot
        const { data: current, error: getError } = await supabase
          .from('document_spreadsheets')
          .select('*')
          .eq('spreadsheet_id', spreadsheet_id)
          .single();

        if (getError || !current) {
          return {
            content: [{ type: 'text', text: `Spreadsheet not found: ${spreadsheet_id}` }],
            isError: true,
          };
        }

        // Snapshot before modification
        const snapshot = await saveSnapshot({
          entityType: 'spreadsheet',
          entityId: spreadsheet_id,
          tableName: 'document_spreadsheets',
          toolName: 'update_spreadsheet',
          operation: 'update',
          data: current,
          userId,
        });
        snapshotToken = snapshot.token;

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
            content: [{ type: 'text', text: 'Error updating spreadsheet. Please try again.' }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Spreadsheet updated (snapshot: ${snapshotToken}) successfully:\n${JSON.stringify(data, null, 2)}` }],
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
  // delete_spreadsheet - Delete a spreadsheet
  // =========================================================================
  server.registerTool(
    'delete_spreadsheet',
    {
      description: `DESTRUCTIVE: Permanently delete a spreadsheet and ALL its cell data across all sheets. This action CANNOT be undone. The confirm parameter must be true as a safety measure. Consider exporting data first. Returns confirmation of deletion. WARNING: All sheets and cells are permanently lost.`,
      inputSchema: {
        spreadsheet_id: z.string().uuid().describe('The spreadsheet UUID to delete.'),
        confirm: z.boolean().describe('REQUIRED: Must be true to proceed. Safety measure.'),
      },
      annotations: { destructiveHint: true },
    },
    async ({ spreadsheet_id, confirm }) => {
      if (!confirm) {
        return {
          content: [{ type: 'text', text: 'Deletion not confirmed. Set confirm=true to proceed.' }],
          isError: true,
        };
      }

      try {
        const userId = getCurrentUserId();
        let snapshotToken = '';
        const supabase = getSupabaseClient();

        // Snapshot before deletion
        const { data: currentSpreadsheet } = await supabase
          .from('document_spreadsheets')
          .select('*')
          .eq('spreadsheet_id', spreadsheet_id)
          .single();

        if (currentSpreadsheet) {
          const snapshot = await saveSnapshot({
            entityType: 'spreadsheet',
            entityId: spreadsheet_id,
            tableName: 'document_spreadsheets',
            toolName: 'delete_spreadsheet',
            operation: 'delete',
            data: currentSpreadsheet,
            userId,
          });
          snapshotToken = snapshot.token;
        }

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
              content: [{ type: 'text', text: 'Error deleting spreadsheet. Please try again.' }],
              isError: true,
            };
          }
        }

        return {
          content: [{ type: 'text', text: `Spreadsheet ${spreadsheet_id} deleted (snapshot: ${snapshotToken}) successfully.` }],
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
  // get_cells - Get cells from a spreadsheet
  // =========================================================================
  server.registerTool(
    'get_cells',
    {
      description: `Get cell data from a spreadsheet for a specified range. Returns cells with row, col, value, and formula (if any). Cells without data are not returned (sparse). Uses 0-based indexing: row 0 is row 1 in UI, col 0 is column A. Default range is A1:J100 (first 10 columns, 100 rows). Use smaller ranges for better performance. Related tools: update_cell, update_cells_batch, clear_range.`,
      inputSchema: {
        spreadsheet_id: z.string().uuid().describe('The spreadsheet UUID.'),
        sheet_id: z.string().optional().default('sheet1').describe('Which sheet to read. Default "sheet1".'),
        start_row: z.number().min(0).optional().default(0).describe('Starting row, 0-indexed. 0 = row 1 in UI.'),
        start_col: z.number().min(0).optional().default(0).describe('Starting column, 0-indexed. 0 = column A.'),
        end_row: z.number().min(0).optional().default(99).describe('Ending row, inclusive. Default 99 (row 100).'),
        end_col: z.number().min(0).optional().default(9).describe('Ending column, inclusive. Default 9 (column J).'),
      },
      annotations: { readOnlyHint: true },
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
            content: [{ type: 'text', text: 'Error getting cells. Please try again.' }],
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
  // update_cell - Update a single cell
  // =========================================================================
  server.registerTool(
    'update_cell',
    {
      description: `Update a single cell's value. Values starting with "=" are treated as formulas. Uses 0-based indexing (row 0 = row 1, col 0 = column A). Creates the cell if it doesn't exist (upsert). For updating many cells, use update_cells_batch for better performance. Related tools: get_cells, update_cells_batch, clear_range.`,
      inputSchema: {
        spreadsheet_id: z.string().uuid().describe('The spreadsheet UUID.'),
        sheet_id: z.string().optional().default('sheet1').describe('Which sheet. Default "sheet1".'),
        row: z.number().min(0).describe('Row index, 0-based. 0 = row 1 in UI.'),
        col: z.number().min(0).describe('Column index, 0-based. 0 = column A, 1 = B, etc.'),
        value: z.unknown().describe('Cell value: string, number, or formula (start with "="). Examples: "Hello", 42, "=SUM(A1:A10)".'),
      },
      annotations: { idempotentHint: true },
    },
    async ({ spreadsheet_id, sheet_id, row, col, value }) => {
      try {
        const userId = getCurrentUserId();
        let snapshotToken = '';
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

        // Snapshot existing cell before modification
        const { data: currentCell } = await supabase
          .from(tableName)
          .select('*')
          .eq('spreadsheet_id', spreadsheet_id)
          .eq('sheet_id', sheet_id)
          .eq('row', row)
          .eq('col', col)
          .maybeSingle();

        if (currentCell) {
          const snapshot = await saveSnapshot({
            entityType: 'spreadsheet_cell',
            entityId: `${spreadsheet_id}_${sheet_id}_${row}_${col}`,
            tableName: tableName,
            toolName: 'update_cell',
            operation: 'update',
            data: currentCell,
            userId,
          });
          snapshotToken = snapshot.token;
        }

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
            content: [{ type: 'text', text: 'Error updating cell. Please try again.' }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Cell (${row}, ${col}) updated (snapshot: ${snapshotToken}) to: ${JSON.stringify(value)}` }],
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
  // update_cells_batch - Update multiple cells at once
  // =========================================================================
  server.registerTool(
    'update_cells_batch',
    {
      description: `Update multiple cells in a single operation (batch). More efficient than multiple update_cell calls. Each cell in the array specifies row, col, and value. Values starting with "=" are formulas. All cells must be in the same sheet. Returns count of updated cells. Use this for populating data or making bulk changes. Related tools: update_cell (single), get_cells, clear_range.`,
      inputSchema: {
        spreadsheet_id: z.string().uuid().describe('The spreadsheet UUID.'),
        sheet_id: z.string().optional().default('sheet1').describe('Which sheet. All cells go to this sheet.'),
        cells: z.array(z.object({
          row: z.number().min(0).describe('Row index, 0-based.'),
          col: z.number().min(0).describe('Column index, 0-based.'),
          value: z.unknown().describe('Cell value or formula.'),
        })).min(1).describe('Array of { row, col, value } objects to update.'),
      },
      annotations: { idempotentHint: true },
    },
    async ({ spreadsheet_id, sheet_id, cells }) => {
      try {
        const userId = getCurrentUserId();
        let snapshotToken = '';
        const supabase = getSupabaseClient();

        // Snapshot existing cells before batch update
        const { data: spreadsheet } = await supabase
          .from('document_spreadsheets')
          .select('table_name')
          .eq('spreadsheet_id', spreadsheet_id)
          .single();

        if (spreadsheet) {
          // Only snapshot the cells that will actually be modified (not the entire sheet)
          const targetRows = [...new Set(cells.map(c => c.row))];
          const targetCols = [...new Set(cells.map(c => c.col))];

          const { data: existingCells } = await supabase
            .from(spreadsheet.table_name)
            .select('*')
            .eq('spreadsheet_id', spreadsheet_id)
            .eq('sheet_id', sheet_id)
            .in('row', targetRows)
            .in('col', targetCols);

          if (existingCells && existingCells.length > 0) {
            const snapshot = await saveSnapshot({
              entityType: 'spreadsheet_cells_batch',
              entityId: spreadsheet_id,
              tableName: spreadsheet.table_name,
              toolName: 'update_cells_batch',
              operation: 'update',
              data: existingCells,
              userId,
            });
            snapshotToken = snapshot.token;
          }
        }

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
            content: [{ type: 'text', text: 'Error updating cells. Please try again.' }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Successfully updated ${cells.length} cells (snapshot: ${snapshotToken}).` }],
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
  // add_sheet - Add a new sheet to a spreadsheet
  // =========================================================================
  server.registerTool(
    'add_sheet',
    {
      description: `Add a new sheet (tab) to an existing spreadsheet. Similar to adding worksheet tabs in Excel. Each sheet has its own grid of cells. Sheet ID is auto-generated (sheet2, sheet3, etc.). New sheet starts empty. Returns the generated sheet ID. Related tools: rename_sheet, delete_sheet, get_spreadsheet (list sheets).`,
      inputSchema: {
        spreadsheet_id: z.string().uuid().describe('The spreadsheet UUID to add a sheet to.'),
        name: z.string().min(1).max(100).describe('Sheet tab name displayed in UI.'),
        rows: z.number().min(1).max(1000).optional().default(100).describe('Initial row count. Default 100.'),
        columns: z.number().min(1).max(26).optional().default(10).describe('Initial column count. Default 10 (A-J).'),
      },
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
            content: [{ type: 'text', text: 'Error adding sheet. Please try again.' }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Sheet "${name}" added successfully with ID: ${newSheetId}` }],
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
  // rename_sheet - Rename a sheet
  // =========================================================================
  server.registerTool(
    'rename_sheet',
    {
      description: `Rename a sheet's display name in the spreadsheet tabs. Does not affect cell data or formulas referencing this sheet. Get current sheet IDs from get_spreadsheet config.sheets array. Returns confirmation of rename.`,
      inputSchema: {
        spreadsheet_id: z.string().uuid().describe('The spreadsheet UUID.'),
        sheet_id: z.string().describe('The sheet ID to rename (e.g., "sheet1", "sheet2").'),
        name: z.string().min(1).max(100).describe('New tab name.'),
      },
      annotations: { idempotentHint: true },
    },
    async ({ spreadsheet_id, sheet_id, name }) => {
      try {
        const userId = getCurrentUserId();
        let snapshotToken = '';
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

        // Snapshot after validation
        const snapshot = await saveSnapshot({
          entityType: 'spreadsheet',
          entityId: spreadsheet_id,
          tableName: 'document_spreadsheets',
          toolName: 'rename_sheet',
          operation: 'update',
          data: spreadsheet,
          userId,
        });
        snapshotToken = snapshot.token;

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
            content: [{ type: 'text', text: 'Error renaming sheet. Please try again.' }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Sheet renamed (snapshot: ${snapshotToken}) to "${name}" successfully.` }],
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
  // delete_sheet - Delete a sheet
  // =========================================================================
  server.registerTool(
    'delete_sheet',
    {
      description: `Delete a sheet from a spreadsheet. WARNING: All cells in the sheet are permanently deleted. Cannot delete the last remaining sheet - a spreadsheet must have at least one. If deleting the active sheet, another sheet becomes active. Returns confirmation with deleted sheet name.`,
      inputSchema: {
        spreadsheet_id: z.string().uuid().describe('The spreadsheet UUID.'),
        sheet_id: z.string().describe('The sheet ID to delete (e.g., "sheet1").'),
      },
      annotations: { destructiveHint: true },
    },
    async ({ spreadsheet_id, sheet_id }) => {
      try {
        const userId = getCurrentUserId();
        let snapshotToken = '';
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

        // Snapshot after validation
        const snapshot = await saveSnapshot({
          entityType: 'spreadsheet',
          entityId: spreadsheet_id,
          tableName: 'document_spreadsheets',
          toolName: 'delete_sheet',
          operation: 'update',
          data: spreadsheet,
          userId,
        });
        snapshotToken = snapshot.token;

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
            content: [{ type: 'text', text: 'Error deleting sheet. Please try again.' }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Sheet "${deletedSheet.name}" deleted (snapshot: ${snapshotToken}) successfully.` }],
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
  // clear_range - Clear a range of cells
  // =========================================================================
  server.registerTool(
    'clear_range',
    {
      description: `Clear (delete) all cells in a rectangular range. Both values and formulas are removed. Uses 0-based indexing. Clears from (start_row, start_col) to (end_row, end_col) inclusive. Returns count of cleared cells. Use this to reset areas before re-populating or to remove unwanted data. Related tools: update_cells_batch (replace data), get_cells.`,
      inputSchema: {
        spreadsheet_id: z.string().uuid().describe('The spreadsheet UUID.'),
        sheet_id: z.string().optional().default('sheet1').describe('Which sheet. Default "sheet1".'),
        start_row: z.number().min(0).describe('Starting row, 0-based.'),
        start_col: z.number().min(0).describe('Starting column, 0-based. 0 = column A.'),
        end_row: z.number().min(0).describe('Ending row, inclusive.'),
        end_col: z.number().min(0).describe('Ending column, inclusive.'),
      },
      annotations: { destructiveHint: true },
    },
    async ({ spreadsheet_id, sheet_id, start_row, start_col, end_row, end_col }) => {
      try {
        const userId = getCurrentUserId();
        let snapshotToken = '';
        const supabase = getSupabaseClient();

        // Snapshot existing cells in range before clearing
        const { data: spreadsheet } = await supabase
          .from('document_spreadsheets')
          .select('table_name')
          .eq('spreadsheet_id', spreadsheet_id)
          .single();

        if (spreadsheet) {
          const { data: existingCells } = await supabase
            .from(spreadsheet.table_name)
            .select('*')
            .eq('spreadsheet_id', spreadsheet_id)
            .eq('sheet_id', sheet_id)
            .gte('row', start_row)
            .lte('row', end_row)
            .gte('col', start_col)
            .lte('col', end_col);

          if (existingCells && existingCells.length > 0) {
            const snapshot = await saveSnapshot({
              entityType: 'spreadsheet_cells_range',
              entityId: spreadsheet_id,
              tableName: spreadsheet.table_name,
              toolName: 'clear_range',
              operation: 'delete',
              data: existingCells,
              userId,
            });
            snapshotToken = snapshot.token;
          }
        }

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
            content: [{ type: 'text', text: 'Error clearing range. Please try again.' }],
            isError: true,
          };
        }

        const clearedCount = data || 0;

        return {
          content: [{ type: 'text', text: `Cleared ${clearedCount} cells (snapshot: ${snapshotToken}) in range (${start_row},${start_col}) to (${end_row},${end_col}).` }],
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
