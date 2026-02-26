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
      const isLinked = block.getAttribute('data-is-linked') === 'true';

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
      componentRef.setInput('linkedDatabase', isLinked);

      // Always set the data change callback to handle updates and deletions
      componentRef.setInput('onDataChange', (attrs: DatabaseNodeAttributes) => {
        this.updateNodeAttributes(block, attrs);
      });

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

    // Handle database deletion: remove the node from TipTap
    if (attrs.deleted) {
      this.deleteNode(element);
      return;
    }

    // Update DOM attributes (for immediate visual update)
    element.setAttribute('data-database-id', attrs.databaseId);
    element.setAttribute('data-config', JSON.stringify(attrs.config));
    element.setAttribute('data-storage-mode', attrs.storageMode);
    if (attrs.isLinked !== undefined) {
      element.setAttribute('data-is-linked', String(attrs.isLinked));
    }

    // Update TipTap node via transaction (preserve blockId and other global attrs)
    if (this.editor) {
      const pos = this.findNodePosition(element);
      if (pos !== null) {
        const node = this.editor.state.doc.nodeAt(pos);
        if (!node) return;

        // Merge: keep existing attrs (like blockId) and override with new database attrs
        const mergedAttrs = { ...node.attrs, ...attrs };

        // Skip if nothing actually changed (deep compare)
        if (JSON.stringify(node.attrs) === JSON.stringify(mergedAttrs)) {
          return;
        }

        this.editor.commands.command(({ tr }) => {
          tr.setNodeMarkup(pos, undefined, mergedAttrs);
          return true;
        });
      }
    } else if (this.onDataChange) {
      this.onDataChange(element, attrs);
    }
  }

  /**
   * Delete a database node from the TipTap editor
   */
  private deleteNode(element: HTMLElement): void {
    console.log('🗑️ Attempting to delete database node', element);

    if (!this.editor) {
      console.error('❌ Cannot delete node: editor not available');
      return;
    }

    const pos = this.findNodePosition(element);
    if (pos === null) {
      console.error('❌ Cannot delete node: position not found');
      return;
    }

    console.log('✅ Found node position:', pos);

    // Delete the node at the found position using chain for better reliability
    const success = this.editor
      .chain()
      .focus()
      .command(({ tr, state, dispatch }) => {
        const node = state.doc.nodeAt(pos);
        if (!node) {
          console.error('❌ Cannot delete node: node not found at position', pos);
          return false;
        }

        console.log('✅ Found node to delete:', node.type.name, 'size:', node.nodeSize);

        // Delete the entire node (from pos to pos + node.nodeSize)
        if (dispatch) {
          tr.delete(pos, pos + node.nodeSize);
        }
        return true;
      })
      .run();

    if (success) {
      console.log('✅ Database node deleted successfully');

      // Also destroy the Angular component reference if it exists
      this.destroyComponentForElement(element);

      // Force editor update event to trigger auto-save
      // The editor's update event listener will handle the save
      console.log('💾 Editor transaction completed, auto-save should trigger');
    } else {
      console.error('❌ Failed to delete database node');
    }
  }

  /**
   * Destroy the Angular component associated with an element
   */
  private destroyComponentForElement(element: HTMLElement): void {
    const index = this.componentRefs.findIndex(
      ref => ref.location.nativeElement.closest('[data-type="database-table"]') === element
    );

    if (index !== -1) {
      this.componentRefs[index].destroy();
      this.componentRefs.splice(index, 1);
      console.log('✅ Component destroyed');
    }
  }

  /**
   * Find the position of a TipTap node from a DOM element
   */
  private findNodePosition(element: HTMLElement): number | null {
    if (!this.editor || this.editor.isDestroyed) return null;

    try {
      const { view, state } = this.editor;

      // Get position at the start of the DOM element
      const pos = view.posAtDOM(element, 0);

      // For block nodes, posAtDOM might return the position inside the node
      // We need to find the position just before the node
      const $pos = state.doc.resolve(pos);

      // Check if we're inside the node, if so, get the position before it
      if ($pos.parent.type.name === 'databaseTable') {
        // We're inside, return the start position of the parent
        return $pos.before();
      }

      // Otherwise, check if the node at this position is our target
      const node = state.doc.nodeAt(pos);
      if (node && node.type.name === 'databaseTable') {
        return pos;
      }

      // Try to find the node by looking before the current position
      const nodeBefore = state.doc.nodeAt(pos - 1);
      if (nodeBefore && nodeBefore.type.name === 'databaseTable') {
        return pos - 1;
      }

      console.warn('Could not find databaseTable node at position', pos);
      return pos; // Return the position anyway, let the delete command handle it
    } catch (_error) {
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
        this.renderDatabaseTables();
      }
    });

    // Start observing
    this.observer.observe(this.el.nativeElement, {
      childList: true,
      subtree: true,
    });
  }
}
