/**
 * Markdown to TipTap JSON converter
 *
 * Parses common markdown syntax and produces valid TipTap JSON nodes.
 * Handles: headings, paragraphs, bold, italic, strike, code, links,
 * bullet/ordered/task lists, code blocks, blockquotes, horizontal rules, tables.
 */

interface TipTapNode {
  type: string;
  content?: TipTapNode[];
  text?: string;
  marks?: TipTapMark[];
  attrs?: Record<string, unknown>;
}

interface TipTapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

/**
 * Convert a markdown string to a TipTap doc node
 */
export function convertMarkdownToTiptap(markdown: string): TipTapNode {
  const lines = markdown.split('\n');
  const nodes: TipTapNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip empty lines
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Code block: ```lang ... ```
    if (line.trim().startsWith('```')) {
      const result = parseCodeBlock(lines, i);
      nodes.push(result.node);
      i = result.nextIndex;
      continue;
    }

    // Horizontal rule: ---, ***, ___
    if (/^(\s*[-*_]\s*){3,}$/.test(line.trim())) {
      nodes.push({ type: 'horizontalRule' });
      i++;
      continue;
    }

    // Heading: # ... to ###### ...
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      nodes.push({
        type: 'heading',
        attrs: { level: headingMatch[1].length },
        content: parseInlineMarkdown(headingMatch[2].trim()),
      });
      i++;
      continue;
    }

    // Blockquote: > ...
    if (line.trim().startsWith('>')) {
      const result = parseBlockquote(lines, i);
      nodes.push(result.node);
      i = result.nextIndex;
      continue;
    }

    // Table: | ... |
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const result = parseTable(lines, i);
      if (result) {
        nodes.push(result.node);
        i = result.nextIndex;
        continue;
      }
    }

    // Task list: - [ ] or - [x]
    if (/^\s*[-*]\s+\[[ xX]\]\s/.test(line)) {
      const result = parseTaskList(lines, i);
      nodes.push(result.node);
      i = result.nextIndex;
      continue;
    }

    // Bullet list: - ... or * ...
    if (/^\s*[-*]\s+/.test(line) && !/^\s*[-*]\s*[-*]\s*[-*]/.test(line)) {
      const result = parseBulletList(lines, i);
      nodes.push(result.node);
      i = result.nextIndex;
      continue;
    }

    // Ordered list: 1. ...
    if (/^\s*\d+\.\s+/.test(line)) {
      const result = parseOrderedList(lines, i);
      nodes.push(result.node);
      i = result.nextIndex;
      continue;
    }

    // Paragraph (default)
    const result = parseParagraph(lines, i);
    nodes.push(result.node);
    i = result.nextIndex;
  }

  return { type: 'doc', content: nodes.length > 0 ? nodes : [{ type: 'paragraph' }] };
}

// =============================================================================
// Code block parser
// =============================================================================

function parseCodeBlock(lines: string[], startIndex: number): { node: TipTapNode; nextIndex: number } {
  const firstLine = lines[startIndex].trim();
  const language = firstLine.replace(/^```/, '').trim() || undefined;
  const codeLines: string[] = [];
  let i = startIndex + 1;

  while (i < lines.length) {
    if (lines[i].trim() === '```') {
      i++;
      break;
    }
    codeLines.push(lines[i]);
    i++;
  }

  const codeText = codeLines.join('\n');
  const node: TipTapNode = {
    type: 'codeBlock',
    attrs: language ? { language } : {},
    content: codeText ? [{ type: 'text', text: codeText }] : [],
  };

  return { node, nextIndex: i };
}

// =============================================================================
// Blockquote parser
// =============================================================================

function parseBlockquote(lines: string[], startIndex: number): { node: TipTapNode; nextIndex: number } {
  const quoteLines: string[] = [];
  let i = startIndex;

  while (i < lines.length && lines[i].trim().startsWith('>')) {
    quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
    i++;
  }

  // Recursively parse the inner content
  const innerDoc = convertMarkdownToTiptap(quoteLines.join('\n'));
  return {
    node: { type: 'blockquote', content: innerDoc.content || [] },
    nextIndex: i,
  };
}

// =============================================================================
// Table parser
// =============================================================================

function parseTable(lines: string[], startIndex: number): { node: TipTapNode; nextIndex: number } | null {
  const tableLines: string[] = [];
  let i = startIndex;

  while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
    tableLines.push(lines[i].trim());
    i++;
  }

  if (tableLines.length < 2) return null;

  // Detect and skip separator line (| --- | --- |)
  const separatorIndex = tableLines.findIndex(l => /^\|[\s\-:|]+\|$/.test(l));

  const dataLines = tableLines.filter((_, idx) => idx !== separatorIndex);
  if (dataLines.length === 0) return null;

  const rows: TipTapNode[] = dataLines.map((line, rowIdx) => {
    const cells = line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map(c => c.trim());

    const isHeader = rowIdx === 0 && separatorIndex === 1;
    const cellType = isHeader ? 'tableHeader' : 'tableCell';

    return {
      type: 'tableRow',
      content: cells.map(cellText => ({
        type: cellType,
        attrs: { colspan: 1, rowspan: 1 },
        content: [{ type: 'paragraph', content: parseInlineMarkdown(cellText) }],
      })),
    };
  });

  return {
    node: { type: 'table', content: rows },
    nextIndex: i,
  };
}

// =============================================================================
// List parsers
// =============================================================================

function parseBulletList(lines: string[], startIndex: number): { node: TipTapNode; nextIndex: number } {
  const items: TipTapNode[] = [];
  let i = startIndex;

  while (i < lines.length) {
    const match = lines[i].match(/^(\s*)[-*]\s+(.+)$/);
    if (!match) break;

    const text = match[2];
    items.push({
      type: 'listItem',
      content: [{ type: 'paragraph', content: parseInlineMarkdown(text) }],
    });
    i++;

    // Handle continuation lines (indented, not a new list item)
    while (i < lines.length && lines[i].match(/^\s+[^-*\d]/) && lines[i].trim() !== '') {
      const lastItem = items[items.length - 1];
      if (lastItem.content) {
        lastItem.content.push({ type: 'paragraph', content: parseInlineMarkdown(lines[i].trim()) });
      }
      i++;
    }
  }

  return {
    node: { type: 'bulletList', content: items },
    nextIndex: i,
  };
}

function parseOrderedList(lines: string[], startIndex: number): { node: TipTapNode; nextIndex: number } {
  const items: TipTapNode[] = [];
  let i = startIndex;

  while (i < lines.length) {
    const match = lines[i].match(/^(\s*)\d+\.\s+(.+)$/);
    if (!match) break;

    const text = match[2];
    items.push({
      type: 'listItem',
      content: [{ type: 'paragraph', content: parseInlineMarkdown(text) }],
    });
    i++;
  }

  return {
    node: { type: 'orderedList', content: items },
    nextIndex: i,
  };
}

function parseTaskList(lines: string[], startIndex: number): { node: TipTapNode; nextIndex: number } {
  const items: TipTapNode[] = [];
  let i = startIndex;

  while (i < lines.length) {
    const match = lines[i].match(/^\s*[-*]\s+\[([xX ])\]\s+(.+)$/);
    if (!match) break;

    const checked = match[1].toLowerCase() === 'x';
    const text = match[2];
    items.push({
      type: 'taskItem',
      attrs: { checked },
      content: [{ type: 'paragraph', content: parseInlineMarkdown(text) }],
    });
    i++;
  }

  return {
    node: { type: 'taskList', content: items },
    nextIndex: i,
  };
}

// =============================================================================
// Paragraph parser
// =============================================================================

function parseParagraph(lines: string[], startIndex: number): { node: TipTapNode; nextIndex: number } {
  const textLines: string[] = [];
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') break;
    // Stop if next line is a block-level element
    if (/^#{1,6}\s/.test(line)) break;
    if (/^\s*[-*]\s+/.test(line)) break;
    if (/^\s*\d+\.\s+/.test(line)) break;
    if (line.trim().startsWith('>')) break;
    if (line.trim().startsWith('```')) break;
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) break;
    if (/^(\s*[-*_]\s*){3,}$/.test(line.trim())) break;

    // Only the first line should be collected without checks (already done at startIndex)
    if (i > startIndex) {
      textLines.push(line);
    } else {
      textLines.push(line);
    }
    i++;
  }

  const fullText = textLines.join(' ').trim();
  const inlineContent = parseInlineMarkdown(fullText);

  return {
    node: { type: 'paragraph', content: inlineContent.length > 0 ? inlineContent : undefined },
    nextIndex: i,
  };
}

// =============================================================================
// Inline parser (bold, italic, strike, code, links)
// =============================================================================

export function parseInlineMarkdown(text: string): TipTapNode[] {
  if (!text) return [];

  const nodes: TipTapNode[] = [];
  // Regex to match inline patterns in order of precedence
  // Match: `code`, [link](url), **bold**, *italic*, ~~strike~~
  const inlineRegex = /(`[^`]+`)|(\[([^\]]+)\]\(([^)]+)\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\~\~[^~]+\~\~)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineRegex.exec(text)) !== null) {
    // Text before the match
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index);
      if (before) {
        nodes.push({ type: 'text', text: before });
      }
    }

    if (match[1]) {
      // Inline code: `code`
      const code = match[1].slice(1, -1);
      nodes.push({ type: 'text', text: code, marks: [{ type: 'code' }] });
    } else if (match[2]) {
      // Link: [text](url)
      const linkText = match[3];
      const href = match[4];
      nodes.push({
        type: 'text',
        text: linkText,
        marks: [{ type: 'link', attrs: { href, target: '_blank' } }],
      });
    } else if (match[5]) {
      // Bold: **text**
      const boldText = match[5].slice(2, -2);
      nodes.push({ type: 'text', text: boldText, marks: [{ type: 'bold' }] });
    } else if (match[6]) {
      // Italic: *text*
      const italicText = match[6].slice(1, -1);
      nodes.push({ type: 'text', text: italicText, marks: [{ type: 'italic' }] });
    } else if (match[7]) {
      // Strikethrough: ~~text~~
      const strikeText = match[7].slice(2, -2);
      nodes.push({ type: 'text', text: strikeText, marks: [{ type: 'strike' }] });
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last match
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex);
    if (remaining) {
      nodes.push({ type: 'text', text: remaining });
    }
  }

  // If no inline patterns were found, return the full text
  if (nodes.length === 0 && text) {
    return [{ type: 'text', text }];
  }

  return nodes;
}
