/**
 * Professional print CSS styles for document export.
 *
 * Targets the MCP HTML structure produced by tiptap-extensions.ts:
 *  - Accordion:  .accordion-group, details.accordion-item, summary.accordion-title, .accordion-content
 *  - Columns:    inline flex styles
 *  - Images:     <figure> with inline text-align
 *  - Placeholders: .database-placeholder, .spreadsheet-placeholder, .mindmap-placeholder
 *  - Task:       .task-mention, .task-section
 */
export function getPrintStyles(): string {
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

strong { font-weight: 700; }
em { font-style: italic; }

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
  align-items: flex-start !important;
  gap: 0.5rem !important;
  margin: 0.15rem 0 !important;
  list-style: none !important;
  padding: 0.2rem 0 !important;
}

ul[data-type="taskList"] > li > label {
  flex: 0 0 auto !important;
  display: inline-flex !important;
  align-items: center !important;
}

ul[data-type="taskList"] > li > label input[type="checkbox"] {
  width: 0.9rem !important;
  height: 0.9rem !important;
  margin: 0.15rem 0 0 0 !important;
  accent-color: #18181b;
}

ul[data-type="taskList"] > li > div {
  flex: 1 1 auto !important;
  min-width: 0 !important;
}

/* ========== Code ========== */
code {
  background-color: #f4f4f5;
  padding: 0.15rem 0.35rem;
  border-radius: 3px;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
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

/* ========== Tables ========== */
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

figure {
  margin: 1rem 0;
  padding: 0;
}

figcaption {
  font-size: 8.5pt;
  color: #71717a;
  margin-top: 0.35rem;
  font-style: italic;
}

/* ========== Links ========== */
a {
  color: #18181b;
  text-decoration: underline;
  text-decoration-color: #a1a1aa;
  text-underline-offset: 2px;
}

/* ========== Accordion (MCP: details/summary) ========== */
.accordion-group {
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  overflow: hidden;
  margin: 1rem 0;
  page-break-inside: avoid;
}

details.accordion-item {
  border-bottom: 1px solid #e4e4e7;
}

details.accordion-item:last-of-type {
  border-bottom: none;
}

summary.accordion-title {
  display: block;
  padding: 0.6rem 0.85rem;
  background-color: #fafafa;
  font-weight: 600;
  font-size: 9.5pt;
  cursor: default;
  list-style: none;
  color: #18181b;
}

summary.accordion-title::-webkit-details-marker {
  display: none;
}

.accordion-content {
  padding: 0.6rem 0.85rem 0.6rem 1.5rem;
  font-size: 9.5pt;
}

.accordion-content > *:first-child { margin-top: 0; }
.accordion-content > *:last-child { margin-bottom: 0; }

/* ========== Placeholders (database, spreadsheet, mindmap) ========== */
.database-placeholder,
.spreadsheet-placeholder,
.mindmap-placeholder {
  margin: 1rem 0;
  padding: 0.75rem 1rem;
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  background: #fafafa;
  font-size: 9pt;
  color: #3f3f46;
  page-break-inside: avoid;
}

.database-placeholder p:first-child,
.spreadsheet-placeholder p:first-child,
.mindmap-placeholder p:first-child {
  font-weight: 700;
  margin: 0 0 0.25rem;
}

.database-placeholder p:last-child,
.spreadsheet-placeholder p:last-child,
.mindmap-placeholder p:last-child {
  margin: 0;
  font-size: 8pt;
}

/* ========== Task Mention ========== */
.task-mention {
  display: inline-block;
  background: #fafafa;
  border: 1px solid #e4e4e7;
  border-radius: 4px;
  padding: 0.15rem 0.5rem;
  font-size: 9pt;
  font-weight: 500;
  color: #18181b;
}

/* ========== Task Section ========== */
.task-section {
  margin: 0.75rem 0;
  padding: 0.5rem 0.85rem;
  border: 1px dashed #d4d4d8;
  border-radius: 6px;
  font-size: 8.5pt;
  color: #71717a;
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

/* ========== Highlight ========== */
mark {
  background-color: #fef08a;
  padding: 0.05rem 0.2rem;
  border-radius: 2px;
}

/* ========== Print-specific ========== */
@media print {
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

  pre, table, img, .accordion-group, .database-placeholder,
  .spreadsheet-placeholder, .mindmap-placeholder {
    page-break-inside: avoid;
  }

  a[href]::after {
    content: none;
  }
}
`;
}
