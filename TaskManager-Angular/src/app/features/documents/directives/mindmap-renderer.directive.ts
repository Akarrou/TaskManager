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
  MindmapNodeAttributes,
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
   * Track created component references for cleanup
   */
  private componentRefs: ComponentRef<MindmapBlockComponent>[] = [];

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
      if (block.classList.contains('mindmap-rendered')) {
        return;
      }

      const mindmapId = block.getAttribute('data-mindmap-id') || '';
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
   */
  private updateNodeAttributes(
    element: HTMLElement,
    mindmapId: string,
    data: MindmapData
  ) {
    // Update DOM attributes
    element.setAttribute('data-mindmap-data', JSON.stringify(data));

    // Update TipTap node
    if (this.editor) {
      const pos = this.findNodePosition(element);
      if (pos !== null) {
        this.editor.commands.command(({ tr }) => {
          const attrs: MindmapNodeAttributes = {
            mindmapId,
            data,
          };
          tr.setNodeMarkup(pos, undefined, attrs);
          return true;
        });
      }
    }
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
      let pos = view.posAtDOM(element, 0);
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
