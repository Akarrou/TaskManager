/**
 * Markdown Parser Service
 * Handles parsing of Markdown files, front matter extraction, and content cleaning
 */

import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { MarkdownFrontMatter, MarkdownParseResult } from '../models/markdown-import.model';

@Injectable({
  providedIn: 'root'
})
export class MarkdownParserService {

  /**
   * Parse a Markdown file and extract front matter and content
   */
  parseFile(file: File): Observable<MarkdownParseResult> {
    return from(file.text()).pipe(
      map(content => this.parseMarkdown(content))
    );
  }

  /**
   * Parse Markdown text and extract front matter
   */
  private parseMarkdown(markdown: string): MarkdownParseResult {
    let frontMatter: MarkdownFrontMatter = {};
    let content = markdown;

    // Try to extract front matter manually (browser-compatible)
    const frontMatterMatch = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);

    if (frontMatterMatch) {
      const yamlContent = frontMatterMatch[1];
      content = frontMatterMatch[2];

      // Parse YAML front matter manually (simple key-value parsing)
      try {
        frontMatter = this.parseSimpleYaml(yamlContent);
      } catch (err) {
        console.warn('Failed to parse front matter:', err);
        // Continue with empty metadata
      }
    }

    // Strip images from content
    const cleanContent = this.stripImages(content);

    return {
      frontMatter,
      content,
      cleanContent
    };
  }

  /**
   * Simple YAML parser for front matter (browser-compatible)
   * Supports basic key-value pairs and arrays
   */
  private parseSimpleYaml(yaml: string): MarkdownFrontMatter {
    const result: MarkdownFrontMatter = {};
    const lines = yaml.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Parse key: value
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex === -1) continue;

      const key = trimmed.substring(0, colonIndex).trim();
      let value = trimmed.substring(colonIndex + 1).trim();

      // Remove quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.substring(1, value.length - 1);
      }

      // Parse arrays [item1, item2]
      if (value.startsWith('[') && value.endsWith(']')) {
        const items = value.substring(1, value.length - 1)
          .split(',')
          .map(item => item.trim().replace(/^["']|["']$/g, ''));
        result[key] = items;
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Strip image references from Markdown content
   * Removes both Markdown syntax ![alt](url) and HTML <img> tags
   */
  private stripImages(markdown: string): string {
    return markdown
      // Remove Markdown images: ![alt](url) or ![alt](url "title")
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
      // Remove HTML images: <img...> (case insensitive)
      .replace(/<img[^>]*>/gi, '')
      // Clean up multiple consecutive blank lines left by image removal
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      // Trim leading/trailing whitespace
      .trim();
  }

  /**
   * Validate Markdown content
   * Returns true if content is not empty
   */
  validateMarkdown(content: string): boolean {
    if (!content || content.trim().length === 0) {
      return false;
    }
    return true;
  }

  /**
   * Validate file type and size
   */
  validateFile(file: File, maxSizeMB = 10): { valid: boolean; error?: string } {
    // Check file extension
    if (!file.name.toLowerCase().endsWith('.md')) {
      return {
        valid: false,
        error: 'Seuls les fichiers .md sont acceptés'
      };
    }

    // Check file size
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      return {
        valid: false,
        error: `Le fichier ne doit pas dépasser ${maxSizeMB} MB`
      };
    }

    return { valid: true };
  }
}
