/**
 * Document block operations for partial content updates.
 *
 * These utilities operate on the top-level blocks of a TipTap document,
 * allowing insertion, replacement, and removal by index — so the AI
 * never needs to deal with TipTap JSON directly.
 */
// =============================================================================
// Complex block detection
// =============================================================================
const COMPLEX_BLOCK_TYPES = new Set([
    'columns',
    'accordionGroup',
    'databaseTable',
    'spreadsheet',
    'mindmap',
]);
/**
 * Returns true if the document content contains any complex blocks
 * that would be destroyed by a full content replacement.
 */
export function hasComplexBlocks(content) {
    const doc = content;
    if (!doc || !Array.isArray(doc.content))
        return false;
    return doc.content.some((node) => COMPLEX_BLOCK_TYPES.has(node.type));
}
/**
 * Returns the list of complex block types found in a document.
 */
export function getComplexBlockTypes(content) {
    const doc = content;
    if (!doc || !Array.isArray(doc.content))
        return [];
    const types = new Set();
    for (const node of doc.content) {
        if (COMPLEX_BLOCK_TYPES.has(node.type)) {
            types.add(mapTiptapTypeToReadable(node.type));
        }
    }
    return [...types];
}
// =============================================================================
// Block ID lookup
// =============================================================================
/**
 * Find the top-level block index by its blockId attribute.
 * Returns null if no block with that ID is found.
 */
export function findBlockIndexByBlockId(doc, blockId) {
    if (!doc.content)
        return null;
    for (let i = 0; i < doc.content.length; i++) {
        if (doc.content[i].attrs?.blockId === blockId) {
            return i;
        }
    }
    return null;
}
// =============================================================================
// Heading search
// =============================================================================
/**
 * Find headings in a document by text (case-insensitive substring match).
 */
export function findHeadingMatches(doc, search) {
    if (!doc.content)
        return [];
    const needle = search.toLowerCase();
    const matches = [];
    for (let i = 0; i < doc.content.length; i++) {
        const node = doc.content[i];
        if (node.type !== 'heading')
            continue;
        const text = extractText(node).trim();
        if (text.toLowerCase().includes(needle)) {
            matches.push({
                index: i,
                level: node.attrs?.level || 1,
                text,
            });
        }
    }
    return matches;
}
// =============================================================================
// Edit operations engine
// =============================================================================
/**
 * Resolve a target (number index or heading text) to a numeric index.
 * Returns the index or null if not found, plus any warnings.
 */
function resolveTarget(doc, target, label) {
    const warnings = [];
    if (target === undefined || target === null) {
        return { index: null, warnings };
    }
    if (typeof target === 'number') {
        const total = doc.content?.length || 0;
        if (target < 0 || target >= total) {
            const clamped = Math.max(0, Math.min(target, total - 1));
            warnings.push(`${label} index ${target} out of range (0-${total - 1}), clamped to ${clamped}`);
            return { index: clamped, warnings };
        }
        return { index: target, warnings };
    }
    // String: search for heading
    const matches = findHeadingMatches(doc, target);
    if (matches.length === 0) {
        warnings.push(`${label} heading "${target}" not found`);
        return { index: null, warnings };
    }
    if (matches.length > 1) {
        const list = matches.map((m) => `[${m.index}] "${m.text}"`).join(', ');
        warnings.push(`${label} heading "${target}" matched ${matches.length} headings (${list}), using first`);
    }
    return { index: matches[0].index, warnings };
}
/**
 * Apply a list of edit operations to a TipTap document.
 * Operations are sorted by target index and applied with cumulative delta adjustment.
 */
export function applyEditOperations(doc, operations) {
    const warnings = [];
    let workingDoc = { ...doc, content: [...(doc.content || [])] };
    let operationsApplied = 0;
    // Pre-resolve block_id → target and end_block_id → end_target
    for (const op of operations) {
        if (op.block_id && op.target === undefined) {
            const idx = findBlockIndexByBlockId(workingDoc, op.block_id);
            if (idx !== null) {
                op.target = idx;
            }
            else {
                warnings.push(`block_id "${op.block_id}" not found in document`);
            }
        }
        if (op.end_block_id && op.end_target === undefined) {
            const idx = findBlockIndexByBlockId(workingDoc, op.end_block_id);
            if (idx !== null) {
                op.end_target = idx;
            }
            else {
                warnings.push(`end_block_id "${op.end_block_id}" not found in document`);
            }
        }
    }
    // Separate append operations (always last, no index needed)
    const appendOps = [];
    const indexedOps = [];
    for (let i = 0; i < operations.length; i++) {
        const op = operations[i];
        const opLabel = `Op[${i}] ${op.action}`;
        if (op.action === 'append') {
            if (!op.content || op.content.length === 0) {
                warnings.push(`${opLabel}: no content provided, skipped`);
                continue;
            }
            appendOps.push(op);
            continue;
        }
        // Validate content for insert/replace
        if ((op.action === 'insert_after' || op.action === 'insert_before' || op.action === 'replace') &&
            (!op.content || op.content.length === 0)) {
            warnings.push(`${opLabel}: no content provided, skipped`);
            continue;
        }
        // Resolve target
        const { index: targetIndex, warnings: targetWarnings } = resolveTarget(workingDoc, op.target, `${opLabel} target`);
        warnings.push(...targetWarnings);
        if (targetIndex === null) {
            warnings.push(`${opLabel}: target could not be resolved, skipped`);
            continue;
        }
        // Resolve end_target for range operations (replace, remove)
        let endTargetIndex;
        if (op.end_target !== undefined && op.end_target !== null) {
            const { index: endIdx, warnings: endWarnings } = resolveTarget(workingDoc, op.end_target, `${opLabel} end_target`);
            warnings.push(...endWarnings);
            if (endIdx !== null) {
                if (endIdx < targetIndex) {
                    warnings.push(`${opLabel}: end_target (${endIdx}) < target (${targetIndex}), skipped`);
                    continue;
                }
                endTargetIndex = endIdx;
            }
        }
        indexedOps.push({ op, targetIndex, endTargetIndex });
    }
    // Sort by target index (ascending) for deterministic delta computation
    indexedOps.sort((a, b) => a.targetIndex - b.targetIndex);
    // Apply indexed operations with cumulative delta
    let delta = 0;
    for (const { op, targetIndex, endTargetIndex } of indexedOps) {
        const adjustedTarget = targetIndex + delta;
        const content = workingDoc.content;
        switch (op.action) {
            case 'insert_after': {
                const insertPos = adjustedTarget + 1;
                const blocks = op.content;
                content.splice(insertPos, 0, ...blocks);
                delta += blocks.length;
                operationsApplied++;
                break;
            }
            case 'insert_before': {
                const blocks = op.content;
                content.splice(adjustedTarget, 0, ...blocks);
                delta += blocks.length;
                operationsApplied++;
                break;
            }
            case 'replace': {
                // Inclusive range: [target, end_target] → splice(start, count, ...new)
                const endInclusive = endTargetIndex !== undefined ? endTargetIndex + delta : adjustedTarget;
                const count = endInclusive - adjustedTarget + 1;
                const blocks = op.content;
                content.splice(adjustedTarget, count, ...blocks);
                delta += blocks.length - count;
                operationsApplied++;
                break;
            }
            case 'remove': {
                const endInclusive = endTargetIndex !== undefined ? endTargetIndex + delta : adjustedTarget;
                const count = endInclusive - adjustedTarget + 1;
                content.splice(adjustedTarget, count);
                delta -= count;
                operationsApplied++;
                break;
            }
        }
    }
    // Apply append operations at the end
    for (const op of appendOps) {
        workingDoc.content.push(...op.content);
        operationsApplied++;
    }
    // Ensure doc is never empty
    if (workingDoc.content.length === 0) {
        workingDoc.content = [{ type: 'paragraph' }];
    }
    return {
        doc: workingDoc,
        operationsApplied,
        warnings,
    };
}
// =============================================================================
// Structure extraction
// =============================================================================
/**
 * Extract a structural summary of a TipTap document.
 * Returns top-level block types with index and a short text preview.
 */
export function getDocumentStructure(content) {
    const doc = content;
    if (!doc || doc.type !== 'doc' || !Array.isArray(doc.content)) {
        return { total_blocks: 0, blocks: [] };
    }
    const blocks = doc.content.map((node, index) => {
        const info = {
            index,
            type: mapTiptapTypeToReadable(node.type),
            preview: extractPreview(node),
        };
        // Include block_id for precise targeting
        const blockId = node.attrs?.blockId;
        if (blockId) {
            info.block_id = blockId;
        }
        if (node.attrs) {
            const relevantAttrs = {};
            if (node.attrs.level !== undefined)
                relevantAttrs.level = node.attrs.level;
            if (node.attrs.databaseId !== undefined)
                relevantAttrs.databaseId = node.attrs.databaseId;
            if (Object.keys(relevantAttrs).length > 0)
                info.attrs = relevantAttrs;
        }
        return info;
    });
    return { total_blocks: doc.content.length, blocks };
}
/**
 * Map TipTap internal type names to readable names.
 */
function mapTiptapTypeToReadable(type) {
    const map = {
        bulletList: 'list',
        orderedList: 'ordered_list',
        taskList: 'checklist',
        codeBlock: 'code',
        blockquote: 'quote',
        horizontalRule: 'divider',
        databaseTable: 'database_table',
        accordionGroup: 'accordion',
        spreadsheet: 'spreadsheet',
        mindmap: 'mindmap',
    };
    return map[type] || type;
}
/**
 * Extract a short text preview from a TipTap node.
 */
function extractPreview(node) {
    const text = extractText(node).trim().slice(0, 120);
    if (text)
        return text;
    switch (node.type) {
        case 'columns':
            return `[${node.content?.length || 0} columns]`;
        case 'accordionGroup':
            return `[accordion: ${node.content?.length || 0} items]`;
        case 'databaseTable':
            return `[database table]`;
        case 'spreadsheet':
            return '[spreadsheet]';
        case 'mindmap':
            return '[mindmap]';
        case 'horizontalRule':
            return '---';
        case 'table':
            return `[table: ${node.content?.length || 0} rows]`;
        case 'taskList':
            return `[checklist: ${node.content?.length || 0} items]`;
        default:
            return `[${node.type}]`;
    }
}
/**
 * Recursively extract all text content from a TipTap node.
 */
function extractText(node) {
    if (node.type === 'text' && node.text)
        return node.text;
    if (!node.content)
        return '';
    return node.content.map(extractText).join('');
}
//# sourceMappingURL=document-operations.js.map