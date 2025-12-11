import { Node, mergeAttributes } from '@tiptap/core';
import { DatabaseNodeAttributes, DEFAULT_DATABASE_CONFIG } from '../models/database.model';

/**
 * Options for the DatabaseTable extension
 */
export interface DatabaseTableOptions {
  HTMLAttributes: Record<string, unknown>;
}

/**
 * Generate a unique database ID (UUID v4)
 */
function generateDatabaseId(): string {
  return 'db-' + 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
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
    databaseTable: {
      /**
       * Insert a new database table block
       * @param databaseId - Optional pre-generated database ID
       */
      insertDatabaseTable: (databaseId?: string) => ReturnType;
    };
  }
}

/**
 * DatabaseTable TipTap Extension
 *
 * Creates a custom block node for database tables that can be embedded in documents.
 * The node stores only configuration and metadata - actual data is stored in
 * dynamically created PostgreSQL tables via Supabase.
 *
 * Pattern: Similar to TaskSectionExtension but with richer configuration.
 */
export const DatabaseTableExtension = Node.create<DatabaseTableOptions>({
  name: 'databaseTable',

  // Block-level node (renders as a block element)
  group: 'block',

  // Atomic node (treated as a single unit, cannot place cursor inside)
  atom: true,

  // Disable draggable to prevent interference with input interactions
  draggable: false,

  // Content is isolated (cannot be edited inline)
  isolating: true,

  // Prevent deletion when typing inside the block
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
      // Unique database identifier
      databaseId: {
        default: '',
        parseHTML: element => element.getAttribute('data-database-id') || '',
        renderHTML: attributes => {
          // Always render the attribute, even if empty
          // Empty string signals "database not yet created"
          return {
            'data-database-id': attributes['databaseId'] || '',
          };
        },
      },

      // Database configuration (columns, views, etc.)
      config: {
        default: DEFAULT_DATABASE_CONFIG,
        parseHTML: element => {
          const configAttr = element.getAttribute('data-config');
          if (!configAttr) return DEFAULT_DATABASE_CONFIG;
          try {
            return JSON.parse(configAttr);
          } catch {
            return DEFAULT_DATABASE_CONFIG;
          }
        },
        renderHTML: attributes => {
          // Always render config, use default if not provided
          const config = attributes['config'] || DEFAULT_DATABASE_CONFIG;
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
        tag: 'div[data-type="database-table"]',
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
          'data-type': 'database-table',
          'class': 'database-table-block',
        },
        this.options.HTMLAttributes,
        HTMLAttributes
      ),
      // Placeholder text (will be replaced by Angular component)
      'Base de données',
    ];
  },

  /**
   * Commands
   */
  addCommands() {
    return {
      /**
       * Insert a new database table with default configuration
       * @param databaseId - Optional pre-generated database ID (recommended)
       */
      insertDatabaseTable:
        (databaseId?: string) =>
        ({ commands }) => {
          const attributes: DatabaseNodeAttributes = {
            databaseId: databaseId || '', // Use provided ID or empty string
            config: DEFAULT_DATABASE_CONFIG,
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
      // Cmd/Ctrl + Shift + D to insert database table
      'Mod-Shift-d': () => this.editor.commands.insertDatabaseTable(),
    };
  },
});
