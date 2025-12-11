import {
  Directive,
  ElementRef,
  inject,
  OnInit,
  OnDestroy,
  ViewContainerRef,
  ComponentRef,
  Renderer2,
  Input,
} from '@angular/core';
import { Editor } from '@tiptap/core';
import { DocumentDatabaseTableComponent } from '../components/document-database-table/document-database-table.component';
import { DatabaseNodeAttributes } from '../models/database.model';

/**
 * DatabaseTableRendererDirective
 *
 * This directive detects database table blocks in the TipTap editor and dynamically
 * creates Angular components to render them. It follows the same pattern as
 * TaskSectionRendererDirective but handles database-specific rendering.
 *
 * Usage:
 * <div appDatabaseTableRenderer [documentId]="documentId" [editor]="editor"></div>
 */
@Directive({
  selector: '[appDatabaseTableRenderer]',
  standalone: true,
})
export class DatabaseTableRendererDirective implements OnInit, OnDestroy {
  private el = inject(ElementRef);
  private viewContainerRef = inject(ViewContainerRef);
  private renderer = inject(Renderer2);

  /**
   * Document ID (required for creating databases)
   */
  @Input() documentId!: string;

  /**
   * TipTap Editor instance (required for updating node attributes)
   */
  @Input() editor?: Editor;

  /**
   * Callback to update TipTap node attributes when database changes
   */
  @Input() onDataChange?: (element: HTMLElement, attrs: DatabaseNodeAttributes) => void;

  /**
   * Track created component references for cleanup
   */
  private componentRefs: ComponentRef<DocumentDatabaseTableComponent>[] = [];

  /**
   * MutationObserver to detect new database blocks added dynamically
   */
  private observer: MutationObserver | null = null;

  ngOnInit() {
    this.renderDatabaseTables();
    this.observeChanges();
  }

  ngOnDestroy() {
    // Clean up all component references
    this.componentRefs.forEach(ref => ref.destroy());
    this.componentRefs = [];

    // Disconnect mutation observer
    if (this.observer) {
      this.observer.disconnect();
    }
  }

  /**
   * Find and render all database table blocks in the editor
   */
  private renderDatabaseTables() {
    const databaseBlocks = this.el.nativeElement.querySelectorAll(
      '[data-type="database-table"]'
    );

    databaseBlocks.forEach((block: HTMLElement) => {
      // Skip if already rendered
      if (block.classList.contains('database-table-rendered')) {
        return;
      }

      // Extract attributes from the block
      const databaseId = block.getAttribute('data-database-id') || '';
      const configAttr = block.getAttribute('data-config');
      const storageMode = block.getAttribute('data-storage-mode') || 'supabase';

      // Parse config
      let config = null;
      if (configAttr) {
        try {
          config = JSON.parse(configAttr);
        } catch (error) {
          console.error('Failed to parse database config:', error);
          return;
        }
      }

      if (!config) {
        console.warn('Database block found without valid config');
        return;
      }

      // Note: databaseId can be empty string for new databases (will be created on init)

      // Clear placeholder content
      block.innerHTML = '';

      // Mark as rendered
      this.renderer.addClass(block, 'database-table-rendered');

      // Create the Angular component
      const componentRef = this.viewContainerRef.createComponent(
        DocumentDatabaseTableComponent
      );

      // Set component inputs
      componentRef.setInput('databaseId', databaseId);
      componentRef.setInput('documentId', this.documentId);
      componentRef.setInput('config', config);
      componentRef.setInput('storageMode', storageMode);

      // Set the data change callback if provided
      if (this.onDataChange) {
        componentRef.setInput('onDataChange', (attrs: DatabaseNodeAttributes) => {
          this.updateNodeAttributes(block, attrs);
        });
      }

      // Append component to the block
      this.renderer.appendChild(block, componentRef.location.nativeElement);

      // Store reference for cleanup
      this.componentRefs.push(componentRef);
    });
  }

  /**
   * Update TipTap node attributes when database changes
   */
  private updateNodeAttributes(element: HTMLElement, attrs: DatabaseNodeAttributes) {
    console.log('Updating database node attributes:', attrs);

    // Update DOM attributes (for immediate visual update)
    element.setAttribute('data-database-id', attrs.databaseId);
    element.setAttribute('data-config', JSON.stringify(attrs.config));
    element.setAttribute('data-storage-mode', attrs.storageMode);

    // Update TipTap node via transaction
    if (this.editor) {
      const pos = this.findNodePosition(element);
      if (pos !== null) {
        // Apply the transaction synchronously
        const success = this.editor.commands.command(({ tr }) => {
          tr.setNodeMarkup(pos, undefined, attrs);
          return true;
        });

        if (!success) {
          console.error('❌ Failed to update TipTap node');
          return;
        }

        console.log('✅ Updated TipTap node at position', pos, 'with attrs:', attrs);
      } else {
        console.error('❌ Could not find node position for element');
      }
    } else {
      console.warn('⚠️ Editor not provided - using fallback method');
      // Fallback: use callback if provided
      if (this.onDataChange) {
        this.onDataChange(element, attrs);
      }
    }
  }

  /**
   * Find the position of a TipTap node from a DOM element
   */
  private findNodePosition(element: HTMLElement): number | null {
    if (!this.editor) return null;

    const { view } = this.editor;
    const domNode = element;

    try {
      const pos = view.posAtDOM(domNode, 0);
      return pos;
    } catch (error) {
      console.error('Failed to find node position:', error);
      return null;
    }
  }

  /**
   * Observe DOM changes to detect new database blocks added dynamically
   */
  private observeChanges() {
    this.observer = new MutationObserver((mutations) => {
      let shouldRender = false;

      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement;
            // Check if the added node is a database table or contains one
            if (
              element.getAttribute('data-type') === 'database-table' ||
              element.querySelector('[data-type="database-table"]')
            ) {
              shouldRender = true;
            }
          }
        });
      });

      if (shouldRender) {
        // Small delay to ensure DOM is stable
        setTimeout(() => this.renderDatabaseTables(), 0);
      }
    });

    // Start observing
    this.observer.observe(this.el.nativeElement, {
      childList: true,
      subtree: true,
    });
  }
}
