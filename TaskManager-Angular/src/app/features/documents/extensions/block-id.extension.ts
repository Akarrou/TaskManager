import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// Type for ProseMirror Node
interface PMNode {
  type: { name: string };
  attrs: Record<string, unknown>;
  nodeSize: number;
  descendants: (fn: (node: PMNode, pos: number) => boolean) => void;
}

/**
 * Generate a unique block ID (UUID v4)
 */
function generateBlockId(): string {
  return 'block-' + 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
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
    blockId: {
      /**
       * Ensure the current block has a blockId, assigning one if missing
       * Returns the blockId
       */
      ensureBlockId: () => ReturnType;
      /**
       * Get the blockId of the block at the current selection
       */
      getBlockId: () => ReturnType;
      /**
       * Set a specific blockId on the block at current selection
       */
      setBlockId: (blockId: string) => ReturnType;
      /**
       * Update the set of blockIds that have comments
       */
      setBlocksWithComments: (blockIds: Set<string>, counts: Map<string, number>) => ReturnType;
    };
  }
}

/**
 * List of block-level node types that should have blockId attribute
 */
const BLOCK_TYPES = [
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'bulletList',
  'orderedList',
  'taskList',
  'listItem',
  'taskItem',
  'table',
  'tableRow',
  'tableCell',
  'tableHeader',
  'horizontalRule',
  'image',
  'columns',
  'column',
  'databaseTable',
  'taskSection',
];

export interface BlockIdOptions {
  /**
   * List of node types to add blockId attribute to
   */
  types: string[];
}

// Plugin key for comment decorations
const commentDecorationsKey = new PluginKey('commentDecorations');

// Store for comment data (accessible from outside)
let currentBlocksWithComments: Set<string> = new Set();
let currentBlockCommentCounts: Map<string, number> = new Map();

/**
 * BlockId Extension
 *
 * Adds a stable `blockId` attribute to all block-level nodes.
 * This enables attaching comments to specific blocks that persist
 * even when document structure changes.
 *
 * Features:
 * - Lazy ID assignment: IDs are only generated when needed (e.g., adding a comment)
 * - Stable persistence: IDs are stored in document JSON and never change
 * - Global attributes: Works with all block-level node types
 * - Comment decorations: Adds visual indicators for blocks with comments
 */
export const BlockIdExtension = Extension.create<BlockIdOptions>({
  name: 'blockId',

  addOptions() {
    return {
      types: BLOCK_TYPES,
    };
  },

  addGlobalAttributes() {
    return [
      {
        // Apply to all block types
        types: this.options.types,
        attributes: {
          blockId: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-block-id') || null,
            renderHTML: (attributes) => {
              if (!attributes['blockId']) {
                return {};
              }
              return {
                'data-block-id': attributes['blockId'],
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      /**
       * Ensure the block at current selection has a blockId
       * If no blockId exists, generates and assigns one
       */
      ensureBlockId:
        () =>
        ({ state, chain }) => {
          const { selection } = state;
          const { $from } = selection;

          // Find the nearest block-level parent
          let depth = $from.depth;
          while (depth > 0) {
            const node = $from.node(depth);
            if (this.options.types.includes(node.type.name)) {
              const existingBlockId = node.attrs['blockId'];

              if (existingBlockId) {
                // Already has a blockId
                return true;
              }

              // Generate and set new blockId
              const newBlockId = generateBlockId();
              const pos = $from.before(depth);

              return chain()
                .command(({ tr }) => {
                  tr.setNodeMarkup(pos, undefined, {
                    ...node.attrs,
                    blockId: newBlockId,
                  });
                  return true;
                })
                .run();
            }
            depth--;
          }

          return false;
        },

      /**
       * Get the blockId of the block at current selection
       */
      getBlockId:
        () =>
        ({ state }) => {
          const { selection } = state;
          const { $from } = selection;

          let depth = $from.depth;
          while (depth > 0) {
            const node = $from.node(depth);
            if (this.options.types.includes(node.type.name)) {
              return node.attrs['blockId'] || null;
            }
            depth--;
          }

          return null;
        },

      /**
       * Set a specific blockId on the block at current selection
       */
      setBlockId:
        (blockId: string) =>
        ({ state, chain }) => {
          const { selection } = state;
          const { $from } = selection;

          let depth = $from.depth;
          while (depth > 0) {
            const node = $from.node(depth);
            if (this.options.types.includes(node.type.name)) {
              const pos = $from.before(depth);

              return chain()
                .command(({ tr }) => {
                  tr.setNodeMarkup(pos, undefined, {
                    ...node.attrs,
                    blockId,
                  });
                  return true;
                })
                .run();
            }
            depth--;
          }

          return false;
        },

      /**
       * Update the set of blockIds that have comments
       * This triggers a re-render of decorations
       */
      setBlocksWithComments:
        (blockIds: Set<string>, counts: Map<string, number>) =>
        ({ tr, dispatch }) => {
          currentBlocksWithComments = blockIds;
          currentBlockCommentCounts = counts;

          if (dispatch) {
            // Trigger a metadata change to force decoration update
            tr.setMeta(commentDecorationsKey, { updated: true });
            dispatch(tr);
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const blockTypes = this.options.types;

    return [
      new Plugin({
        key: commentDecorationsKey,
        state: {
          init(_, state) {
            return buildDecorations(state.doc, blockTypes);
          },
          apply(tr, oldDecorations, _, newState) {
            // Rebuild decorations if document changed or meta was set
            if (tr.docChanged || tr.getMeta(commentDecorationsKey)) {
              return buildDecorations(newState.doc, blockTypes);
            }
            return oldDecorations.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});

// Callback for when a comment badge is clicked
let onCommentBadgeClick: ((blockId: string) => void) | null = null;

/**
 * Set the callback for comment badge clicks
 */
export function setCommentBadgeClickHandler(handler: (blockId: string) => void): void {
  onCommentBadgeClick = handler;
}

/**
 * Create a comment badge widget element
 */
function createCommentBadge(blockId: string, count: number): HTMLElement {
  const badge = document.createElement('button');
  badge.className = 'block-comment-indicator';
  badge.setAttribute('data-block-id', blockId);
  badge.setAttribute('type', 'button');
  badge.setAttribute('title', `${count} commentaire${count > 1 ? 's' : ''}`);
  badge.textContent = count.toString();
  badge.contentEditable = 'false';

  // Handle click to open comment panel
  badge.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onCommentBadgeClick) {
      onCommentBadgeClick(blockId);
    }
  });

  return badge;
}

/**
 * Build decorations for blocks with comments
 */
function buildDecorations(doc: unknown, blockTypes: string[]): DecorationSet {
  const decorations: Decoration[] = [];
  const pmDoc = doc as PMNode;

  pmDoc.descendants((node: PMNode, pos: number) => {
    const blockId = node.attrs['blockId'] as string | null;
    if (blockId && blockTypes.includes(node.type.name)) {
      if (currentBlocksWithComments.has(blockId)) {
        const count = currentBlockCommentCounts.get(blockId) || 0;

        // Add node decoration for the has-comments class
        decorations.push(
          Decoration.node(pos, pos + node.nodeSize, {
            class: 'has-comments',
            'data-comment-count': count.toString(),
          })
        );

        // Add widget decoration for the comment badge at the end of the block
        const widgetPos = pos + node.nodeSize - 1;
        decorations.push(
          Decoration.widget(widgetPos, () => createCommentBadge(blockId, count), {
            side: 1,
            key: `comment-badge-${blockId}`,
          })
        );
      }
    }
    return true; // Continue traversing
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return DecorationSet.create(doc as any, decorations);
}

/**
 * Helper function to extract all blockIds from a document
 * Used for orphan comment cleanup
 */
export function extractBlockIdsFromContent(content: Record<string, unknown>): string[] {
  const blockIds: string[] = [];

  const traverse = (node: Record<string, unknown>) => {
    if (node['attrs'] && (node['attrs'] as Record<string, unknown>)['blockId']) {
      blockIds.push((node['attrs'] as Record<string, unknown>)['blockId'] as string);
    }

    if (node['content'] && Array.isArray(node['content'])) {
      for (const child of node['content']) {
        traverse(child as Record<string, unknown>);
      }
    }
  };

  traverse(content);
  return blockIds;
}

/**
 * Helper function to get blockId at a specific position in the editor
 */
export function getBlockIdAtPosition(
  editor: { state: { doc: { resolve: (pos: number) => { depth: number; node: (depth: number) => { type: { name: string }; attrs: Record<string, unknown> } } } } },
  pos: number,
  blockTypes: string[] = BLOCK_TYPES
): string | null {
  const $pos = editor.state.doc.resolve(pos);

  let depth = $pos.depth;
  while (depth > 0) {
    const node = $pos.node(depth);
    if (blockTypes.includes(node.type.name)) {
      return (node.attrs['blockId'] as string) || null;
    }
    depth--;
  }

  return null;
}

/**
 * Helper function to ensure a block at position has an ID and return it
 */
export function ensureBlockIdAtPosition(
  editor: {
    state: { doc: { resolve: (pos: number) => { depth: number; node: (depth: number) => { type: { name: string }; attrs: Record<string, unknown> }; before: (depth: number) => number } } };
    view: { dispatch: (tr: unknown) => void };
  },
  pos: number,
  blockTypes: string[] = BLOCK_TYPES
): string | null {
  const $pos = editor.state.doc.resolve(pos);

  let depth = $pos.depth;
  while (depth > 0) {
    const node = $pos.node(depth);
    if (blockTypes.includes(node.type.name)) {
      const existingId = node.attrs['blockId'] as string;
      if (existingId) {
        return existingId;
      }

      // Generate new ID
      const newBlockId = generateBlockId();
      const nodePos = $pos.before(depth);

      // Create transaction to set the blockId
      const tr = (editor as unknown as { state: { tr: { setNodeMarkup: (pos: number, type: undefined, attrs: Record<string, unknown>) => unknown } } }).state.tr;
      tr.setNodeMarkup(nodePos, undefined, {
        ...node.attrs,
        blockId: newBlockId,
      });
      editor.view.dispatch(tr as unknown);

      return newBlockId;
    }
    depth--;
  }

  return null;
}
