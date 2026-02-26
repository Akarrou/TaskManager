import { Node, mergeAttributes } from '@tiptap/core';

export interface ColumnsOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    columns: {
      setColumns: (columns?: number) => ReturnType;
      unsetColumns: () => ReturnType;
    };
  }
}

export const Columns = Node.create<ColumnsOptions>({
  name: 'columns',

  group: 'block',

  content: 'column+',

  defining: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="columns"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'columns',
        class: 'tiptap-columns',
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setColumns:
        (columns = 2) =>
        ({ chain, state }) => {
          const { $from } = state.selection;
          const node = $from.node($from.depth);

          // Don't nest columns inside columns
          if (node.type.name === 'columns' || node.type.name === 'column') {
            return false;
          }

          // Create columns structure
          const columnNodes = [];
          for (let i = 0; i < columns; i++) {
            columnNodes.push({
              type: 'column',
              content: [{ type: 'paragraph' }],
            });
          }

          return chain()
            .insertContent({
              type: 'columns',
              content: columnNodes,
            })
            .run();
        },

      unsetColumns:
        () =>
        ({ commands }) => {
          return commands.setNode('paragraph');
        },
    };
  },
});

export const Column = Node.create({
  name: 'column',

  content: 'block+',

  isolating: true,

  parseHTML() {
    return [
      {
        tag: 'div[data-type="column"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'column',
        class: 'tiptap-column',
      }),
      0,
    ];
  },
});
