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
import { SpreadsheetBlockComponent } from '../components/spreadsheet-block/spreadsheet-block.component';
import { SpreadsheetNodeAttributes, createDefaultSpreadsheetConfig } from '../models/spreadsheet.model';

/**
 * SpreadsheetRendererDirective
 *
 * This directive detects spreadsheet blocks in the TipTap editor and dynamically
 * creates Angular components to render them. It follows the same pattern as
 * DatabaseTableRendererDirective but handles spreadsheet-specific rendering.
 *
 * Usage:
 * <div appSpreadsheetRenderer [documentId]="documentId" [editor]="editor"></div>
 */
@Directive({
  selector: '[appSpreadsheetRenderer]',
  standalone: true,
})
export class SpreadsheetRendererDirective implements OnInit, OnDestroy {
  private el = inject(ElementRef);
  private viewContainerRef = inject(ViewContainerRef);
  private renderer = inject(Renderer2);

  /**
   * Document ID (required for creating spreadsheets)
   */
  @Input() documentId!: string;

  /**
   * TipTap Editor instance (required for updating node attributes)
   */
  @Input() editor?: Editor;

  /**
   * Callback to update TipTap node attributes when spreadsheet changes
   */
  @Input() onDataChange?: (element: HTMLElement, attrs: SpreadsheetNodeAttributes) => void;

  /**
   * Track created component references for cleanup
   */
  private componentRefs: ComponentRef<SpreadsheetBlockComponent>[] = [];

  /**
   * MutationObserver to detect new spreadsheet blocks added dynamically
   */
  private observer: MutationObserver | null = null;

  ngOnInit() {
    this.renderSpreadsheets();
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
   * Find and render all spreadsheet blocks in the editor
   */
  private renderSpreadsheets() {
    const spreadsheetBlocks = this.el.nativeElement.querySelectorAll(
      '[data-type="spreadsheet"]'
    );

    spreadsheetBlocks.forEach((block: HTMLElement) => {
      // Skip if already rendered
      if (block.classList.contains('spreadsheet-rendered')) {
        return;
      }

      // Extract attributes from the block
      const spreadsheetId = block.getAttribute('data-spreadsheet-id') || '';
      const configAttr = block.getAttribute('data-config');
      const storageMode = block.getAttribute('data-storage-mode') || 'supabase';

      // Parse config
      let config = null;
      if (configAttr) {
        try {
          config = JSON.parse(configAttr);
        } catch (error) {
          console.error('Failed to parse spreadsheet config:', error);
          return;
        }
      }

      // Use default config if not provided
      if (!config) {
        config = createDefaultSpreadsheetConfig();
      }

      // Clear placeholder content
      block.innerHTML = '';

      // Mark as rendered
      this.renderer.addClass(block, 'spreadsheet-rendered');

      // Create the Angular component
      const componentRef = this.viewContainerRef.createComponent(
        SpreadsheetBlockComponent
      );

      // Set component inputs
      componentRef.setInput('spreadsheetId', spreadsheetId);
      componentRef.setInput('documentId', this.documentId);
      componentRef.setInput('config', config);
      componentRef.setInput('storageMode', storageMode);

      // Always set the data change callback to handle updates and deletions
      componentRef.setInput('onDataChange', (attrs: SpreadsheetNodeAttributes) => {
        this.updateNodeAttributes(block, attrs);
      });

      // Append component to the block
      this.renderer.appendChild(block, componentRef.location.nativeElement);

      // Store reference for cleanup
      this.componentRefs.push(componentRef);
    });
  }

  /**
   * Update TipTap node attributes when spreadsheet changes
   */
  private updateNodeAttributes(element: HTMLElement, attrs: SpreadsheetNodeAttributes) {
    // Handle spreadsheet deletion: remove the node from TipTap
    if (attrs.deleted) {
      this.deleteNode(element);
      return;
    }

    // Update DOM attributes (for immediate visual update)
    element.setAttribute('data-spreadsheet-id', attrs.spreadsheetId);
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
          console.warn('Failed to update spreadsheet node attributes');
        }
      }
    } else {
      // Fallback: use callback if provided
      if (this.onDataChange) {
        this.onDataChange(element, attrs);
      }
    }
  }

  /**
   * Delete a spreadsheet node from the TipTap editor
   */
  private deleteNode(element: HTMLElement): void {
    if (!this.editor) {
      console.error('Cannot delete spreadsheet node: editor not available');
      return;
    }

    const pos = this.findNodePosition(element);
    if (pos === null) {
      console.error('Cannot delete spreadsheet node: position not found');
      return;
    }

    // Delete the node at the found position
    const success = this.editor
      .chain()
      .focus()
      .command(({ tr, state, dispatch }) => {
        const node = state.doc.nodeAt(pos);
        if (!node) {
          return false;
        }

        if (dispatch) {
          tr.delete(pos, pos + node.nodeSize);
        }
        return true;
      })
      .run();

    if (success) {
      // Destroy the Angular component reference
      this.destroyComponentForElement(element);
    }
  }

  /**
   * Destroy the Angular component associated with an element
   */
  private destroyComponentForElement(element: HTMLElement): void {
    const index = this.componentRefs.findIndex(
      ref => ref.location.nativeElement.closest('[data-type="spreadsheet"]') === element
    );

    if (index !== -1) {
      this.componentRefs[index].destroy();
      this.componentRefs.splice(index, 1);
    }
  }

  /**
   * Find the position of a TipTap node from a DOM element
   */
  private findNodePosition(element: HTMLElement): number | null {
    if (!this.editor) return null;

    const { view, state } = this.editor;

    try {
      // Get position at the start of the DOM element
      let pos = view.posAtDOM(element, 0);

      // For block nodes, posAtDOM might return the position inside the node
      const $pos = state.doc.resolve(pos);

      // Check if we're inside the node
      if ($pos.parent.type.name === 'spreadsheet') {
        return $pos.before();
      }

      // Check if the node at this position is our target
      const node = state.doc.nodeAt(pos);
      if (node && node.type.name === 'spreadsheet') {
        return pos;
      }

      // Try to find the node by looking before the current position
      const nodeBefore = state.doc.nodeAt(pos - 1);
      if (nodeBefore && nodeBefore.type.name === 'spreadsheet') {
        return pos - 1;
      }

      return pos;
    } catch (error) {
      console.error('Failed to find spreadsheet node position:', error);
      return null;
    }
  }

  /**
   * Observe DOM changes to detect new spreadsheet blocks added dynamically
   */
  private observeChanges() {
    this.observer = new MutationObserver((mutations) => {
      let shouldRender = false;

      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement;
            // Check if the added node is a spreadsheet or contains one
            if (
              element.getAttribute('data-type') === 'spreadsheet' ||
              element.querySelector('[data-type="spreadsheet"]')
            ) {
              shouldRender = true;
            }
          }
        });
      });

      if (shouldRender) {
        // Small delay to ensure DOM is stable
        setTimeout(() => this.renderSpreadsheets(), 0);
      }
    });

    // Start observing
    this.observer.observe(this.el.nativeElement, {
      childList: true,
      subtree: true,
    });
  }
}
