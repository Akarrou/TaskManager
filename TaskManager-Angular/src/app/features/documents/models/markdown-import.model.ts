/**
 * Markdown Import Models
 * Interfaces for Markdown file import functionality
 */

/**
 * YAML Front Matter metadata structure
 */
export interface MarkdownFrontMatter {
  title?: string;
  tags?: string[];
  date?: string;
  author?: string;
  description?: string;
  [key: string]: unknown; // Allow custom fields
}

/**
 * Result of parsing a Markdown file
 */
export interface MarkdownParseResult {
  frontMatter: MarkdownFrontMatter;
  content: string;        // Raw Markdown content (without front matter)
  cleanContent: string;   // Markdown with images stripped
}

/**
 * Result of Markdown import operation
 */
export interface MarkdownImportResult {
  success: boolean;
  documentId?: string;
  warnings: string[];
}

/**
 * Error during Markdown import
 */
export interface MarkdownImportError {
  type: 'validation' | 'parsing' | 'conversion' | 'creation';
  message: string;
  details?: string;
}
