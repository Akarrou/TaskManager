import { Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export interface TaskMentionAttributes {
  taskId: string;
  taskTitle: string;
  taskStatus: 'pending' | 'in_progress' | 'review' | 'completed' | 'cancelled';
  taskPriority: 'low' | 'medium' | 'high' | 'urgent';
  taskType: 'epic' | 'feature' | 'task';
  taskNumber?: number;
}

export interface TaskMentionOptions {
  onTaskClick?: (taskId: string) => void;
}

// Extend TipTap's Commands interface
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    taskMention: {
      insertTaskMention: (attrs: TaskMentionAttributes) => ReturnType;
      updateTaskMention: (taskId: string, attrs: Partial<TaskMentionAttributes>) => ReturnType;
    };
  }
}

export const TaskMention = Node.create<TaskMentionOptions>({
  name: 'taskMention',
  group: 'block',
  atom: true,

  addOptions() {
    return {
      onTaskClick: undefined,
    };
  },

  addAttributes() {
    return {
      taskId: { default: null },
      taskTitle: { default: '' },
      taskStatus: { default: 'pending' },
      taskPriority: { default: 'medium' },
      taskType: { default: 'task' },
      taskNumber: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="task-mention"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const getStatusLabel = (status: string): string => {
      const labels: Record<string, string> = {
        pending: 'En attente',
        in_progress: 'En cours',
        review: 'En revue',
        completed: 'Terminée',
        cancelled: 'Annulée',
      };
      return labels[status] || status;
    };

    const getPriorityIcon = (priority: string): string => {
      const icons: Record<string, string> = {
        low: '⬇️',
        medium: '➡️',
        high: '⬆️',
        urgent: '🔥',
      };
      return icons[priority] || '➡️';
    };

    const statusLabel = getStatusLabel(HTMLAttributes['taskStatus']);
    const priorityIcon = getPriorityIcon(HTMLAttributes['taskPriority']);
    const taskType = HTMLAttributes['taskType'] || 'task';
    const taskNumber = HTMLAttributes['taskNumber'] ? `#${HTMLAttributes['taskNumber']}` : '';
    const taskTitle = HTMLAttributes['taskTitle'] || 'Sans titre';

    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'task-mention',
        'data-task-id': HTMLAttributes['taskId'],
        class: 'task-mention-node',
      }),
      [
        'div',
        { class: 'task-mention-card' },
        [
          'div',
          { class: 'task-mention-header' },
          [
            'span',
            { class: `task-type-badge task-type-${taskType}` },
            taskType.toUpperCase(),
          ],
          [
            'span',
            { class: `task-status-badge task-status-${HTMLAttributes['taskStatus']}` },
            statusLabel,
          ],
          [
            'span',
            { class: `task-priority-badge task-priority-${HTMLAttributes['taskPriority']}` },
            priorityIcon,
          ],
        ],
        [
          'div',
          { class: 'task-mention-content' },
          [
            'span',
            { class: 'task-number' },
            taskNumber,
          ],
          [
            'span',
            { class: 'task-title' },
            taskTitle,
          ],
        ],
      ],
    ];
  },

  addCommands() {
    return {
      insertTaskMention:
        (attrs: TaskMentionAttributes) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ({ commands }: { commands: any }) => {
          return commands.insertContent({ type: this.name, attrs });
        },
      updateTaskMention:
        (taskId: string, attrs: Partial<TaskMentionAttributes>) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ({ tr, state }: { tr: any; state: any }) => {
          let found = false;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          state.doc.descendants((node: any, pos: number) => {
            if (node.type.name === this.name && node.attrs.taskId === taskId) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
              found = true;
            }
          });
          return found;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('taskMentionClick'),
        props: {
          handleClick: (_view, _pos, event) => {
            const target = event.target as HTMLElement;
            const taskMentionNode = target.closest('.task-mention-node');
            if (taskMentionNode && this.options.onTaskClick) {
              const taskId = taskMentionNode.getAttribute('data-task-id');
              if (taskId) {
                event.preventDefault();
                this.options.onTaskClick(taskId);
                return true;
              }
            }
            return false;
          },
        },
      }),
    ];
  },
});
