import { generateHTML } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import FontFamily from '@tiptap/extension-font-family';
import { AccordionGroup, AccordionItem, AccordionTitle, AccordionContent, Columns, Column, EnhancedImage, DatabaseTable, SpreadsheetNode, MindmapNode, TaskMention, TaskSection, } from './tiptap-extensions.js';
import { getPrintStyles } from './print-styles.js';
const extensions = [
    StarterKit.configure({
        codeBlock: false,
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    CodeBlockLowlight,
    FontFamily,
    // Custom extensions
    AccordionGroup,
    AccordionItem,
    AccordionTitle,
    AccordionContent,
    Columns,
    Column,
    EnhancedImage,
    DatabaseTable,
    SpreadsheetNode,
    MindmapNode,
    TaskMention,
    TaskSection,
];
/**
 * Convert TipTap JSON content to HTML string (fragment only, no styles)
 */
export function convertToHtml(content) {
    if (!content || !content.type)
        return '';
    try {
        return generateHTML(content, extensions);
    }
    catch {
        return `<!-- Error converting document to HTML -->`;
    }
}
/**
 * Convert TipTap JSON content to a full styled HTML document
 * suitable for printing / PDF export via browser.
 */
export function convertToStyledHtml(content, title) {
    const htmlBody = convertToHtml(content);
    const escapedTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapedTitle}</title>
  <style>
    ${getPrintStyles()}
  </style>
</head>
<body>
  <h1 class="document-title">${escapedTitle}</h1>
  <div class="document-content">
    ${htmlBody}
  </div>
</body>
</html>`;
}
//# sourceMappingURL=tiptap-to-html.js.map