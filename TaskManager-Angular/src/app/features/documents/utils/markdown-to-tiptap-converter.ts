/**
 * Markdown to TipTap Converter
 * Converts Markdown content to TipTap JSONContent format
 */

import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import type { JSONContent } from '@tiptap/core';

/**
 * Convert Markdown string to TipTap JSONContent
 */
export function convertMarkdownToTipTap(markdown: string): JSONContent {
  if (!markdown || markdown.trim().length === 0) {
    return {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: []
        }
      ]
    };
  }

  const md = new MarkdownIt({
    html: false,        // Disable HTML tags in Markdown
    linkify: true,      // Auto-convert URLs to links
    typographer: true,  // Smart quotes and other typographic replacements
  });

  const tokens = md.parse(markdown, {});
  const content = tokensToTipTapNodes(tokens);

  const result = {
    type: 'doc',
    content: content.length > 0 ? content : [{ type: 'paragraph', content: [] }]
  };

  // Clean up any remaining empty text nodes
  return cleanEmptyTextNodes(result);
}

/**
 * Recursively remove empty text nodes from JSONContent
 */
function cleanEmptyTextNodes(node: JSONContent): JSONContent {
  if (!node) return node;

  // If this is a text node with empty content, mark it for removal
  if (node.type === 'text' && (!node.text || node.text.trim().length === 0)) {
    return null as any; // Will be filtered out
  }

  // If node has content array, recursively clean it
  if (node.content && Array.isArray(node.content)) {
    node.content = node.content
      .map(child => cleanEmptyTextNodes(child))
      .filter(child => child !== null); // Remove null entries
  }

  return node;
}

/**
 * Convert markdown-it tokens to TipTap nodes
 */
function tokensToTipTapNodes(tokens: Token[]): JSONContent[] {
  const nodes: JSONContent[] = [];
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i];

    // Skip closing tokens (handled by opening tokens)
    if (token.nesting === -1) {
      i++;
      continue;
    }

    switch (token.type) {
      case 'heading_open':
        nodes.push(convertHeading(tokens, i));
        i = skipToClosing(tokens, i) + 1;
        break;

      case 'paragraph_open':
        nodes.push(convertParagraph(tokens, i));
        i = skipToClosing(tokens, i) + 1;
        break;

      case 'bullet_list_open':
        nodes.push(convertBulletList(tokens, i));
        i = skipToClosing(tokens, i) + 1;
        break;

      case 'ordered_list_open':
        nodes.push(convertOrderedList(tokens, i));
        i = skipToClosing(tokens, i) + 1;
        break;

      case 'blockquote_open':
        nodes.push(convertBlockquote(tokens, i));
        i = skipToClosing(tokens, i) + 1;
        break;

      case 'fence':
      case 'code_block':
        nodes.push(convertCodeBlock(token));
        i++;
        break;

      case 'hr':
        nodes.push({ type: 'horizontalRule' });
        i++;
        break;

      case 'table_open':
        nodes.push(convertTable(tokens, i));
        i = skipToClosing(tokens, i) + 1;
        break;

      default:
        // Skip unknown tokens
        i++;
    }
  }

  return nodes;
}

/**
 * Convert heading token to TipTap heading node
 */
function convertHeading(tokens: Token[], startIndex: number): JSONContent {
  const openToken = tokens[startIndex];
  const level = parseInt(openToken.tag.substring(1)); // h1 -> 1, h2 -> 2, etc.
  const inlineToken = tokens[startIndex + 1];

  return {
    type: 'heading',
    attrs: { level },
    content: inlineToken ? convertInlineContent(inlineToken) : []
  };
}

/**
 * Convert paragraph token to TipTap paragraph node
 */
function convertParagraph(tokens: Token[], startIndex: number): JSONContent {
  const inlineToken = tokens[startIndex + 1];

  return {
    type: 'paragraph',
    content: inlineToken ? convertInlineContent(inlineToken) : []
  };
}

/**
 * Convert bullet list to TipTap bulletList node
 */
function convertBulletList(tokens: Token[], startIndex: number): JSONContent {
  const endIndex = skipToClosing(tokens, startIndex);
  const listItems = extractListItems(tokens, startIndex + 1, endIndex);

  return {
    type: 'bulletList',
    content: listItems
  };
}

/**
 * Convert ordered list to TipTap orderedList node
 */
function convertOrderedList(tokens: Token[], startIndex: number): JSONContent {
  const endIndex = skipToClosing(tokens, startIndex);
  const listItems = extractListItems(tokens, startIndex + 1, endIndex);

  return {
    type: 'orderedList',
    content: listItems
  };
}

/**
 * Extract list items from tokens
 */
function extractListItems(tokens: Token[], startIndex: number, endIndex: number): JSONContent[] {
  const items: JSONContent[] = [];
  let i = startIndex;

  while (i < endIndex) {
    const token = tokens[i];

    if (token.type === 'list_item_open') {
      const itemEndIndex = skipToClosing(tokens, i);
      const itemContent = tokensToTipTapNodes(tokens.slice(i + 1, itemEndIndex));

      items.push({
        type: 'listItem',
        content: itemContent.length > 0 ? itemContent : [{ type: 'paragraph', content: [] }]
      });

      i = itemEndIndex + 1;
    } else {
      i++;
    }
  }

  return items;
}

/**
 * Convert blockquote to TipTap blockquote node
 */
function convertBlockquote(tokens: Token[], startIndex: number): JSONContent {
  const endIndex = skipToClosing(tokens, startIndex);
  const content = tokensToTipTapNodes(tokens.slice(startIndex + 1, endIndex));

  return {
    type: 'blockquote',
    content: content.length > 0 ? content : [{ type: 'paragraph', content: [] }]
  };
}

/**
 * Convert code block to TipTap codeBlock node
 */
function convertCodeBlock(token: Token): JSONContent {
  const node: JSONContent = {
    type: 'codeBlock',
    content: token.content ? [{ type: 'text', text: token.content }] : []
  };

  // Add language attribute if available
  if (token.info) {
    node.attrs = { language: token.info };
  }

  return node;
}

/**
 * Convert table to TipTap table node
 */
function convertTable(tokens: Token[], startIndex: number): JSONContent {
  const endIndex = skipToClosing(tokens, startIndex);
  const rows: JSONContent[] = [];
  let i = startIndex + 1;

  while (i < endIndex) {
    const token = tokens[i];

    if (token.type === 'thead_open' || token.type === 'tbody_open') {
      const sectionEndIndex = skipToClosing(tokens, i);
      const isHeader = token.type === 'thead_open';

      let j = i + 1;
      while (j < sectionEndIndex) {
        if (tokens[j].type === 'tr_open') {
          const rowEndIndex = skipToClosing(tokens, j);
          const cells = extractTableCells(tokens, j + 1, rowEndIndex, isHeader);
          rows.push({
            type: 'tableRow',
            content: cells
          });
          j = rowEndIndex + 1;
        } else {
          j++;
        }
      }

      i = sectionEndIndex + 1;
    } else {
      i++;
    }
  }

  return {
    type: 'table',
    content: rows.length > 0 ? rows : []
  };
}

/**
 * Extract table cells from tokens
 */
function extractTableCells(tokens: Token[], startIndex: number, endIndex: number, isHeader: boolean): JSONContent[] {
  const cells: JSONContent[] = [];
  let i = startIndex;

  while (i < endIndex) {
    const token = tokens[i];

    if (token.type === 'th_open' || token.type === 'td_open') {
      const cellEndIndex = skipToClosing(tokens, i);
      const inlineToken = tokens[i + 1];
      const content = inlineToken ? convertInlineContent(inlineToken) : [];

      cells.push({
        type: isHeader ? 'tableHeader' : 'tableCell',
        content: content.length > 0 ? [{ type: 'paragraph', content }] : [{ type: 'paragraph', content: [] }]
      });

      i = cellEndIndex + 1;
    } else {
      i++;
    }
  }

  return cells;
}

/**
 * Convert inline content (text with marks like bold, italic, links, etc.)
 */
function convertInlineContent(token: Token): JSONContent[] {
  if (!token.children || token.children.length === 0) {
    return [];
  }

  const nodes: JSONContent[] = [];

  for (const child of token.children) {
    switch (child.type) {
      case 'text':
        // Only add text nodes with non-empty content
        if (child.content && child.content.trim().length > 0) {
          nodes.push({
            type: 'text',
            text: child.content
          });
        }
        break;

      case 'strong_open': {
        const textNodes = extractMarkedText(token.children, child, 'strong_close');
        textNodes.forEach(node => {
          if (node.type === 'text' && node.text) {
            nodes.push({
              type: 'text',
              marks: [{ type: 'bold' }],
              text: node.text
            });
          }
        });
        break;
      }

      case 'em_open': {
        const textNodes = extractMarkedText(token.children, child, 'em_close');
        textNodes.forEach(node => {
          if (node.type === 'text' && node.text) {
            nodes.push({
              type: 'text',
              marks: [{ type: 'italic' }],
              text: node.text
            });
          }
        });
        break;
      }

      case 'code_inline':
        // Only add code nodes with non-empty content
        if (child.content && child.content.trim().length > 0) {
          nodes.push({
            type: 'text',
            marks: [{ type: 'code' }],
            text: child.content
          });
        }
        break;

      case 'link_open': {
        const href = child.attrGet('href') || '';
        const textNodes = extractMarkedText(token.children, child, 'link_close');
        textNodes.forEach(node => {
          if (node.type === 'text' && node.text) {
            nodes.push({
              type: 'text',
              marks: [{ type: 'link', attrs: { href } }],
              text: node.text
            });
          }
        });
        break;
      }

      case 's_open': {
        const textNodes = extractMarkedText(token.children, child, 's_close');
        textNodes.forEach(node => {
          if (node.type === 'text' && node.text) {
            nodes.push({
              type: 'text',
              marks: [{ type: 'strike' }],
              text: node.text
            });
          }
        });
        break;
      }

      case 'hardbreak':
        nodes.push({ type: 'hardBreak' });
        break;

      case 'softbreak':
        // Convert softbreak to space
        nodes.push({ type: 'text', text: ' ' });
        break;
    }
  }

  return nodes;
}

/**
 * Extract text content between opening and closing mark tokens
 */
function extractMarkedText(children: Token[], openToken: Token, closeType: string): JSONContent[] {
  const nodes: JSONContent[] = [];
  const openIndex = children.indexOf(openToken);

  for (let i = openIndex + 1; i < children.length; i++) {
    const child = children[i];

    if (child.type === closeType) {
      break;
    }

    if (child.type === 'text') {
      nodes.push({
        type: 'text',
        text: child.content
      });
    }
  }

  return nodes;
}

/**
 * Skip to the closing token matching the opening token at startIndex
 */
function skipToClosing(tokens: Token[], startIndex: number): number {
  const openToken = tokens[startIndex];
  let depth = 1;
  let i = startIndex + 1;

  while (i < tokens.length && depth > 0) {
    const token = tokens[i];

    // Same type and opening: increase depth
    if (token.type === openToken.type && token.nesting === 1) {
      depth++;
    }
    // Matching closing token: decrease depth
    else if (token.type === openToken.type.replace('_open', '_close') && token.nesting === -1) {
      depth--;
    }

    if (depth === 0) {
      return i;
    }

    i++;
  }

  return i;
}
