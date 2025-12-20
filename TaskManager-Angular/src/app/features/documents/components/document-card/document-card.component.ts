import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import {
  CdkDrag,
  CdkDragHandle,
  CdkDragPreview,
  CdkDragPlaceholder,
  DragDropModule,
} from '@angular/cdk/drag-drop';
import { Document, DocumentStorageFile } from '../../services/document.service';
import { DocumentTabItem } from '../../models/document-tabs.model';
import { JSONContent } from '@tiptap/core';

export interface ExternalLink {
  url: string;
  text: string;
}

@Component({
  selector: 'app-document-card',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    DragDropModule,
  ],
  templateUrl: './document-card.component.html',
  styleUrls: ['./document-card.component.scss'],
})
export class DocumentCardComponent {
  @Input({ required: true }) document!: Document;
  @Input() item?: DocumentTabItem;
  @Input() childDocuments: Document[] = [];
  @Input() storageFiles: DocumentStorageFile[] = [];
  @Input() showDragHandle = true;
  @Input() sectionColor = '#6366f1';

  @Output() documentClick = new EventEmitter<string>();
  @Output() documentDelete = new EventEmitter<{ event: Event; documentId: string }>();

  /**
   * Extract external links from document content
   */
  get externalLinks(): ExternalLink[] {
    if (!this.document?.content) {
      return [];
    }
    return this.extractLinksFromContent(this.document.content);
  }

  /**
   * Recursively extract links from TipTap JSON content
   */
  private extractLinksFromContent(content: JSONContent): ExternalLink[] {
    const links: ExternalLink[] = [];
    const seenUrls = new Set<string>();

    const traverse = (node: JSONContent) => {
      // Check for link marks on text nodes
      if (node.marks) {
        for (const mark of node.marks) {
          if (mark.type === 'link' && mark.attrs?.['href']) {
            const url = mark.attrs['href'] as string;
            // Only include external links (http/https), not internal document links
            if (url.startsWith('http://') || url.startsWith('https://')) {
              if (!seenUrls.has(url)) {
                seenUrls.add(url);
                links.push({
                  url,
                  text: (node.text as string) || this.extractDomain(url),
                });
              }
            }
          }
        }
      }

      // Recursively process child nodes
      if (node.content && Array.isArray(node.content)) {
        for (const child of node.content) {
          traverse(child);
        }
      }
    };

    traverse(content);
    return links;
  }

  /**
   * Extract domain from URL for display
   */
  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return url;
    }
  }

  /**
   * Check if card has any attachments to display
   */
  get hasAttachments(): boolean {
    return this.childDocuments.length > 0 ||
           this.storageFiles.length > 0 ||
           this.externalLinks.length > 0;
  }

  onCardClick(): void {
    this.documentClick.emit(this.document.id);
  }

  onDelete(event: Event): void {
    event.stopPropagation();
    this.documentDelete.emit({ event, documentId: this.document.id });
  }

  onChildDocumentClick(event: Event, childId: string): void {
    event.stopPropagation();
    this.documentClick.emit(childId);
  }

  onExternalLinkClick(event: Event, url: string): void {
    event.stopPropagation();
    window.open(url, '_blank');
  }

  onStorageFileClick(event: Event, url: string): void {
    event.stopPropagation();
    window.open(url, '_blank');
  }
}
