import { Node, mergeAttributes } from '@tiptap/core';
import {
  MindmapNodeAttributes,
  MindmapData,
  createDefaultMindmapData,
  generateMindmapId,
} from '../models/mindmap.model';

/**
 * Options for the Mindmap extension
 */
export interface MindmapOptions {
  HTMLAttributes: Record<string, unknown>;
}

/**
 * Extend TipTap Commands interface
 */
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mindmap: {
      /**
       * Insert a new mind map block
       * @param data - Optional initial mind map data
       */
      insertMindmap: (data?: MindmapData) => ReturnType;

      /**
       * Update mind map data
       * @param mindmapId - The mindmap instance ID
       * @param data - Updated mind map data
       */
      updateMindmap: (mindmapId: string, data: MindmapData) => ReturnType;
    };
  }
}

/**
 * Mindmap TipTap Extension
 *
 * Creates a custom block node for interactive mind maps.
 * Data is stored directly in the node attributes as JSON.
 *
 * Pattern: Similar to DatabaseTableExtension
 */
export const MindmapExtension = Node.create<MindmapOptions>({
  name: 'mindmap',

  // Block-level node
  group: 'block',

  // Atomic node (treated as a single unit)
  atom: true,

  // Disable draggable to prevent interference with interactions
  draggable: false,

  // Content is isolated
  isolating: true,

  // Prevent deletion when interacting inside the block
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
      // Unique mindmap identifier
      mindmapId: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-mindmap-id') || '',
        renderHTML: (attributes) => ({
          'data-mindmap-id': attributes['mindmapId'] || '',
        }),
      },

      // Mind map data (nodes, config, etc.)
      data: {
        default: createDefaultMindmapData(),
        parseHTML: (element) => {
          const dataAttr = element.getAttribute('data-mindmap-data');
          if (!dataAttr) return createDefaultMindmapData();
          try {
            return JSON.parse(dataAttr);
          } catch {
            return createDefaultMindmapData();
          }
        },
        renderHTML: (attributes) => {
          const data = attributes['data'] || createDefaultMindmapData();
          return {
            'data-mindmap-data': JSON.stringify(data),
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
        tag: 'div[data-type="mindmap"]',
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
          'data-type': 'mindmap',
          class: 'mindmap-block',
        },
        this.options.HTMLAttributes,
        HTMLAttributes
      ),
      // Placeholder text (will be replaced by Angular component)
      'Mind Map',
    ];
  },

  /**
   * Commands
   */
  addCommands() {
    return {
      /**
       * Insert a new mind map with default or provided data
       */
      insertMindmap:
        (data?: MindmapData) =>
        ({ commands }) => {
          const mindmapId = generateMindmapId();
          const mindmapData = data || createDefaultMindmapData();

          const attributes: MindmapNodeAttributes = {
            mindmapId,
            data: mindmapData,
          };

          return commands.insertContent({
            type: this.name,
            attrs: attributes,
          });
        },

      /**
       * Update mind map data for a specific mindmap
       */
      updateMindmap:
        (mindmapId: string, data: MindmapData) =>
        ({ tr, state }) => {
          let updated = false;

          state.doc.descendants((node, pos) => {
            if (
              node.type.name === 'mindmap' &&
              node.attrs['mindmapId'] === mindmapId
            ) {
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                data,
              });
              updated = true;
              return false; // Stop iteration
            }
            return true;
          });

          return updated;
        },
    };
  },

  /**
   * Keyboard shortcuts
   */
  addKeyboardShortcuts() {
    return {
      // Cmd/Ctrl + Shift + M to insert mind map
      'Mod-Shift-m': () => this.editor.commands.insertMindmap(),
    };
  },
});
