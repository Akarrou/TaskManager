import { Component, input, output, inject, signal, computed, DestroyRef, HostListener } from '@angular/core';
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { combineLatest, filter } from 'rxjs';
import { DocumentTabsStore } from '../../../features/documents/store/document-tabs.store';
import { DocumentStore } from '../../../features/documents/store/document.store';
import { ProjectStore } from '../../../features/projects/store/project.store';
import { PinnedDocumentStore } from '../../../features/documents/store/pinned-document.store';
import { Document } from '../../../features/documents/services/document.service';

@Component({
  selector: 'app-document-sidebar',
  standalone: true,
  imports: [MatIconModule, MatIconButton, MatTooltipModule],
  templateUrl: './document-sidebar.component.html',
  styleUrls: ['./document-sidebar.component.scss'],
})
export class DocumentSidebarComponent {
  /** Whether the sidebar is pinned open (persisted) */
  pinned = input<boolean>(false);
  pinnedChange = output<boolean>();

  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private tabsStore = inject(DocumentTabsStore);
  private documentStore = inject(DocumentStore);
  private projectStore = inject(ProjectStore);
  private pinnedStore = inject(PinnedDocumentStore);

  /** Hover state for overlay mode */
  hovered = signal(false);
  private hideTimeout: ReturnType<typeof setTimeout> | null = null;

  /** Sidebar is visible when pinned OR hovered */
  isVisible = computed(() => this.pinned() || this.hovered());

  /** Overlay mode = visible but not pinned */
  isOverlay = computed(() => !this.pinned() && this.hovered());

  expandedIds = signal(new Set<string>());

  allTabs = this.tabsStore.allTabsWithItems;
  documentMap = this.documentStore.entityMap;
  pinnedSet = this.pinnedStore.pinnedSet;

  /** Pre-computed map of documentId -> title for template use */
  documentTitles = computed(() => {
    const docMap = this.documentMap();
    const titles: Record<string, string> = {};
    for (const [id, doc] of Object.entries(docMap)) {
      titles[id] = doc.title || 'Sans titre';
    }
    return titles;
  });

  pinnedDocuments = computed((): Document[] => {
    const ids = this.pinnedStore.pinnedIds();
    const docMap = this.documentMap();
    return ids
      .map((id) => docMap[id])
      .filter((doc): doc is Document => !!doc);
  });

  isLoading = computed(() =>
    this.tabsStore.isLoading() || this.documentStore.loading() || this.pinnedStore.loading()
  );

  hasProject = computed(() => !!this.projectStore.selectedProject());

  /** Whether all tabs AND sections are expanded */
  allExpanded = computed(() => {
    const tabs = this.allTabs();
    if (tabs.length === 0) return false;
    const ids = this.expandedIds();
    return tabs.every((tab) =>
      ids.has(tab.id) && tab.sections.every((s) => ids.has(s.id))
    );
  });

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.isOverlay()) {
      this.hovered.set(false);
    }
  }

  constructor() {
    // Load data when sidebar becomes visible and project is selected
    combineLatest([
      toObservable(computed(() => this.projectStore.selectedProject())),
      toObservable(this.isVisible),
    ]).pipe(
      filter(([project, visible]) => !!project && visible),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(([project]) => {
      if (this.tabsStore.currentProjectId() !== project!.id) {
        this.tabsStore.loadTabs({ projectId: project!.id });
      }
      if (this.documentStore.allDocuments().length === 0) {
        this.documentStore.loadDocumentsByProject({ projectId: project!.id });
      }
      if (this.pinnedStore.currentProjectId() !== project!.id) {
        this.pinnedStore.loadPinned({ projectId: project!.id });
      }
    });

    // Cleanup timeouts on destroy
    this.destroyRef.onDestroy(() => this.clearHideTimeout());
  }

  // --- Hover trigger management ---

  onTriggerEnter(): void {
    this.clearHideTimeout();
    this.hovered.set(true);
  }

  onTriggerLeave(): void {
    if (!this.pinned()) {
      this.hideTimeout = setTimeout(() => this.hovered.set(false), 400);
    }
  }

  onPanelEnter(): void {
    this.clearHideTimeout();
  }

  onPanelLeave(): void {
    if (!this.pinned()) {
      this.hideTimeout = setTimeout(() => this.hovered.set(false), 300);
    }
  }

  onBackdropClick(): void {
    this.hovered.set(false);
  }

  // --- Pin/Unpin ---

  togglePin(): void {
    this.pinnedChange.emit(!this.pinned());
    if (this.pinned()) {
      this.hovered.set(false);
    }
  }

  // --- Expand/Collapse ---

  toggleExpandAll(): void {
    if (this.allExpanded()) {
      this.expandedIds.set(new Set());
    } else {
      const ids = new Set<string>();
      for (const tab of this.allTabs()) {
        ids.add(tab.id);
        for (const section of tab.sections) {
          ids.add(section.id);
        }
      }
      this.expandedIds.set(ids);
    }
  }

  toggleExpand(id: string): void {
    const current = new Set(this.expandedIds());
    if (current.has(id)) {
      current.delete(id);
    } else {
      current.add(id);
    }
    this.expandedIds.set(current);
  }

  isExpanded(id: string): boolean {
    return this.expandedIds().has(id);
  }

  // --- Document navigation ---

  onDocumentClick(docId: string): void {
    this.router.navigate(['/documents', docId]);
    if (!this.pinned()) {
      this.hovered.set(false);
    }
  }

  onTogglePin(event: MouseEvent, docId: string): void {
    event.stopPropagation();
    const project = this.projectStore.selectedProject();
    if (!project) return;

    if (this.pinnedSet().has(docId)) {
      this.pinnedStore.unpin({ documentId: docId });
    } else {
      this.pinnedStore.pin({ documentId: docId, projectId: project.id });
    }
  }

  private clearHideTimeout(): void {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
  }
}
