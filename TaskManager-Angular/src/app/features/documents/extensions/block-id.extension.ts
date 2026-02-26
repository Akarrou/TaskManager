import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// Lightweight type for ProseMirror Node (avoids importing from @tiptap/pm/model)
interface PMNode {
  type: { name: string };
  attrs: Record<string, unknown>;
  nodeSize: number;
  descendants: (fn: (node: PMNode, pos: number) => boolean) => void;
}

/**
 * Generate a unique block ID using crypto.randomUUID()
 */
function generateBlockId(): string {
  return 'block-' + crypto.randomUUID();
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
 * All block-level node types that should have a blockId attribute.
 * This must cover every block type registered in the editor.
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
  'accordionGroup',
  'accordionItem',
  'accordionTitle',
  'accordionContent',
  'spreadsheet',
  'mindmap',
  'taskMention',
];

export interface BlockIdOptions {
  /**
   * List of node types to add blockId attribute to
   */
  types: string[];
}

// Plugin keys
const blockIdAssignmentKey = new PluginKey('blockIdAssignment');
const commentDecorationsKey = new PluginKey('commentDecorations');

// Store for comment data (accessible from outside)
let currentBlocksWithComments = new Set<string>();
let currentBlockCommentCounts = new Map<string, number>();

/**
 * BlockId Extension
 *
 * Adds a stable `blockId` attribute to all block-level nodes.
 * This enables attaching comments to specific blocks that persist
 * even when document structure changes.
 *
 * Features:
 * - Mandatory at creation: IDs are automatically assigned to every new block
 * - appendTransaction plugin ensures no block is ever missing an ID (also handles paste dedup)
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
       * With auto-assignment, blocks should always have an ID — this is a safety fallback
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
    const blockTypeSet = new Set(blockTypes);

    return [
      // 1. blockIdAssignment — appendTransaction to auto-assign IDs and deduplicate on paste
      new Plugin({
        key: blockIdAssignmentKey,
        appendTransaction(transactions, _oldState, newState) {
          const docChanged = transactions.some(tr => tr.docChanged);
          if (!docChanged) return null;

          const tr = newState.tr;
          let modified = false;

          // Track seen IDs to detect duplicates (from paste)
          const seenIds = new Set<string>();
          const positions: { pos: number; node: PMNode }[] = [];

          newState.doc.descendants((node: PMNode, pos: number) => {
            if (blockTypeSet.has(node.type.name)) {
              const blockId = node.attrs['blockId'] as string | null;
              if (!blockId || seenIds.has(blockId)) {
                // Missing ID or duplicate (from paste) → needs a new ID
                positions.push({ pos, node });
              } else {
                seenIds.add(blockId);
              }
            }
            return true;
          });

          // Apply in reverse order to avoid position shifts
          for (let i = positions.length - 1; i >= 0; i--) {
            const { pos, node } = positions[i];
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              blockId: generateBlockId(),
            });
            modified = true;
          }

          if (!modified) return null;

          tr.setMeta('addToHistory', false);
          return tr;
        },
      }),

      // 2. commentDecorations — plugin for comment badges
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
 * Helper function to get the blockId of a block at a given position.
 * With auto-assignment, blocks should always have an ID — this simply reads it.
 */
export function ensureBlockIdAtPosition(
  editor: {
    state: { doc: { resolve: (pos: number) => { depth: number; node: (depth: number) => { type: { name: string }; attrs: Record<string, unknown> } } } };
  },
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
