import { Node, mergeAttributes } from '@tiptap/core';

export interface TaskSectionOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    taskSection: {
      /**
       * Insert a task section block
       */
      insertTaskSection: () => ReturnType;
    };
  }
}

export const TaskSectionExtension = Node.create<TaskSectionOptions>({
  name: 'taskSection',

  group: 'block',

  atom: true,

  draggable: true,

  isolating: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      documentId: {
        default: null,
        parseHTML: element => element.getAttribute('data-document-id'),
        renderHTML: attributes => {
          if (!attributes['documentId']) {
            return {};
          }
          return {
            'data-document-id': attributes['documentId'],
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="task-section"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(
        {
          'data-type': 'task-section',
          'class': 'task-section-block',
        },
        this.options.HTMLAttributes,
        HTMLAttributes
      ),
      'Tâches liées au document',
    ];
  },

  addCommands() {
    return {
      insertTaskSection:
        () =>
        ({ commands, editor }) => {
          // Get document ID from editor state or options
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const documentId = (editor.options as any).documentId || '';

          return commands.insertContent({
            type: this.name,
            attrs: {
              documentId,
            },
          });
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-t': () => this.editor.commands.insertTaskSection(),
    };
  },
});
