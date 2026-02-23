import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { mergeAttributes } from '@tiptap/core';

function buildStyleString(attrs: Record<string, unknown>): string {
  const parts: string[] = [];

  if (attrs['backgroundColor']) {
    parts.push(`background-color: ${attrs['backgroundColor']} !important`);
  }

  const borderColor = attrs['borderColor'] as string | null;
  const borderWidth = attrs['borderWidth'] as string | null;

  if (borderWidth === '0px') {
    parts.push('border: none !important');
  } else if (borderColor || borderWidth) {
    const w = borderWidth || '1px';
    const c = borderColor || '#e5e7eb';
    parts.push(`border: ${w} solid ${c} !important`);
  }

  return parts.join('; ');
}

export const CustomTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: { default: null },
      borderColor: { default: null },
      borderWidth: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'td',
        getAttrs: (element) => {
          const dom = element as HTMLElement;
          return {
            backgroundColor: dom.style.backgroundColor || null,
            borderColor: dom.style.borderColor || null,
            borderWidth: dom.style.borderWidth || null,
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const style = buildStyleString(node.attrs);
    const attrs = style
      ? mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { style })
      : mergeAttributes(this.options.HTMLAttributes, HTMLAttributes);
    return ['td', attrs, 0];
  },
});

export const CustomTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: { default: null },
      borderColor: { default: null },
      borderWidth: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'th',
        getAttrs: (element) => {
          const dom = element as HTMLElement;
          return {
            backgroundColor: dom.style.backgroundColor || null,
            borderColor: dom.style.borderColor || null,
            borderWidth: dom.style.borderWidth || null,
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const style = buildStyleString(node.attrs);
    const attrs = style
      ? mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { style })
      : mergeAttributes(this.options.HTMLAttributes, HTMLAttributes);
    return ['th', attrs, 0];
  },
});
