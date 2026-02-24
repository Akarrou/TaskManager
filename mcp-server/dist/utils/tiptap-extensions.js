import { Node } from '@tiptap/core';
// =============================================================================
// Accordion extensions
// =============================================================================
export const AccordionGroup = Node.create({
    name: 'accordionGroup',
    group: 'block',
    content: 'accordionItem+',
    defining: true,
    renderHTML() {
        return ['div', { class: 'accordion-group' }, 0];
    },
});
export const AccordionItem = Node.create({
    name: 'accordionItem',
    content: 'accordionTitle accordionContent',
    isolating: true,
    renderHTML() {
        return ['details', { class: 'accordion-item', open: 'true' }, 0];
    },
});
export const AccordionTitle = Node.create({
    name: 'accordionTitle',
    content: 'inline*',
    defining: true,
    addAttributes() {
        return {
            icon: { default: 'description' },
            iconColor: { default: '#3b82f6' },
            titleColor: { default: '#1f2937' },
            collapsed: { default: false },
        };
    },
    renderHTML({ HTMLAttributes }) {
        return ['summary', { class: 'accordion-title', style: `color:${HTMLAttributes.titleColor}` }, 0];
    },
});
export const AccordionContent = Node.create({
    name: 'accordionContent',
    content: 'block+',
    isolating: true,
    renderHTML() {
        return ['div', { class: 'accordion-content' }, 0];
    },
});
// =============================================================================
// Columns extensions
// =============================================================================
export const Columns = Node.create({
    name: 'columns',
    group: 'block',
    content: 'column+',
    defining: true,
    renderHTML() {
        return ['div', { style: 'display:flex;gap:1rem' }, 0];
    },
});
export const Column = Node.create({
    name: 'column',
    content: 'block+',
    isolating: true,
    renderHTML() {
        return ['div', { style: 'flex:1' }, 0];
    },
});
// =============================================================================
// Enhanced Image (overrides standard Image extension)
// =============================================================================
export const EnhancedImage = Node.create({
    name: 'image',
    group: 'block',
    atom: true,
    addAttributes() {
        return {
            src: { default: null },
            alt: { default: null },
            title: { default: null },
            alignment: { default: 'center' },
            caption: { default: '' },
        };
    },
    renderHTML({ HTMLAttributes }) {
        const attrs = HTMLAttributes;
        const imgAttrs = {};
        if (attrs.src)
            imgAttrs.src = attrs.src;
        if (attrs.alt)
            imgAttrs.alt = attrs.alt;
        if (attrs.title)
            imgAttrs.title = attrs.title;
        if (attrs.caption) {
            return ['figure', { style: `text-align:${attrs.alignment || 'center'}` },
                ['img', imgAttrs],
                ['figcaption', {}, attrs.caption],
            ];
        }
        return ['figure', { style: `text-align:${attrs.alignment || 'center'}` },
            ['img', imgAttrs],
        ];
    },
});
// =============================================================================
// Database Table (atomic placeholder)
// =============================================================================
export const DatabaseTable = Node.create({
    name: 'databaseTable',
    group: 'block',
    atom: true,
    addAttributes() {
        return {
            databaseId: { default: '' },
            config: { default: {} },
            storageMode: { default: 'supabase' },
            isLinked: { default: false },
        };
    },
    renderHTML({ HTMLAttributes }) {
        const attrs = HTMLAttributes;
        const config = attrs.config;
        const name = config?.name || 'Database';
        const dbId = attrs.databaseId;
        return ['div', { class: 'database-placeholder', 'data-database-id': dbId },
            ['p', {}, `[Database: ${name}]`],
            ['p', { style: 'font-style:italic;color:#666' }, `Use get_database_rows to view data (ID: ${dbId})`],
        ];
    },
});
// =============================================================================
// Spreadsheet (atomic placeholder)
// =============================================================================
export const SpreadsheetNode = Node.create({
    name: 'spreadsheet',
    group: 'block',
    atom: true,
    addAttributes() {
        return {
            spreadsheetId: { default: '' },
            config: { default: {} },
            storageMode: { default: 'supabase' },
        };
    },
    renderHTML({ HTMLAttributes }) {
        const attrs = HTMLAttributes;
        const config = attrs.config;
        const name = config?.name || 'Spreadsheet';
        const ssId = attrs.spreadsheetId;
        return ['div', { class: 'spreadsheet-placeholder' },
            ['p', {}, `[Spreadsheet: ${name}]`],
            ['p', { style: 'font-style:italic;color:#666' }, `Use get_cells to view data (ID: ${ssId})`],
        ];
    },
});
// =============================================================================
// Mindmap (atomic placeholder)
// =============================================================================
export const MindmapNode = Node.create({
    name: 'mindmap',
    group: 'block',
    atom: true,
    addAttributes() {
        return {
            mindmapId: { default: '' },
            data: { default: {} },
        };
    },
    renderHTML({ HTMLAttributes }) {
        const attrs = HTMLAttributes;
        const mindmapId = attrs.mindmapId;
        return ['div', { class: 'mindmap-placeholder' },
            ['p', {}, `[Mind Map (ID: ${mindmapId})]`],
        ];
    },
});
// =============================================================================
// Task Mention (atomic inline reference)
// =============================================================================
export const TaskMention = Node.create({
    name: 'taskMention',
    group: 'block',
    atom: true,
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
    renderHTML({ HTMLAttributes }) {
        const attrs = HTMLAttributes;
        return ['span', { class: 'task-mention', 'data-task-id': attrs.taskId },
            `[#${attrs.taskNumber} ${attrs.taskTitle} (${attrs.taskStatus}, ${attrs.taskPriority})]`,
        ];
    },
});
// =============================================================================
// Task Section (atomic placeholder)
// =============================================================================
export const TaskSection = Node.create({
    name: 'taskSection',
    group: 'block',
    atom: true,
    addAttributes() {
        return { documentId: { default: null } };
    },
    renderHTML() {
        return ['div', { class: 'task-section' },
            ['p', {}, '[Task section linked to this document]'],
        ];
    },
});
//# sourceMappingURL=tiptap-extensions.js.map