import {
  Directive,
  OnDestroy,
  AfterViewInit,
  ElementRef,
  Renderer2,
  inject,
  input,
  effect,
} from '@angular/core';
import { Editor } from '@tiptap/core';

/**
 * CommentIndicatorDirective
 *
 * Directive that adds visual indicators to blocks that have comments.
 * Uses Angular signals to react to changes in blocksWithComments.
 */
@Directive({
  selector: '[appCommentIndicator]',
  standalone: true,
})
export class CommentIndicatorDirective implements AfterViewInit, OnDestroy {
  // Signal inputs
  editor = input.required<Editor>();
  blocksWithComments = input.required<Set<string>>();
  blockCommentCounts = input.required<Map<string, number>>();

  private el = inject(ElementRef);
  private renderer = inject(Renderer2);
  private indicatorElements: Map<string, HTMLElement> = new Map();
  private viewInitialized = false;

  constructor() {
    // Effect that reacts to signal changes
    effect(() => {
      // Read signals to track them
      const blocks = this.blocksWithComments();
      const counts = this.blockCommentCounts();

      // Only update if view is initialized
      if (this.viewInitialized) {
        this.updateIndicators(blocks, counts);
      }
    });
  }

  ngAfterViewInit(): void {
    this.viewInitialized = true;
    // Initial update
    this.updateIndicators(this.blocksWithComments(), this.blockCommentCounts());
  }

  ngOnDestroy(): void {
    this.removeAllIndicators();
  }

  private updateIndicators(blocksWithComments: Set<string>, blockCommentCounts: Map<string, number>): void {
    const editorElement = this.el.nativeElement.querySelector('.ProseMirror');
    if (!editorElement) return;

    // Find all blocks with data-block-id attribute
    const blocksWithIds = editorElement.querySelectorAll('[data-block-id]');

    // Track which blocks we've seen
    const seenBlockIds = new Set<string>();

    blocksWithIds.forEach((block: Element) => {
      const blockId = block.getAttribute('data-block-id');
      if (!blockId) return;

      seenBlockIds.add(blockId);

      const hasComments = blocksWithComments.has(blockId);
      const commentCount = blockCommentCounts.get(blockId) || 0;

      if (hasComments) {
        // Add class to block if not already present
        if (!block.classList.contains('has-comments')) {
          this.renderer.addClass(block, 'has-comments');
        }

        // Add or update indicator
        this.addOrUpdateIndicator(block as HTMLElement, blockId, commentCount);
      } else {
        // Remove class and indicator if present
        if (block.classList.contains('has-comments')) {
          this.renderer.removeClass(block, 'has-comments');
        }
        this.removeIndicator(blockId);
      }
    });

    // Clean up indicators for blocks that no longer exist
    this.indicatorElements.forEach((_, blockId) => {
      if (!seenBlockIds.has(blockId)) {
        this.removeIndicator(blockId);
      }
    });
  }

  private addOrUpdateIndicator(block: HTMLElement, blockId: string, count: number): void {
    let indicator = this.indicatorElements.get(blockId);

    if (!indicator) {
      // Create new indicator
      const newIndicator: HTMLElement = this.renderer.createElement('button');
      this.renderer.addClass(newIndicator, 'block-comment-indicator');
      this.renderer.setAttribute(newIndicator, 'data-block-id', blockId);
      this.renderer.setAttribute(newIndicator, 'type', 'button');
      this.renderer.setAttribute(newIndicator, 'title', `${count} commentaire${count > 1 ? 's' : ''}`);

      // Make block position relative for absolute positioning of indicator
      this.renderer.setStyle(block, 'position', 'relative');

      // Append indicator to block
      this.renderer.appendChild(block, newIndicator);
      this.indicatorElements.set(blockId, newIndicator);
      indicator = newIndicator;
    }

    // Update count and title
    indicator.textContent = count.toString();
    this.renderer.setAttribute(indicator, 'title', `${count} commentaire${count > 1 ? 's' : ''}`);
  }

  private removeIndicator(blockId: string): void {
    const indicator = this.indicatorElements.get(blockId);
    if (indicator && indicator.parentNode) {
      this.renderer.removeChild(indicator.parentNode, indicator);
    }
    this.indicatorElements.delete(blockId);
  }

  private removeAllIndicators(): void {
    this.indicatorElements.forEach((indicator) => {
      if (indicator.parentNode) {
        this.renderer.removeChild(indicator.parentNode, indicator);
      }
    });
    this.indicatorElements.clear();
  }
}
