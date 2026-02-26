import { Node, mergeAttributes } from '@tiptap/core';

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
      addAccordionItemAt: (groupPos: number) => ReturnType;
      deleteAccordionItem: (itemPos: number) => ReturnType;
    };
  }
}

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
    ];
  },

  addNodeView() {
    const editor = this.editor;

    return ({ HTMLAttributes, getPos }) => {
      const dom = document.createElement('div');
      dom.setAttribute('data-type', 'accordion-group');
      dom.classList.add('tiptap-accordion-group');

      const mergedAttrs = mergeAttributes(this.options.HTMLAttributes, HTMLAttributes);
      Object.entries(mergedAttrs).forEach(([key, value]) => {
        if (key === 'class') {
          String(value).split(' ').filter(Boolean).forEach(cls => dom.classList.add(cls));
        } else if (value !== null && value !== undefined) {
          dom.setAttribute(key, String(value));
        }
      });

      // Content area
      const contentDOM = document.createElement('div');
      contentDOM.classList.add('accordion-group-content');
      dom.appendChild(contentDOM);

      // Add button
      const addButton = document.createElement('button');
      addButton.classList.add('accordion-add-button');
      addButton.setAttribute('type', 'button');
      addButton.contentEditable = 'false';

      const addIcon = document.createElement('span');
      addIcon.classList.add('material-icons-outlined', 'accordion-add-icon');
      addIcon.textContent = 'add';
      addButton.appendChild(addIcon);

      const addLabel = document.createElement('span');
      addLabel.textContent = 'Ajouter un élément';
      addButton.appendChild(addLabel);

      dom.appendChild(addButton);

      addButton.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
      });

      addButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        const pos = typeof getPos === 'function' ? getPos() : undefined;
        if (pos !== undefined) {
          editor.commands.addAccordionItemAt(pos);
        }
      });

      return {
        dom,
        contentDOM,
        update: (updatedNode) => {
          return updatedNode.type.name === 'accordionGroup';
        },
      };
    };
  },

  addCommands() {
    return {
      insertAccordion:
        (items = 1) =>
        ({ chain, state }) => {
          const { $from } = state.selection;

          // Prevent nesting
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

      addAccordionItemAt:
        (groupPos: number) =>
        ({ state, tr, dispatch }) => {
          const groupNode = state.doc.nodeAt(groupPos);
          if (!groupNode || groupNode.type.name !== 'accordionGroup') {
            return false;
          }

          const insertPos = groupPos + groupNode.nodeSize - 1;

          const newItem = state.schema.nodes['accordionItem'].create(
            null,
            [
              state.schema.nodes['accordionTitle'].create(),
              state.schema.nodes['accordionContent'].create(null, [
                state.schema.nodes['paragraph'].create(),
              ]),
            ]
          );

          if (dispatch) {
            tr.insert(insertPos, newItem);
            dispatch(tr);
          }
          return true;
        },

      deleteAccordionItem:
        (itemPos: number) =>
        ({ state, tr, dispatch }) => {
          const resolved = state.doc.resolve(itemPos);
          const itemNode = state.doc.nodeAt(itemPos);
          if (!itemNode || itemNode.type.name !== 'accordionItem') {
            return false;
          }

          // Find the parent accordionGroup
          let groupDepth = -1;
          for (let d = resolved.depth; d >= 0; d--) {
            if (resolved.node(d).type.name === 'accordionGroup') {
              groupDepth = d;
              break;
            }
          }

          if (groupDepth < 0) {
            return false;
          }

          const groupNode = resolved.node(groupDepth);
          const groupPos = resolved.before(groupDepth);
          const itemCount = groupNode.childCount;

          if (dispatch) {
            if (itemCount <= 1) {
              // Last item: replace the entire group with a paragraph
              const paragraph = state.schema.nodes['paragraph'].create();
              tr.replaceWith(groupPos, groupPos + groupNode.nodeSize, paragraph);
            } else {
              // Multiple items: delete only this item
              const from = itemPos;
              const to = itemPos + itemNode.nodeSize;
              tr.delete(from, to);
            }
            dispatch(tr);
          }
          return true;
        },
    };
  },
});

// ============================================================================
// AccordionItem Node — plain renderHTML (no nodeView)
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
// Collapsed state is stored as a ProseMirror node ATTRIBUTE so it survives
// nodeView destroy/recreate cycles. CSS handles the visual collapse via the
// adjacent sibling selector: [data-collapsed="true"] + .tiptap-accordion-content
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
      collapsed: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-collapsed') === 'true',
        renderHTML: (attributes) => ({
          'data-collapsed': attributes['collapsed'] ? 'true' : 'false',
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

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'accordion-title',
        class: 'tiptap-accordion-title',
      }),
      0,
    ];
  },

  addNodeView() {
    return ({ node, HTMLAttributes, getPos, editor: nodeEditor }) => {
      // Read collapsed state from the node attribute (persists across recreations)
      const collapsed = !!node.attrs['collapsed'];

      const dom = document.createElement('div');
      dom.setAttribute('data-type', 'accordion-title');
      dom.classList.add('tiptap-accordion-title');
      dom.setAttribute('data-collapsed', collapsed ? 'true' : 'false');

      const mergedAttrs = mergeAttributes(HTMLAttributes);
      Object.entries(mergedAttrs).forEach(([key, value]) => {
        if (key === 'class') {
          String(value).split(' ').filter(Boolean).forEach(cls => dom.classList.add(cls));
        } else if (value !== null && value !== undefined) {
          dom.setAttribute(key, String(value));
        }
      });

      const icon = node.attrs['icon'] || 'description';
      const iconColor = node.attrs['iconColor'] || '#3b82f6';
      const titleColor = node.attrs['titleColor'] || '#1f2937';

      // Chevron toggle
      const chevron = document.createElement('span');
      chevron.classList.add('accordion-toggle-icon', 'material-icons-outlined');
      chevron.contentEditable = 'false';
      chevron.textContent = 'expand_more';
      chevron.style.transform = collapsed ? 'rotate(-90deg)' : '';
      dom.appendChild(chevron);

      // Prevent ProseMirror from handling mousedown on chevron
      chevron.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
      });

      // Toggle collapse via ProseMirror transaction (state stored in document)
      chevron.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        const pos = typeof getPos === 'function' ? getPos() : undefined;
        if (pos !== undefined) {
          const currentNode = nodeEditor.state.doc.nodeAt(pos);
          if (currentNode) {
            const currentCollapsed = !!currentNode.attrs['collapsed'];
            nodeEditor.view.dispatch(
              nodeEditor.state.tr.setNodeMarkup(pos, undefined, {
                ...currentNode.attrs,
                collapsed: !currentCollapsed,
              })
            );
          }
        }
      });

      // Icon badge
      const iconBadge = document.createElement('span');
      iconBadge.classList.add('accordion-icon');
      iconBadge.contentEditable = 'false';
      iconBadge.style.backgroundColor = `${iconColor}20`;
      iconBadge.style.color = iconColor;

      const iconInner = document.createElement('span');
      iconInner.classList.add('material-icons-outlined');
      iconInner.textContent = icon;
      iconBadge.appendChild(iconInner);
      dom.appendChild(iconBadge);

      // Prevent ProseMirror from handling mousedown on icon badge
      iconBadge.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
      });

      // Open popover on click
      iconBadge.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();

        const pos = typeof getPos === 'function' ? getPos() : undefined;
        const rect = iconBadge.getBoundingClientRect();

        const customEvent = new CustomEvent('accordion-icon-edit', {
          bubbles: true,
          detail: {
            pos: pos !== undefined ? pos : -1,
            rect: {
              top: rect.top,
              left: rect.left,
              bottom: rect.bottom,
              right: rect.right,
            },
          },
        });
        nodeEditor.view.dom.dispatchEvent(customEvent);
      });

      // Editable title text (content hole)
      const contentDOM = document.createElement('span');
      contentDOM.classList.add('accordion-title-text');
      contentDOM.style.color = titleColor;
      dom.appendChild(contentDOM);

      // Delete button
      const deleteButton = document.createElement('button');
      deleteButton.classList.add('accordion-delete-button');
      deleteButton.setAttribute('type', 'button');
      deleteButton.contentEditable = 'false';

      const deleteIcon = document.createElement('span');
      deleteIcon.classList.add('material-icons-outlined');
      deleteIcon.textContent = 'delete_outline';
      deleteButton.appendChild(deleteIcon);
      dom.appendChild(deleteButton);

      // Prevent ProseMirror from handling mousedown on delete button
      deleteButton.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
      });

      // Dispatch custom event on click to open confirm dialog in Angular
      deleteButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();

        const titlePos = typeof getPos === 'function' ? getPos() : undefined;
        if (titlePos === undefined) return;

        // Resolve position to find the parent accordionItem
        const resolvedPos = nodeEditor.state.doc.resolve(titlePos);
        let itemPos = -1;
        for (let d = resolvedPos.depth; d >= 0; d--) {
          if (resolvedPos.node(d).type.name === 'accordionItem') {
            itemPos = resolvedPos.before(d);
            break;
          }
        }

        if (itemPos >= 0) {
          const customEvent = new CustomEvent('accordion-delete-item', {
            bubbles: true,
            detail: { itemPos },
          });
          nodeEditor.view.dom.dispatchEvent(customEvent);
        }
      });

      return {
        dom,
        contentDOM,
        update: (updatedNode) => {
          if (updatedNode.type.name !== 'accordionTitle') {
            return false;
          }

          const newCollapsed = !!updatedNode.attrs['collapsed'];
          const newIcon = updatedNode.attrs['icon'] || 'description';
          const newIconColor = updatedNode.attrs['iconColor'] || '#3b82f6';
          const newTitleColor = updatedNode.attrs['titleColor'] || '#1f2937';

          // Update collapsed visual state
          dom.setAttribute('data-collapsed', newCollapsed ? 'true' : 'false');
          chevron.style.transform = newCollapsed ? 'rotate(-90deg)' : '';

          // Update icon/color attrs
          iconInner.textContent = newIcon;
          iconBadge.style.backgroundColor = `${newIconColor}20`;
          iconBadge.style.color = newIconColor;
          contentDOM.style.color = newTitleColor;

          dom.setAttribute('data-icon', newIcon);
          dom.setAttribute('data-icon-color', newIconColor);
          dom.setAttribute('data-title-color', newTitleColor);

          return true;
        },
        destroy: () => { /* noop */ },
      };
    };
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
