import {
  Directive,
  ElementRef,
  inject,
  OnInit,
  OnDestroy,
  ViewContainerRef,
  ComponentRef,
  Renderer2,
  Input
} from '@angular/core';
import { DocumentTasksSectionComponent } from '../components/document-tasks-section/document-tasks-section';

@Directive({
  selector: '[appTaskSectionRenderer]',
  standalone: true,
})
export class TaskSectionRendererDirective implements OnInit, OnDestroy {
  private el = inject(ElementRef);
  private viewContainerRef = inject(ViewContainerRef);
  private renderer = inject(Renderer2);

  @Input() documentId!: string;

  private componentRefs: ComponentRef<DocumentTasksSectionComponent>[] = [];
  private observer: MutationObserver | null = null;

  ngOnInit() {
    this.renderTaskSections();
    this.observeChanges();
  }

  ngOnDestroy() {
    this.componentRefs.forEach(ref => ref.destroy());
    this.componentRefs = [];

    if (this.observer) {
      this.observer.disconnect();
    }
  }

  private renderTaskSections() {
    const taskSections = this.el.nativeElement.querySelectorAll('[data-type="task-section"]');

    taskSections.forEach((section: HTMLElement) => {
      // Skip if already rendered
      if (section.classList.contains('task-section-rendered')) {
        return;
      }

      // Clear placeholder content
      section.innerHTML = '';

      // Add rendered class
      this.renderer.addClass(section, 'task-section-rendered');

      // Get document ID from attribute or use input
      const documentId = section.getAttribute('data-document-id') || this.documentId;

      if (!documentId) {
        console.warn('No document ID found for task section');
        return;
      }

      // Create component
      const componentRef = this.viewContainerRef.createComponent(DocumentTasksSectionComponent);
      componentRef.setInput('documentId', documentId);

      // Append component to section
      this.renderer.appendChild(section, componentRef.location.nativeElement);

      // Store ref for cleanup
      this.componentRefs.push(componentRef);
    });
  }

  private observeChanges() {
    this.observer = new MutationObserver((mutations) => {
      let shouldRender = false;

      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement;
            if (
              element.getAttribute('data-type') === 'task-section' ||
              element.querySelector('[data-type="task-section"]')
            ) {
              shouldRender = true;
            }
          }
        });
      });

      if (shouldRender) {
        // Small delay to ensure DOM is ready
        setTimeout(() => this.renderTaskSections(), 0);
      }
    });

    this.observer.observe(this.el.nativeElement, {
      childList: true,
      subtree: true,
    });
  }
}
