import { Node, mergeAttributes } from '@tiptap/core';
import { SpreadsheetNodeAttributes, createDefaultSpreadsheetConfig } from '../models/spreadsheet.model';

/**
 * Options for the Spreadsheet extension
 */
export interface SpreadsheetOptions {
  HTMLAttributes: Record<string, unknown>;
}

/**
 * Generate a unique spreadsheet ID (UUID v4 with prefix)
 */
function generateSpreadsheetId(): string {
  return 'ss-' + 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Extend TipTap Commands interface
 */
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    spreadsheet: {
      /**
       * Insert a new spreadsheet block
       * @param spreadsheetId - Optional pre-generated spreadsheet ID
       * @param name - Optional custom name for the spreadsheet
       */
      insertSpreadsheet: (spreadsheetId?: string, name?: string) => ReturnType;
    };
  }
}

/**
 * Spreadsheet TipTap Extension
 *
 * Creates a custom block node for Excel-like spreadsheets that can be embedded in documents.
 * The node stores only configuration and metadata - actual cell data is stored in
 * dynamically created PostgreSQL tables via Supabase.
 *
 * Features:
 * - Multi-sheet workbook support
 * - Formula engine integration (HyperFormula)
 * - Excel/Google Sheets import/export
 * - Cell formatting and validation
 *
 * Pattern: Based on DatabaseTableExtension with enhanced configuration.
 */
export const SpreadsheetExtension = Node.create<SpreadsheetOptions>({
  name: 'spreadsheet',

  // Block-level node (renders as a block element)
  group: 'block',

  // Atomic node (treated as a single unit, cannot place cursor inside)
  atom: true,

  // Disable draggable to prevent interference with input interactions
  draggable: false,

  // Content is isolated (cannot be edited inline)
  isolating: true,

  // Prevent selection issues with internal components
  selectable: false,

  /**
   * Default options
   */
  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  /**
   * Node attributes
   */
  addAttributes() {
    return {
      // Unique spreadsheet identifier
      spreadsheetId: {
        default: '',
        parseHTML: element => element.getAttribute('data-spreadsheet-id') || '',
        renderHTML: attributes => {
          return {
            'data-spreadsheet-id': attributes['spreadsheetId'] || '',
          };
        },
      },

      // Spreadsheet configuration (sheets, settings, named ranges)
      config: {
        default: createDefaultSpreadsheetConfig(),
        parseHTML: element => {
          const configAttr = element.getAttribute('data-config');
          if (!configAttr) return createDefaultSpreadsheetConfig();
          try {
            return JSON.parse(configAttr);
          } catch {
            return createDefaultSpreadsheetConfig();
          }
        },
        renderHTML: attributes => {
          const config = attributes['config'] || createDefaultSpreadsheetConfig();
          return {
            'data-config': JSON.stringify(config),
          };
        },
      },

      // Storage mode (always 'supabase' for dynamic tables)
      storageMode: {
        default: 'supabase',
        parseHTML: element => element.getAttribute('data-storage-mode') || 'supabase',
        renderHTML: attributes => {
          return {
            'data-storage-mode': attributes['storageMode'] || 'supabase',
          };
        },
      },
    };
  },

  /**
   * Parse HTML to node
   */
  parseHTML() {
    return [
      {
        tag: 'div[data-type="spreadsheet"]',
      },
    ];
  },

  /**
   * Render node to HTML (placeholder that will be replaced by Angular component)
   */
  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(
        {
          'data-type': 'spreadsheet',
          'class': 'spreadsheet-block',
        },
        this.options.HTMLAttributes,
        HTMLAttributes
      ),
      // Placeholder text (will be replaced by Angular component)
      'Feuille de calcul',
    ];
  },

  /**
   * Commands
   */
  addCommands() {
    return {
      /**
       * Insert a new spreadsheet with default configuration
       * @param spreadsheetId - Optional pre-generated spreadsheet ID
       * @param name - Optional custom name for the spreadsheet
       */
      insertSpreadsheet:
        (spreadsheetId?: string, name?: string) =>
        ({ commands }) => {
          const attributes: SpreadsheetNodeAttributes = {
            spreadsheetId: spreadsheetId || '', // Use provided ID or empty string (lazy creation)
            config: createDefaultSpreadsheetConfig(name || 'Feuille de calcul'),
            storageMode: 'supabase',
          };

          // Insert the node
          return commands.insertContent({
            type: this.name,
            attrs: attributes,
          });
        },
    };
  },

  /**
   * Keyboard shortcuts
   */
  addKeyboardShortcuts() {
    return {
      // Cmd/Ctrl + Shift + S to insert spreadsheet
      // Note: Using 'x' to avoid conflict with save (Cmd+S)
      'Mod-Shift-x': () => this.editor.commands.insertSpreadsheet(),
    };
  },
});
