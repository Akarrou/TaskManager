import { Injectable, inject } from '@angular/core';
import { firstValueFrom, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { DatabaseService } from './database.service';
import { SpreadsheetService } from './spreadsheet.service';
import { DatabaseColumn, DatabaseRow, DocumentDatabase, CellValue } from '../models/database.model';
import { MindmapData, MindmapNode, MindmapNodeStyle, DEFAULT_NODE_STYLE } from '../models/mindmap.model';
import { SpreadsheetCell, SpreadsheetConfig } from '../models/spreadsheet.model';

@Injectable({ providedIn: 'root' })
export class DocumentExportService {
  private databaseService = inject(DatabaseService);
  private spreadsheetService = inject(SpreadsheetService);

  async exportForPrint(title: string, htmlContent: string): Promise<void> {
    const enrichedHtml = await this.enrichAllBlocks(htmlContent);
    const fullHtml = this.buildPrintableHtml(title, enrichedHtml);
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Le navigateur a bloqué la fenêtre. Autorisez les popups pour ce site.');
      return;
    }
    printWindow.document.write(fullHtml);
    printWindow.document.close();
    printWindow.addEventListener('load', () => {
      printWindow.print();
    });
  }

  // =====================================================================
  // HTML enrichment — replace all placeholder blocks with real content
  // =====================================================================

  private async enrichAllBlocks(html: string): Promise<string> {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
    const wrapper = doc.body.querySelector('div')!;

    await Promise.all([
      this.enrichDatabaseBlocks(wrapper),
      this.enrichSpreadsheetBlocks(wrapper),
    ]);

    this.enrichMindmapBlocks(wrapper);
    this.enrichAccordionBlocks(wrapper);
    this.cleanupEditorArtifacts(wrapper);

    return wrapper.innerHTML;
  }

  // =====================================================================
  // Database blocks
  // =====================================================================

  private async enrichDatabaseBlocks(root: Element): Promise<void> {
    const dbBlocks = root.querySelectorAll('[data-type="database-table"]');
    if (dbBlocks.length === 0) return;

    const blocks: { element: Element; databaseId: string }[] = [];
    dbBlocks.forEach(block => {
      const databaseId = block.getAttribute('data-database-id');
      if (databaseId) blocks.push({ element: block, databaseId });
    });

    if (blocks.length === 0) return;

    const fetches = blocks.map(b =>
      firstValueFrom(
        forkJoin({
          metadata: this.databaseService.getDatabaseMetadata(b.databaseId),
          rows: this.databaseService.getRows({ databaseId: b.databaseId, limit: 1000 }),
        }).pipe(
          map(result => ({ ...result, element: b.element })),
          catchError(() => of(null))
        )
      )
    );

    const results = await Promise.all(fetches);
    for (const result of results) {
      if (!result) continue;
      const tableHtml = this.renderDatabaseAsTable(result.metadata, result.rows);
      result.element.outerHTML = tableHtml;
    }
  }

  private renderDatabaseAsTable(metadata: DocumentDatabase, rows: DatabaseRow[]): string {
    const visibleColumns = metadata.config.columns
      .filter((col: DatabaseColumn) => col.visible !== false)
      .sort((a: DatabaseColumn, b: DatabaseColumn) => a.order - b.order);

    if (visibleColumns.length === 0) {
      return '<p><em>Base de données vide</em></p>';
    }

    const dbName = metadata.name || 'Base de données';
    const headerCells = visibleColumns
      .map((col: DatabaseColumn) => `<th>${this.escapeHtml(col.name)}</th>`)
      .join('');

    const bodyRows = rows.map((row, idx) => {
      const cells = visibleColumns.map((col: DatabaseColumn) => {
        const value = row.cells[col.id];
        return `<td class="db-cell">${this.formatCellValue(col, value)}</td>`;
      }).join('');
      const rowClass = idx % 2 === 1 ? ' class="db-row-alt"' : '';
      return `<tr${rowClass}>${cells}</tr>`;
    }).join('');

    return `<div class="export-block db-export">
  <div class="export-block-title">${this.escapeHtml(dbName)}</div>
  <table class="db-table">
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows || `<tr><td colspan="${visibleColumns.length}" style="text-align:center;color:#9ca3af;">Aucune donnée</td></tr>`}</tbody>
  </table>
</div>`;
  }

  private formatCellValue(column: DatabaseColumn, value: CellValue): string {
    if (value === null || value === undefined || value === '') {
      return '<span style="color:#d1d5db;">—</span>';
    }
    switch (column.type) {
      case 'select': {
        const choice = column.options?.choices?.find(c => c.id === value);
        if (choice) {
          const bg = this.resolveChoiceColor(choice.color);
          return `<span class="db-badge" style="background-color:${bg}">${this.escapeHtml(choice.label)}</span>`;
        }
        return this.escapeHtml(String(value));
      }
      case 'multi-select': {
        if (Array.isArray(value)) {
          const badges = value.map(id => {
            const choice = column.options?.choices?.find(c => c.id === id);
            if (choice) {
              const bg = this.resolveChoiceColor(choice.color);
              return `<span class="db-badge" style="background-color:${bg}">${this.escapeHtml(choice.label)}</span>`;
            }
            return this.escapeHtml(String(id));
          });
          return `<div class="db-badge-group">${badges.join('')}</div>`;
        }
        return this.escapeHtml(String(value));
      }
      case 'checkbox':
        return value
          ? '<span class="db-checkbox checked">&#9745;</span>'
          : '<span class="db-checkbox">&#9744;</span>';
      case 'url': {
        const urlStr = String(value);
        const normalizedUrl = urlStr.toLowerCase().trim();
        if (/^https?:\/\//i.test(normalizedUrl) || /^mailto:/i.test(normalizedUrl)) {
          return `<a href="${this.escapeHtml(urlStr)}">${this.escapeHtml(urlStr)}</a>`;
        }
        return this.escapeHtml(urlStr);
      }
      default:
        return this.escapeHtml(String(value));
    }
  }

  private resolveChoiceColor(color: string): string {
    if (color && /^#[0-9a-fA-F]{3,8}$/.test(color)) return color;
    const colorMap: Record<string, string> = {
      'bg-gray-100': '#f3f4f6', 'bg-gray-200': '#e5e7eb', 'bg-gray-300': '#d1d5db',
      'bg-red-200': '#fecaca', 'bg-red-300': '#fca5a5',
      'bg-orange-200': '#fed7aa', 'bg-yellow-200': '#fef08a',
      'bg-green-200': '#bbf7d0', 'bg-teal-200': '#99f6e4',
      'bg-cyan-200': '#a5f3fc', 'bg-blue-200': '#bfdbfe',
      'bg-indigo-200': '#c7d2fe', 'bg-purple-200': '#e9d5ff',
      'bg-pink-200': '#fbcfe8',
    };
    return colorMap[color] || '#e5e7eb';
  }

  // =====================================================================
  // Spreadsheet blocks
  // =====================================================================

  private async enrichSpreadsheetBlocks(root: Element): Promise<void> {
    const ssBlocks = root.querySelectorAll('[data-type="spreadsheet"]');
    if (ssBlocks.length === 0) return;

    const blocks: { element: Element; spreadsheetId: string; config: SpreadsheetConfig }[] = [];
    ssBlocks.forEach(block => {
      const spreadsheetId = block.getAttribute('data-spreadsheet-id');
      const configAttr = block.getAttribute('data-config');
      if (spreadsheetId && configAttr) {
        try {
          const config = JSON.parse(configAttr) as SpreadsheetConfig;
          blocks.push({ element: block, spreadsheetId, config });
        } catch {
          // skip invalid config
        }
      }
    });

    if (blocks.length === 0) return;

    // For each spreadsheet, load cells of every sheet
    const fetches = blocks.map(async (b) => {
      try {
        const sheetResults: { sheetName: string; cells: Map<string, SpreadsheetCell> }[] = [];
        for (const sheet of b.config.sheets) {
          const cells = await firstValueFrom(
            this.spreadsheetService.loadCells(b.spreadsheetId, sheet.id).pipe(
              catchError(() => of(new Map<string, SpreadsheetCell>()))
            )
          );
          sheetResults.push({ sheetName: sheet.name, cells });
        }
        return { element: b.element, config: b.config, sheets: sheetResults };
      } catch {
        return null;
      }
    });

    const results = await Promise.all(fetches);
    for (const result of results) {
      if (!result) continue;
      const tableHtml = this.renderSpreadsheetAsTable(result.config, result.sheets);
      result.element.outerHTML = tableHtml;
    }
  }

  private renderSpreadsheetAsTable(
    config: SpreadsheetConfig,
    sheets: { sheetName: string; cells: Map<string, SpreadsheetCell> }[]
  ): string {
    const ssName = config.name || 'Feuille de calcul';
    const parts: string[] = [];

    for (const sheet of sheets) {
      if (sheet.cells.size === 0) continue;

      // Find grid bounds
      let maxRow = 0;
      let maxCol = 0;
      sheet.cells.forEach(cell => {
        if (cell.row > maxRow) maxRow = cell.row;
        if (cell.col > maxCol) maxCol = cell.col;
      });

      // Build table
      const rows: string[] = [];
      for (let r = 0; r <= maxRow; r++) {
        const cells: string[] = [];
        for (let c = 0; c <= maxCol; c++) {
          // Look for the cell in the map
          let cellValue = '';
          sheet.cells.forEach(cell => {
            if (cell.row === r && cell.col === c) {
              cellValue = cell.computed_value != null
                ? String(cell.computed_value)
                : (cell.raw_value != null ? String(cell.raw_value) : '');
            }
          });
          const tag = r === 0 ? 'th' : 'td';
          const isNumber = tag === 'td' && cellValue !== '' && !isNaN(Number(cellValue));
          const cellClass = isNumber ? ' class="ss-number"' : '';
          cells.push(`<${tag}${cellClass}>${this.escapeHtml(cellValue)}</${tag}>`);
        }
        rows.push(`<tr>${cells.join('')}</tr>`);
      }

      const sheetTitle = sheets.length > 1
        ? `<div class="export-sheet-title">${this.escapeHtml(sheet.sheetName)}</div>`
        : '';

      parts.push(`${sheetTitle}<table class="ss-table">${rows.join('')}</table>`);
    }

    if (parts.length === 0) {
      return `<div class="export-block">
  <div class="export-block-title">${this.escapeHtml(ssName)}</div>
  <p style="color:#9ca3af;text-align:center;">Feuille de calcul vide</p>
</div>`;
    }

    return `<div class="export-block">
  <div class="export-block-title">${this.escapeHtml(ssName)}</div>
  ${parts.join('')}
</div>`;
  }

  // =====================================================================
  // Mindmap blocks — render as hierarchical list from JSON data
  // =====================================================================

  private enrichMindmapBlocks(root: Element): void {
    const mmBlocks = root.querySelectorAll('[data-type="mindmap"]');
    mmBlocks.forEach(block => {
      const dataAttr = block.getAttribute('data-mindmap-data');
      if (!dataAttr) return;

      try {
        const data = JSON.parse(dataAttr) as MindmapData;
        const html = this.renderMindmapAsVisual(data);
        block.outerHTML = html;
      } catch {
        // keep placeholder
      }
    });
  }

  private renderMindmapAsVisual(data: MindmapData): string {
    if (!data.nodes || data.nodes.length === 0) {
      return '<div class="export-block"><div class="export-block-title">Mind Map</div><p style="color:#9ca3af;text-align:center;">Mind map vide</p></div>';
    }

    const rootNode = data.nodes.find(n => n.id === data.rootId);
    if (!rootNode) return '';

    const renderNode = (node: MindmapNode, depth: number): string => {
      const style = { ...DEFAULT_NODE_STYLE, ...(node.style || {}) };
      const label = node.content?.title || node.label || '';
      const desc = node.content?.description || '';
      const formattedContent = node.content?.formattedContent || '';

      const nodeStyle = this.buildNodeInlineStyle(style);

      const descHtml = desc
        ? `<div class="mm-node-desc">${this.escapeHtml(desc)}</div>`
        : '';

      const richHtml = formattedContent
        ? `<div class="mm-node-rich">${this.sanitizeHtml(formattedContent)}</div>`
        : '';

      const children = data.nodes.filter(n => n.parentId === node.id);
      const childrenHtml = children.length > 0
        ? `<div class="mm-children">${children.map(c => renderNode(c, depth + 1)).join('')}</div>`
        : '';

      return `<div class="mm-branch">
  <div class="mm-node" style="${nodeStyle}">
    <div class="mm-node-label">${this.escapeHtml(label)}</div>
    ${descHtml}${richHtml}
  </div>
  ${childrenHtml}
</div>`;
    };

    return `<div class="export-block mindmap-export">
  <div class="export-block-title">Mind Map</div>
  <div class="mm-root">${renderNode(rootNode, 0)}</div>
</div>`;
  }

  private buildNodeInlineStyle(style: MindmapNodeStyle): string {
    const parts: string[] = [
      `background-color:${style.backgroundColor}`,
      `color:${style.textColor}`,
      `border:${style.borderWidth}px ${style.borderStyle} ${style.borderColor}`,
      `border-radius:${style.borderRadius}px`,
      `font-size:${style.fontSize}px`,
    ];
    if (style.fontWeight === 'bold') {
      parts.push('font-weight:700');
    }
    return parts.join(';');
  }

  // =====================================================================
  // Accordion blocks — clean up editor UI artifacts for print
  // =====================================================================

  private enrichAccordionBlocks(root: Element): void {
    // Force all accordion content visible (remove collapsed state)
    root.querySelectorAll('.tiptap-accordion-title').forEach(title => {
      title.setAttribute('data-collapsed', 'false');
    });

    // Remove editor-only buttons
    root.querySelectorAll('.accordion-add-button, .accordion-delete-button').forEach(btn => {
      btn.remove();
    });
  }

  // =====================================================================
  // Cleanup editor artifacts
  // =====================================================================

  private cleanupEditorArtifacts(root: Element): void {
    // Remove task section placeholders (Angular-rendered, won't show in print)
    root.querySelectorAll('[data-type="task-section"]').forEach(el => {
      el.remove();
    });

    // Remove block comment indicators
    root.querySelectorAll('.block-comment-indicator').forEach(el => {
      el.remove();
    });

    // Remove drag handles
    root.querySelectorAll('.drag-handle').forEach(el => {
      el.remove();
    });

    // Remove resize handles
    root.querySelectorAll('[data-resize-handle]').forEach(el => {
      el.remove();
    });
  }

  // =====================================================================
  // HTML builder
  // =====================================================================

  private buildPrintableHtml(title: string, htmlContent: string): string {
    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)}</title>
  <style>
    ${this.getPrintStyles()}
  </style>
</head>
<body>
  <h1 class="document-title">${this.escapeHtml(title)}</h1>
  <div class="document-content">
    ${htmlContent}
  </div>
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Sanitize HTML by preserving safe tags (bold, italic, links, etc.)
   * while removing dangerous elements (script, iframe, etc.) and event handlers.
   * Used for TipTap rich content that contains intentional formatting.
   */
  private sanitizeHtml(html: string): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');

    // Remove dangerous elements
    doc.querySelectorAll('script, iframe, object, embed, form, svg, math, base, meta, link, style, template, noscript, applet').forEach(el => el.remove());

    // Clean attributes on all elements
    doc.querySelectorAll('*').forEach(el => {
      Array.from(el.attributes).forEach(attr => {
        // Remove event handlers (onclick, onload, etc.)
        if (attr.name.startsWith('on')) {
          el.removeAttribute(attr.name);
        }
        // Remove CSS expressions (IE-specific XSS vector)
        if (attr.name === 'style') {
          const lower = attr.value.toLowerCase();
          if (lower.includes('expression') || lower.includes('behavior') || lower.includes('-moz-binding')) {
            el.removeAttribute(attr.name);
          }
        }
      });

      // Sanitize URL-bearing attributes on ALL elements (not just A tags)
      const urlAttrs = ['href', 'src', 'action', 'formaction', 'data', 'poster'];
      urlAttrs.forEach(attrName => {
        const val = el.getAttribute(attrName);
        if (val) {
          const normalized = val.toLowerCase().trim();
          if (normalized.startsWith('javascript:') || normalized.startsWith('vbscript:') || normalized.startsWith('data:text/html')) {
            el.removeAttribute(attrName);
          }
        }
      });
    });

    return doc.body.innerHTML;
  }

  // =====================================================================
  // CSS Styles
  // =====================================================================

  private getPrintStyles(): string {
    return `
/* ========== Page & Base ========== */
@page {
  margin: 2cm 2.2cm;
}

* {
  box-sizing: border-box;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

body {
  font-family: 'Inter', 'Helvetica Neue', 'Segoe UI', sans-serif;
  font-size: 10pt;
  line-height: 1.7;
  color: #18181b;
  margin: 0;
  padding: 0;
  background: white;
  font-feature-settings: 'liga' 1, 'kern' 1;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}

/* ========== Document Title ========== */
.document-title {
  font-size: 22pt;
  font-weight: 800;
  letter-spacing: -0.025em;
  margin: 0 0 0.25rem;
  padding: 0;
  border: none;
  color: #09090b;
  line-height: 1.2;
}

.document-content {
  border-top: 3px solid #18181b;
  padding-top: 1.5rem;
}

/* ========== Typography ========== */
h1 {
  font-size: 18pt;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 2rem 0 0.75rem;
  color: #09090b;
  line-height: 1.25;
}

h2 {
  font-size: 14pt;
  font-weight: 700;
  letter-spacing: -0.01em;
  margin: 1.75rem 0 0.5rem;
  color: #18181b;
  line-height: 1.3;
}

h3 {
  font-size: 11pt;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin: 1.5rem 0 0.5rem;
  color: #3f3f46;
  line-height: 1.35;
}

p {
  margin: 0.5rem 0;
  orphans: 3;
  widows: 3;
}

strong {
  font-weight: 700;
}

em {
  font-style: italic;
}

/* ========== Lists ========== */
ul, ol {
  padding-left: 1.5rem;
  margin: 0.5rem 0;
}

li {
  margin: 0.2rem 0;
}

li::marker {
  color: #71717a;
}

/* ========== Task Lists ========== */
ul[data-type="taskList"] {
  list-style: none !important;
  padding: 0 !important;
  margin: 0.5rem 0 !important;
}

ul[data-type="taskList"] > li {
  display: flex !important;
  flex-direction: row !important;
  align-items: flex-start !important;
  gap: 0.5rem !important;
  margin: 0.15rem 0 !important;
  list-style: none !important;
  padding: 0.2rem 0 !important;
}

ul[data-type="taskList"] > li > label {
  flex: 0 0 auto !important;
  margin: 0 !important;
  padding: 0 !important;
  display: inline-flex !important;
  align-items: center !important;
}

ul[data-type="taskList"] > li > label input[type="checkbox"] {
  width: 0.9rem !important;
  height: 0.9rem !important;
  margin: 0.15rem 0 0 0 !important;
  flex-shrink: 0 !important;
  accent-color: #18181b;
}

ul[data-type="taskList"] > li > div {
  flex: 1 1 auto !important;
  min-width: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  display: inline-block !important;
}

ul[data-type="taskList"] > li > div > p {
  margin: 0 !important;
  padding: 0 !important;
  display: inline !important;
}

/* ========== Code ========== */
code {
  background-color: #f4f4f5;
  padding: 0.15rem 0.35rem;
  border-radius: 3px;
  font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace;
  font-size: 0.85em;
  color: #dc2626;
}

pre {
  background-color: #18181b;
  color: #e4e4e7;
  border-radius: 6px;
  padding: 1rem 1.25rem;
  overflow-x: auto;
  margin: 1rem 0;
  page-break-inside: avoid;
}

pre code {
  background: none;
  padding: 0;
  border-radius: 0;
  font-size: 8.5pt;
  color: inherit;
  line-height: 1.6;
}

/* ========== Blockquote ========== */
blockquote {
  border-left: 3px solid #18181b;
  padding: 0.5rem 0 0.5rem 1.25rem;
  margin: 1rem 0;
  color: #3f3f46;
}

blockquote p {
  margin: 0.25rem 0;
}

/* ========== Horizontal Rule ========== */
hr {
  border: none;
  border-top: 1px solid #d4d4d8;
  margin: 2rem 0;
}

/* ========== Tables (inline editor tables) ========== */
table {
  border-collapse: collapse;
  width: 100%;
  margin: 1rem 0;
  page-break-inside: avoid;
  font-size: 9pt;
}

td, th {
  border: 0.5px solid #d4d4d8;
  padding: 0.4rem 0.6rem;
  vertical-align: top;
  text-align: left;
}

th {
  background-color: #fafafa;
  font-weight: 600;
  color: #18181b;
  border-bottom-width: 1.5px;
}

/* ========== Images ========== */
img {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
}

img[data-alignment="center"] {
  display: block;
  margin-left: auto;
  margin-right: auto;
}

img[data-alignment="right"] {
  display: block;
  margin-left: auto;
  margin-right: 0;
}

img[data-alignment="left"] {
  display: block;
  margin-left: 0;
  margin-right: auto;
}

[data-resize-container] {
  display: flex;
  width: 100%;
}

[data-resize-container].align-center,
[data-resize-container]:has(img[data-alignment="center"]) {
  justify-content: center;
}

[data-resize-container].align-right,
[data-resize-container]:has(img[data-alignment="right"]) {
  justify-content: flex-end;
}

[data-resize-container].align-left,
[data-resize-container]:has(img[data-alignment="left"]) {
  justify-content: flex-start;
}

[data-resize-handle] {
  display: none !important;
}

/* ========== Links ========== */
a {
  color: #18181b;
  text-decoration: underline;
  text-decoration-color: #a1a1aa;
  text-underline-offset: 2px;
}

/* ========== Accordion ========== */
.tiptap-accordion-group {
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  overflow: hidden;
  margin: 1rem 0;
  page-break-inside: avoid;
}

.tiptap-accordion-item {
  border-bottom: 1px solid #e4e4e7;
}

.tiptap-accordion-item:last-of-type {
  border-bottom: none;
}

.tiptap-accordion-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 0.85rem;
  background-color: #fafafa;
  font-weight: 600;
  font-size: 9.5pt;
}

.tiptap-accordion-title[data-collapsed="true"] + .tiptap-accordion-content {
  max-height: 0 !important;
  padding-top: 0;
  padding-bottom: 0;
  opacity: 0;
  overflow: hidden;
}

.accordion-toggle-icon {
  font-size: 1rem;
  color: #a1a1aa;
  flex-shrink: 0;
  line-height: 1;
}

.accordion-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  flex-shrink: 0;
}

.accordion-icon .material-icons-outlined {
  font-size: 0.875rem;
}

.accordion-title-text {
  flex: 1;
  font-weight: 600;
  font-size: 9.5pt;
  line-height: 1.4;
  color: #18181b;
}

.tiptap-accordion-content {
  padding: 0.6rem 0.85rem 0.6rem 2.75rem;
  font-size: 9.5pt;
}

.tiptap-accordion-content > * {
  margin: 0.35rem 0;
}

.tiptap-accordion-content > *:first-child {
  margin-top: 0;
}

.tiptap-accordion-content > *:last-child {
  margin-bottom: 0;
}

/* ========== Columns ========== */
.tiptap-columns, [data-type="columns"] {
  display: flex;
  gap: 1.5rem;
  margin: 1rem 0;
}

.tiptap-column, [data-type="column"] {
  flex: 1;
  min-width: 0;
}

/* ========== Task Mention ========== */
.task-mention-node {
  margin: 0.75rem 0;
}

.task-mention-card {
  background: #fafafa;
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  padding: 0.6rem 0.85rem;
}

.task-mention-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.3rem;
}

.task-mention-content {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 9.5pt;
  font-weight: 500;
}

.task-number {
  font-weight: 700;
  color: #71717a;
  font-variant-numeric: tabular-nums;
}

.task-title {
  color: #18181b;
}

.task-type-badge {
  padding: 0.125rem 0.4rem;
  border-radius: 3px;
  font-size: 6.5pt;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.task-type-badge.task-type-epic { background: #fef3c7; color: #92400e; }
.task-type-badge.task-type-feature { background: #dbeafe; color: #1e40af; }
.task-type-badge.task-type-task { background: #d1fae5; color: #065f46; }

.task-status-badge {
  padding: 0.125rem 0.4rem;
  border-radius: 3px;
  font-size: 6.5pt;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.task-status-badge.task-status-pending { background: #f4f4f5; color: #71717a; }
.task-status-badge.task-status-in_progress { background: #dbeafe; color: #1e40af; }
.task-status-badge.task-status-review { background: #fef3c7; color: #92400e; }
.task-status-badge.task-status-completed { background: #d1fae5; color: #065f46; }
.task-status-badge.task-status-cancelled { background: #fee2e2; color: #991b1b; }

.task-priority-badge {
  padding: 0.125rem 0.3rem;
  border-radius: 3px;
  font-size: 9pt;
  line-height: 1;
}

.task-priority-badge.task-priority-low { background: #f4f4f5; }
.task-priority-badge.task-priority-medium { background: #dbeafe; }
.task-priority-badge.task-priority-high { background: #fef3c7; }
.task-priority-badge.task-priority-urgent { background: #fee2e2; }

/* ========== Export blocks (shared) ========== */
.export-block {
  margin: 1.25rem 0;
  page-break-inside: avoid;
}

.export-block-title {
  font-size: 9pt;
  font-weight: 700;
  color: #18181b;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 0 0 0.4rem;
  margin-bottom: 0.5rem;
  border-bottom: 2px solid #18181b;
}

.export-sheet-title {
  font-size: 8pt;
  font-weight: 700;
  color: #71717a;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0.75rem 0 0.25rem;
  padding: 0;
}

/* ========== Database table ========== */
.db-table {
  border-collapse: collapse;
  width: 100%;
  font-size: 8.5pt;
  margin: 0;
}

.db-table th {
  background: transparent;
  font-weight: 700;
  color: #18181b;
  padding: 0.4rem 0.6rem;
  border-top: none;
  border-left: none;
  border-right: none;
  border-bottom: 1.5px solid #18181b;
  text-align: left;
  white-space: nowrap;
  text-transform: uppercase;
  font-size: 7pt;
  letter-spacing: 0.06em;
}

.db-table td {
  padding: 0.35rem 0.6rem;
  border: none;
  border-bottom: 0.5px solid #e4e4e7;
  color: #27272a;
  vertical-align: middle;
}

.db-row-alt {
  background: #fafafa;
}

.db-badge {
  display: inline-block;
  padding: 0.1rem 0.45rem;
  border-radius: 3px;
  font-size: 7.5pt;
  font-weight: 600;
  color: #27272a;
  line-height: 1.6;
}

.db-badge-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem;
}

.db-checkbox {
  font-size: 1rem;
  line-height: 1;
}

.db-checkbox.checked {
  color: #18181b;
}

/* ========== Spreadsheet table ========== */
.ss-table {
  border-collapse: collapse;
  width: 100%;
  font-size: 8pt;
  margin: 0;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
}

.ss-table th {
  background: #fafafa;
  font-weight: 600;
  font-family: 'Inter', 'Helvetica Neue', sans-serif;
  color: #71717a;
  padding: 0.2rem 0.4rem;
  border: 0.5px solid #d4d4d8;
  text-align: center;
  font-size: 7pt;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.ss-table td {
  padding: 0.2rem 0.4rem;
  border: 0.5px solid #d4d4d8;
  color: #27272a;
}

.ss-number {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* ========== Mindmap export ========== */
.mindmap-export {
  page-break-inside: avoid;
  overflow-x: auto;
}

.mm-root {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1rem 0;
}

.mm-branch {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.mm-node {
  display: inline-block;
  padding: 0.4rem 0.85rem;
  margin: 0.2rem;
  text-align: center;
  max-width: 260px;
  word-wrap: break-word;
  font-size: 8.5pt;
}

.mm-node-label {
  font-weight: 700;
  line-height: 1.3;
}

.mm-node-desc {
  margin-top: 0.15rem;
  font-size: 7.5pt;
  opacity: 0.8;
  line-height: 1.3;
}

.mm-node-rich {
  margin-top: 0.15rem;
  font-size: 7.5pt;
  text-align: left;
}

.mm-children {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.2rem;
  position: relative;
  padding-top: 1.1rem;
  margin-top: 0.15rem;
}

.mm-children::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  width: 1px;
  height: 1.1rem;
  background: #a1a1aa;
}

.mm-children::after {
  content: '';
  position: absolute;
  top: 1.1rem;
  left: 10%;
  right: 10%;
  height: 1px;
  background: #a1a1aa;
}

.mm-children > .mm-branch {
  position: relative;
  padding-top: 1.1rem;
}

.mm-children > .mm-branch::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  width: 1px;
  height: 1.1rem;
  background: #a1a1aa;
}

.mm-children:has(> .mm-branch:only-child)::after {
  display: none;
}

/* ========== Text alignment ========== */
[style*="text-align: center"],
[style*="text-align:center"] {
  text-align: center;
}

[style*="text-align: right"],
[style*="text-align:right"] {
  text-align: right;
}

/* ========== Font styles ========== */
[style*="font-size"] {
  /* Allow inline font-size from editor */
}

mark {
  background-color: #fef08a;
  padding: 0.05rem 0.2rem;
  border-radius: 2px;
}

/* ========== Print-specific ========== */
@media print {
  body {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .document-title {
    page-break-after: avoid;
  }

  h1, h2, h3 {
    page-break-after: avoid;
    orphans: 3;
    widows: 3;
  }

  p {
    orphans: 3;
    widows: 3;
  }

  pre, table, img, .tiptap-accordion-group, .export-block, .mindmap-export {
    page-break-inside: avoid;
  }

  a[href]::after {
    content: none;
  }
}
`;
  }
}
