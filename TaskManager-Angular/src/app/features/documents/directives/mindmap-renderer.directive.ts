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
import { MindmapBlockComponent } from '../components/mindmap-block/mindmap-block.component';
import {
  MindmapData,
  createDefaultMindmapData,
} from '../models/mindmap.model';

/**
 * MindmapRendererDirective
 *
 * Detects mindmap blocks in TipTap editor and dynamically creates
 * Angular components to render them.
 *
 * Usage:
 * <div appMindmapRenderer [editor]="editor" [documentId]="documentId"></div>
 */
@Directive({
  selector: '[appMindmapRenderer]',
  standalone: true,
})
export class MindmapRendererDirective implements OnInit, OnDestroy {
  private el = inject(ElementRef);
  private viewContainerRef = inject(ViewContainerRef);
  private renderer = inject(Renderer2);

  /**
   * TipTap Editor instance
   */
  @Input() editor?: Editor;

  /**
   * Document ID for context
   */
  @Input() documentId?: string;

  /**
   * Track created component references for cleanup, keyed by mindmapId
   */
  private componentRefs: ComponentRef<MindmapBlockComponent>[] = [];

  /**
   * Track which mindmap IDs have been rendered to prevent re-creation
   */
  private renderedMindmapIds = new Set<string>();

  /**
   * MutationObserver for detecting new mindmap blocks
   */
  private observer: MutationObserver | null = null;

  ngOnInit() {
    this.renderMindmaps();
    this.observeChanges();
  }

  ngOnDestroy() {
    this.componentRefs.forEach((ref) => ref.destroy());
    this.componentRefs = [];
    this.renderedMindmapIds.clear();

    if (this.observer) {
      this.observer.disconnect();
    }
  }

  /**
   * Find and render all mindmap blocks
   */
  private renderMindmaps() {
    const mindmapBlocks = this.el.nativeElement.querySelectorAll(
      '[data-type="mindmap"]'
    );

    mindmapBlocks.forEach((block: HTMLElement) => {
      const mindmapId = block.getAttribute('data-mindmap-id') || '';

      // Skip if this mindmap ID already has a rendered component
      // (This prevents re-creation when TipTap re-renders the DOM)
      if (this.renderedMindmapIds.has(mindmapId) && mindmapId !== '') {
        // Just re-mark the block as rendered and re-attach existing component
        if (!block.classList.contains('mindmap-rendered')) {
          this.renderer.addClass(block, 'mindmap-rendered');
          // Find existing component and re-attach if needed
          const existingRef = this.componentRefs.find(
            (ref) => ref.instance.mindmapId === mindmapId
          );
          if (existingRef && !block.contains(existingRef.location.nativeElement)) {
            block.innerHTML = '';
            this.renderer.appendChild(block, existingRef.location.nativeElement);
          }
        }
        return;
      }

      if (block.classList.contains('mindmap-rendered')) {
        return;
      }

      const dataAttr = block.getAttribute('data-mindmap-data');

      let data: MindmapData;
      try {
        data = dataAttr ? JSON.parse(dataAttr) : createDefaultMindmapData();
      } catch {
        data = createDefaultMindmapData();
      }

      // Clear placeholder content
      block.innerHTML = '';

      // Mark as rendered
      this.renderer.addClass(block, 'mindmap-rendered');
      if (mindmapId) {
        this.renderedMindmapIds.add(mindmapId);
      }

      // Create the Angular component
      const componentRef = this.viewContainerRef.createComponent(
        MindmapBlockComponent
      );

      // Set component inputs
      componentRef.setInput('mindmapId', mindmapId);
      componentRef.setInput('data', data);
      componentRef.setInput('onDataChange', (newData: MindmapData) => {
        this.updateNodeAttributes(block, mindmapId, newData);
      });
      componentRef.setInput('onDelete', () => {
        this.deleteNode(block);
      });

      // Append component to block
      this.renderer.appendChild(block, componentRef.location.nativeElement);

      // Store reference for cleanup
      this.componentRefs.push(componentRef);
    });
  }

  /**
   * Update TipTap node attributes when mindmap changes
   * The NodeView in the extension prevents DOM re-creation, so we just update the ProseMirror doc
   */
  private updateNodeAttributes(
    _element: HTMLElement,
    mindmapId: string,
    data: MindmapData
  ) {
    // Update TipTap node by finding it by mindmapId (not by DOM element)
    if (this.editor) {
      const pos = this.findNodePositionById(mindmapId);
      if (pos !== null) {
        this.editor.commands.command(({ tr, state }) => {
          const node = state.doc.nodeAt(pos);
          if (node && node.type.name === 'mindmap') {
            const newAttrs = {
              ...node.attrs,
              data,
            };
            tr.setNodeMarkup(pos, undefined, newAttrs);
            tr.setMeta('addToHistory', true);
            tr.setMeta('mindmapUpdate', true);
          }
          return true;
        });
      }
    }
  }

  /**
   * Find TipTap node position by mindmapId
   */
  private findNodePositionById(mindmapId: string): number | null {
    if (!this.editor) return null;

    const { state } = this.editor;
    let foundPos: number | null = null;

    state.doc.descendants((node, pos) => {
      if (node.type.name === 'mindmap' && node.attrs['mindmapId'] === mindmapId) {
        foundPos = pos;
        return false; // Stop iteration
      }
      return true;
    });

    return foundPos;
  }

  /**
   * Delete a mindmap node from the TipTap editor
   */
  private deleteNode(element: HTMLElement): void {
    if (!this.editor) {
      return;
    }

    const pos = this.findNodePosition(element);
    if (pos === null) {
      return;
    }

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
      this.destroyComponentForElement(element);
    }
  }

  /**
   * Destroy the Angular component associated with an element
   */
  private destroyComponentForElement(element: HTMLElement): void {
    const index = this.componentRefs.findIndex(
      (ref) =>
        ref.location.nativeElement.closest('[data-type="mindmap"]') === element
    );

    if (index !== -1) {
      // Remove from renderedMindmapIds
      const mindmapId = this.componentRefs[index].instance.mindmapId;
      if (mindmapId) {
        this.renderedMindmapIds.delete(mindmapId);
      }

      this.componentRefs[index].destroy();
      this.componentRefs.splice(index, 1);
    }
  }

  /**
   * Find TipTap node position from DOM element
   */
  private findNodePosition(element: HTMLElement): number | null {
    if (!this.editor) return null;

    const { view, state } = this.editor;

    try {
      const pos = view.posAtDOM(element, 0);
      const $pos = state.doc.resolve(pos);

      if ($pos.parent.type.name === 'mindmap') {
        return $pos.before();
      }

      const node = state.doc.nodeAt(pos);
      if (node && node.type.name === 'mindmap') {
        return pos;
      }

      const nodeBefore = state.doc.nodeAt(pos - 1);
      if (nodeBefore && nodeBefore.type.name === 'mindmap') {
        return pos - 1;
      }

      return pos;
    } catch {
      return null;
    }
  }

  /**
   * Observe DOM changes for dynamically added mindmap blocks
   */
  private observeChanges() {
    this.observer = new MutationObserver((mutations) => {
      let shouldRender = false;

      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement;
            if (
              element.getAttribute('data-type') === 'mindmap' ||
              element.querySelector('[data-type="mindmap"]')
            ) {
              shouldRender = true;
            }
          }
        });
      });

      if (shouldRender) {
        setTimeout(() => this.renderMindmaps(), 0);
      }
    });

    this.observer.observe(this.el.nativeElement, {
      childList: true,
      subtree: true,
    });
  }
}
