import { Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

// ============================================================================
// Type declarations
// ============================================================================

export interface AccordionGroupOptions {
  HTMLAttributes: Record<string, string>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    accordionGroup: {
      insertAccordion: (items?: number) => ReturnType;
      addAccordionItem: () => ReturnType;
    };
  }
}

// ============================================================================
// Plugin key for accordion interactions
// ============================================================================

const accordionPluginKey = new PluginKey('accordionPlugin');

// ============================================================================
// AccordionGroup Node
// ============================================================================

export const AccordionGroup = Node.create<AccordionGroupOptions>({
  name: 'accordionGroup',

  group: 'block',

  content: 'accordionItem+',

  defining: true,

  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="accordion-group"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'accordion-group',
        class: 'tiptap-accordion-group',
      }),
      0,
      [
        'button',
        {
          'data-accordion-add': 'true',
          class: 'accordion-add-button',
          contenteditable: 'false',
          type: 'button',
        },
        [
          'span',
          { class: 'material-icons-outlined accordion-add-icon' },
          'add',
        ],
        ['span', {}, 'Ajouter un élément'],
      ],
    ];
  },

  addCommands() {
    return {
      insertAccordion:
        (items = 1) =>
        ({ chain, state }) => {
          const { $from } = state.selection;

          // Prevent nesting accordions inside accordions
          for (let d = $from.depth; d > 0; d--) {
            const node = $from.node(d);
            if (
              node.type.name === 'accordionGroup' ||
              node.type.name === 'accordionItem' ||
              node.type.name === 'accordionTitle' ||
              node.type.name === 'accordionContent'
            ) {
              return false;
            }
          }

          const accordionItems = [];
          for (let i = 0; i < items; i++) {
            accordionItems.push({
              type: 'accordionItem',
              content: [
                {
                  type: 'accordionTitle',
                  content: [],
                },
                {
                  type: 'accordionContent',
                  content: [{ type: 'paragraph' }],
                },
              ],
            });
          }

          return chain()
            .insertContent({
              type: 'accordionGroup',
              content: accordionItems,
            })
            .run();
        },

      addAccordionItem:
        () =>
        ({ state, chain }) => {
          const { $from } = state.selection;

          // Find the accordionGroup ancestor
          let groupPos = -1;
          let groupNode = null;
          for (let d = $from.depth; d > 0; d--) {
            const node = $from.node(d);
            if (node.type.name === 'accordionGroup') {
              groupPos = $from.before(d);
              groupNode = node;
              break;
            }
          }

          if (groupPos === -1 || !groupNode) {
            return false;
          }

          // Insert new item at the end of the group
          const insertPos = groupPos + groupNode.nodeSize - 1;

          return chain()
            .command(({ tr }) => {
              const newItem = state.schema.nodes['accordionItem'].create(
                null,
                [
                  state.schema.nodes['accordionTitle'].create(),
                  state.schema.nodes['accordionContent'].create(null, [
                    state.schema.nodes['paragraph'].create(),
                  ]),
                ]
              );
              tr.insert(insertPos, newItem);
              return true;
            })
            .run();
        },
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        key: accordionPluginKey,
        props: {
          handleClickOn(view, pos, node, nodePos, event) {
            const target = event.target as HTMLElement;

            // Handle click on add button
            if (
              target.closest('[data-accordion-add]')
            ) {
              event.preventDefault();
              event.stopPropagation();
              editor.commands.addAccordionItem();
              return true;
            }

            // Handle click on toggle chevron
            if (target.closest('.accordion-toggle-icon')) {
              event.preventDefault();
              event.stopPropagation();
              const itemEl = target.closest('.tiptap-accordion-item');
              if (itemEl) {
                itemEl.classList.toggle('accordion-collapsed');
              }
              return true;
            }

            // Handle click on accordion title bar (but not on editable text)
            if (
              target.closest('.tiptap-accordion-title') &&
              !target.closest('.accordion-title-text')
            ) {
              // If clicking on the icon badge, emit event for popover
              if (target.closest('.accordion-icon')) {
                event.preventDefault();
                event.stopPropagation();

                // Find the accordionTitle node position
                const $pos = view.state.doc.resolve(pos);
                let titlePos = -1;
                for (let d = $pos.depth; d > 0; d--) {
                  if ($pos.node(d).type.name === 'accordionTitle') {
                    titlePos = $pos.before(d);
                    break;
                  }
                }

                // Dispatch custom event for Angular component to handle
                const iconEl = target.closest('.accordion-icon') as HTMLElement;
                const rect = iconEl.getBoundingClientRect();
                const customEvent = new CustomEvent('accordion-icon-edit', {
                  bubbles: true,
                  detail: {
                    pos: titlePos,
                    rect: {
                      top: rect.top,
                      left: rect.left,
                      bottom: rect.bottom,
                      right: rect.right,
                    },
                  },
                });
                view.dom.dispatchEvent(customEvent);
                return true;
              }

              // Otherwise toggle collapse
              event.preventDefault();
              event.stopPropagation();
              const itemEl = target.closest('.tiptap-accordion-item');
              if (itemEl) {
                itemEl.classList.toggle('accordion-collapsed');
              }
              return true;
            }

            return false;
          },
        },
      }),
    ];
  },
});

// ============================================================================
// AccordionItem Node
// ============================================================================

export const AccordionItem = Node.create({
  name: 'accordionItem',

  content: 'accordionTitle accordionContent',

  isolating: true,

  parseHTML() {
    return [
      {
        tag: 'div[data-type="accordion-item"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'accordion-item',
        class: 'tiptap-accordion-item',
      }),
      0,
    ];
  },
});

// ============================================================================
// AccordionTitle Node
// ============================================================================

export const AccordionTitle = Node.create({
  name: 'accordionTitle',

  content: 'inline*',

  defining: true,

  addAttributes() {
    return {
      icon: {
        default: 'description',
        parseHTML: (element) => element.getAttribute('data-icon') || 'description',
        renderHTML: (attributes) => ({
          'data-icon': attributes['icon'],
        }),
      },
      iconColor: {
        default: '#3b82f6',
        parseHTML: (element) => element.getAttribute('data-icon-color') || '#3b82f6',
        renderHTML: (attributes) => ({
          'data-icon-color': attributes['iconColor'],
        }),
      },
      titleColor: {
        default: '#1f2937',
        parseHTML: (element) => element.getAttribute('data-title-color') || '#1f2937',
        renderHTML: (attributes) => ({
          'data-title-color': attributes['titleColor'],
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="accordion-title"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const icon = node.attrs['icon'] || 'description';
    const iconColor = node.attrs['iconColor'] || '#3b82f6';
    const titleColor = node.attrs['titleColor'] || '#1f2937';

    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'accordion-title',
        class: 'tiptap-accordion-title',
      }),
      // Chevron toggle (non-editable)
      [
        'span',
        {
          class: 'accordion-toggle-icon material-icons-outlined',
          contenteditable: 'false',
        },
        'expand_more',
      ],
      // Icon badge (non-editable)
      [
        'span',
        {
          class: 'accordion-icon',
          contenteditable: 'false',
          style: `background-color: ${iconColor}20; color: ${iconColor};`,
        },
        ['span', { class: 'material-icons-outlined' }, icon],
      ],
      // Editable title text (content hole)
      [
        'span',
        {
          class: 'accordion-title-text',
          style: `color: ${titleColor};`,
        },
        0,
      ],
    ];
  },
});

// ============================================================================
// AccordionContent Node
// ============================================================================

export const AccordionContent = Node.create({
  name: 'accordionContent',

  content: 'block+',

  isolating: true,

  parseHTML() {
    return [
      {
        tag: 'div[data-type="accordion-content"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'accordion-content',
        class: 'tiptap-accordion-content',
      }),
      0,
    ];
  },
});
