/**
 * Recursive TipTap JSON to Markdown converter
 */
/**
 * Convert TipTap JSON content to Markdown string
 */
export function convertToMarkdown(content) {
    if (!content || !content.type)
        return '';
    const node = content;
    try {
        return renderNode(node).trim();
    }
    catch {
        return '[Error converting document to Markdown]';
    }
}
function renderNode(node, context) {
    switch (node.type) {
        case 'doc':
            return renderChildren(node);
        case 'paragraph':
            return renderInlineContent(node) + '\n\n';
        case 'heading': {
            const level = node.attrs?.level || 1;
            const prefix = '#'.repeat(level);
            return `${prefix} ${renderInlineContent(node)}\n\n`;
        }
        case 'text':
            return applyMarks(node.text || '', node.marks);
        case 'hardBreak':
            return '  \n';
        case 'horizontalRule':
            return '---\n\n';
        // Lists
        case 'bulletList':
            return renderList(node, 'bullet', context?.depth ?? 0);
        case 'orderedList':
            return renderList(node, 'ordered', context?.depth ?? 0);
        case 'listItem':
            return renderListItem(node, context);
        case 'taskList':
            return renderTaskList(node, context?.depth ?? 0);
        case 'taskItem':
            return renderTaskItem(node, context);
        // Blockquote
        case 'blockquote':
            return renderBlockquote(node);
        // Code block
        case 'codeBlock': {
            const lang = node.attrs?.language || '';
            const code = getTextContent(node);
            return `\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
        }
        // Table
        case 'table':
            return renderTable(node);
        case 'tableRow':
        case 'tableHeader':
        case 'tableCell':
            return renderInlineContent(node);
        // Image
        case 'image': {
            const src = node.attrs?.src || '';
            const alt = node.attrs?.alt || '';
            const caption = node.attrs?.caption || '';
            let md = `![${alt}](${src})`;
            if (caption)
                md += `\n*${caption}*`;
            return md + '\n\n';
        }
        // Accordion
        case 'accordionGroup':
            return renderChildren(node);
        case 'accordionItem':
            return renderChildren(node);
        case 'accordionTitle':
            return `**${renderInlineContent(node)}**\n\n`;
        case 'accordionContent':
            return renderChildren(node);
        // Columns
        case 'columns':
            return renderColumns(node);
        case 'column':
            return renderChildren(node);
        // Database Table (atomic)
        case 'databaseTable': {
            const config = node.attrs?.config;
            const name = config?.name || 'Database';
            const dbId = node.attrs?.databaseId || '';
            return `> **[Database: ${name}]**\n> Use \`get_database_rows\` to view data (ID: \`${dbId}\`)\n\n`;
        }
        // Spreadsheet (atomic)
        case 'spreadsheet': {
            const sConfig = node.attrs?.config;
            const sName = sConfig?.name || 'Spreadsheet';
            const ssId = node.attrs?.spreadsheetId || '';
            return `> **[Spreadsheet: ${sName}]**\n> Use \`get_cells\` to view data (ID: \`${ssId}\`)\n\n`;
        }
        // Mindmap (atomic)
        case 'mindmap': {
            const mmId = node.attrs?.mindmapId || '';
            return `> **[Mind Map]** (ID: \`${mmId}\`)\n\n`;
        }
        // Task Mention (atomic)
        case 'taskMention': {
            const num = node.attrs?.taskNumber;
            const title = node.attrs?.taskTitle || '';
            const status = node.attrs?.taskStatus || '';
            const priority = node.attrs?.taskPriority || '';
            return `**[#${num} ${title} (${status}, ${priority})]**\n\n`;
        }
        // Task Section (atomic)
        case 'taskSection':
            return '> **[Task section linked to this document]**\n\n';
        default:
            // Fallback: try to render children, or show a placeholder
            if (node.content) {
                return renderChildren(node);
            }
            return `[Unknown block: ${node.type}]\n\n`;
    }
}
// =============================================================================
// Inline content rendering
// =============================================================================
function renderInlineContent(node) {
    if (!node.content)
        return '';
    return node.content.map(child => renderNode(child)).join('').trim();
}
function renderChildren(node) {
    if (!node.content)
        return '';
    return node.content.map(child => renderNode(child)).join('');
}
function getTextContent(node) {
    if (node.text)
        return node.text;
    if (!node.content)
        return '';
    return node.content.map(child => getTextContent(child)).join('');
}
// =============================================================================
// Marks
// =============================================================================
function applyMarks(text, marks) {
    if (!marks || marks.length === 0)
        return text;
    let result = text;
    for (const mark of marks) {
        switch (mark.type) {
            case 'bold':
                result = `**${result}**`;
                break;
            case 'italic':
                result = `*${result}*`;
                break;
            case 'strike':
                result = `~~${result}~~`;
                break;
            case 'code':
                result = `\`${result}\``;
                break;
            case 'link': {
                const href = mark.attrs?.href || '';
                result = `[${result}](${href})`;
                break;
            }
            // textStyle, highlight, fontSize, fontFamily — no MD equivalent, ignore
            default:
                break;
        }
    }
    return result;
}
// =============================================================================
// Lists
// =============================================================================
function renderList(node, type, depth) {
    if (!node.content)
        return '';
    return node.content.map((item, index) => renderNode(item, { listType: type, listIndex: index + 1, depth })).join('') + (depth === 0 ? '\n' : '');
}
function renderListItem(node, context) {
    const indent = '  '.repeat(context?.depth ?? 0);
    const bullet = context?.listType === 'ordered' ? `${context?.listIndex ?? 1}. ` : '- ';
    if (!node.content)
        return `${indent}${bullet}\n`;
    const parts = [];
    for (let i = 0; i < node.content.length; i++) {
        const child = node.content[i];
        if (child.type === 'paragraph') {
            const text = renderInlineContent(child);
            if (i === 0) {
                parts.push(`${indent}${bullet}${text}\n`);
            }
            else {
                parts.push(`${indent}  ${text}\n`);
            }
        }
        else if (child.type === 'bulletList' || child.type === 'orderedList') {
            parts.push(renderNode(child, { depth: (context?.depth ?? 0) + 1 }));
        }
        else {
            parts.push(renderNode(child));
        }
    }
    return parts.join('');
}
function renderTaskList(node, depth) {
    if (!node.content)
        return '';
    return node.content.map(item => renderNode(item, { depth })).join('') + (depth === 0 ? '\n' : '');
}
function renderTaskItem(node, context) {
    const indent = '  '.repeat(context?.depth ?? 0);
    const checked = node.attrs?.checked ? 'x' : ' ';
    if (!node.content)
        return `${indent}- [${checked}] \n`;
    const parts = [];
    for (let i = 0; i < node.content.length; i++) {
        const child = node.content[i];
        if (child.type === 'paragraph') {
            const text = renderInlineContent(child);
            if (i === 0) {
                parts.push(`${indent}- [${checked}] ${text}\n`);
            }
            else {
                parts.push(`${indent}  ${text}\n`);
            }
        }
        else if (child.type === 'taskList') {
            parts.push(renderTaskList(child, (context?.depth ?? 0) + 1));
        }
        else {
            parts.push(renderNode(child));
        }
    }
    return parts.join('');
}
// =============================================================================
// Blockquote
// =============================================================================
function renderBlockquote(node) {
    const inner = renderChildren(node).trim();
    return inner.split('\n').map(line => `> ${line}`).join('\n') + '\n\n';
}
// =============================================================================
// Table
// =============================================================================
function renderTable(node) {
    if (!node.content)
        return '';
    const rows = node.content.filter(n => n.type === 'tableRow');
    if (rows.length === 0)
        return '';
    const tableData = [];
    for (const row of rows) {
        if (!row.content)
            continue;
        const cells = [];
        for (const cell of row.content) {
            cells.push(renderInlineContent(cell).replace(/\|/g, '\\|').replace(/\n/g, ' '));
        }
        tableData.push(cells);
    }
    if (tableData.length === 0)
        return '';
    // Compute column widths
    const colCount = Math.max(...tableData.map(row => row.length));
    const colWidths = Array.from({ length: colCount }, () => 3);
    for (const row of tableData) {
        for (let i = 0; i < row.length; i++) {
            colWidths[i] = Math.max(colWidths[i], row[i].length);
        }
    }
    const formatRow = (cells) => {
        const padded = Array.from({ length: colCount }, (_, i) => (cells[i] || '').padEnd(colWidths[i]));
        return `| ${padded.join(' | ')} |`;
    };
    const separator = `| ${colWidths.map(w => '-'.repeat(w)).join(' | ')} |`;
    const lines = [];
    lines.push(formatRow(tableData[0]));
    lines.push(separator);
    for (let i = 1; i < tableData.length; i++) {
        lines.push(formatRow(tableData[i]));
    }
    return lines.join('\n') + '\n\n';
}
// =============================================================================
// Columns
// =============================================================================
function renderColumns(node) {
    if (!node.content)
        return '';
    const parts = [];
    for (let i = 0; i < node.content.length; i++) {
        if (i > 0)
            parts.push('---\n\n');
        parts.push(renderChildren(node.content[i]));
    }
    return parts.join('');
}
//# sourceMappingURL=tiptap-to-markdown.js.map