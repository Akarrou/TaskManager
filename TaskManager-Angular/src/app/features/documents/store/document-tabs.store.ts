import { computed, inject } from '@angular/core';
import { signalStore, withState, withMethods, withComputed, patchState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, tap, switchMap, catchError, of } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DocumentTabsService } from '../services/document-tabs.service';
import {
  DocumentTab,
  DocumentTabGroup,
  DocumentSection,
  DocumentTabItem,
  CreateDocumentTab,
  UpdateDocumentTab,
  CreateDocumentTabGroup,
  UpdateDocumentTabGroup,
  CreateDocumentSection,
  UpdateDocumentSection,
  DocumentDropTarget,
  TabWithItems,
  TabGroupWithTabs,
  SectionWithItems,
} from '../models/document-tabs.model';

/**
 * State interface for DocumentTabs store
 */
interface DocumentTabsState {
  tabs: DocumentTab[];
  groups: DocumentTabGroup[];
  sections: DocumentSection[];
  items: DocumentTabItem[];
  selectedTabId: string | null;
  loading: boolean;
  error: string | null;
  currentProjectId: string | null;
}

/**
 * Initial state
 */
const initialState: DocumentTabsState = {
  tabs: [],
  groups: [],
  sections: [],
  items: [],
  selectedTabId: null,
  loading: false,
  error: null,
  currentProjectId: null,
};

/**
 * NgRx Signal Store for Document Tabs
 *
 * Manages tabs, sections, and document organization with drag & drop support.
 *
 * @example
 * ```typescript
 * export class DocumentListComponent {
 *   private tabsStore = inject(DocumentTabsStore);
 *
 *   tabs = this.tabsStore.tabs;
 *   selectedTab = this.tabsStore.selectedTabWithItems;
 *
 *   ngOnInit() {
 *     this.tabsStore.loadTabs({ projectId: this.projectId });
 *   }
 *
 *   onCreateTab() {
 *     this.tabsStore.createTab({
 *       tab: { project_id: this.projectId, name: 'New Tab' }
 *     });
 *   }
 * }
 * ```
 */
export const DocumentTabsStore = signalStore(
  { providedIn: 'root' },

  // Initial state
  withState<DocumentTabsState>(initialState),

  // Computed properties
  withComputed((store) => ({
    /**
     * Get tabs sorted by position
     */
    sortedTabs: computed(() =>
      [...store.tabs()].sort((a, b) => a.position - b.position)
    ),

    /**
     * Get the currently selected tab
     */
    selectedTab: computed(() => {
      const tabId = store.selectedTabId();
      if (!tabId) return null;
      return store.tabs().find((t) => t.id === tabId) ?? null;
    }),

    /**
     * Get sections for the selected tab
     */
    selectedTabSections: computed(() => {
      const tabId = store.selectedTabId();
      if (!tabId) return [];
      return store
        .sections()
        .filter((s) => s.tab_id === tabId)
        .sort((a, b) => a.position - b.position);
    }),

    /**
     * Get items for the selected tab
     */
    selectedTabItems: computed(() => {
      const tabId = store.selectedTabId();
      if (!tabId) return [];
      return store
        .items()
        .filter((i) => i.tab_id === tabId)
        .sort((a, b) => a.position - b.position);
    }),

    /**
     * Get the selected tab with all its sections and items organized
     */
    selectedTabWithItems: computed((): TabWithItems | null => {
      const tabId = store.selectedTabId();
      if (!tabId) return null;

      const tab = store.tabs().find((t) => t.id === tabId);
      if (!tab) return null;

      const tabSections = store
        .sections()
        .filter((s) => s.tab_id === tabId)
        .sort((a, b) => a.position - b.position);

      const tabItems = store.items().filter((i) => i.tab_id === tabId);

      const sectionsWithItems: SectionWithItems[] = tabSections.map((section) => ({
        ...section,
        items: tabItems
          .filter((i) => i.section_id === section.id)
          .sort((a, b) => a.position - b.position),
      }));

      const unsectionedItems = tabItems
        .filter((i) => !i.section_id)
        .sort((a, b) => a.position - b.position);

      return {
        ...tab,
        sections: sectionsWithItems,
        unsectionedItems,
      };
    }),

    /**
     * Get all document IDs that are organized in tabs
     */
    organizedDocumentIds: computed(() =>
      new Set(store.items().map((i) => i.document_id))
    ),

    /**
     * Get item count per tab (for delete restriction)
     */
    tabItemCounts: computed(() => {
      const counts = new Map<string, number>();
      const items = store.items();

      // Initialize all tabs with 0
      store.tabs().forEach(tab => {
        counts.set(tab.id, 0);
      });

      // Count items per tab
      items.forEach(item => {
        const current = counts.get(item.tab_id) || 0;
        counts.set(item.tab_id, current + 1);
      });

      return counts;
    }),

    /**
     * Get groups sorted by position
     */
    sortedGroups: computed(() =>
      [...store.groups()].sort((a, b) => a.position - b.position)
    ),

    /**
     * Get tabs organized by groups
     */
    tabsByGroup: computed((): TabGroupWithTabs[] => {
      const groups = [...store.groups()].sort((a, b) => a.position - b.position);
      const tabs = store.tabs();

      return groups.map(group => ({
        ...group,
        tabs: tabs
          .filter(t => t.tab_group_id === group.id)
          .sort((a, b) => a.position - b.position),
      }));
    }),

    /**
     * Get ungrouped tabs (tabs not in any group)
     */
    ungroupedTabs: computed(() =>
      store.tabs()
        .filter(t => !t.tab_group_id)
        .sort((a, b) => a.position - b.position)
    ),

    /**
     * Check if store is in loading state
     */
    isLoading: computed(() => store.loading()),

    /**
     * Get all drop list IDs for CDK drag-drop connectivity
     */
    allDropListIds: computed(() => {
      const ids: string[] = ['unorganized-documents'];
      const tabs = store.tabs();
      const sections = store.sections();

      for (const tab of tabs) {
        // Unsectioned area for each tab
        ids.push(`tab-${tab.id}-unsectioned`);

        // Each section within the tab
        const tabSections = sections.filter((s) => s.tab_id === tab.id);
        for (const section of tabSections) {
          ids.push(`section-${section.id}`);
        }
      }

      return ids;
    }),
  })),

  // Methods
  withMethods((
    store,
    tabsService = inject(DocumentTabsService),
    snackBar = inject(MatSnackBar)
  ) => ({
    // =====================================================================
    // TAB OPERATIONS
    // =====================================================================

    /**
     * Load tabs, groups, sections, and items for a project
     */
    loadTabs: rxMethod<{ projectId: string }>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        switchMap(({ projectId }) =>
          tabsService.getTabsWithItemsByProject(projectId).pipe(
            tap(({ tabs, groups, sections, items }) => {
              const selectedTabId = tabs.find((t) => t.is_default)?.id ?? tabs[0]?.id ?? null;
              patchState(store, {
                tabs,
                groups,
                sections,
                items,
                selectedTabId,
                loading: false,
                currentProjectId: projectId,
              });
            }),
            catchError((error: Error) => {
              patchState(store, { error: error.message, loading: false });
              snackBar.open('Erreur lors du chargement des onglets', 'Fermer', { duration: 5000 });
              return of(null);
            })
          )
        )
      )
    ),

    /**
     * Create a new tab
     */
    createTab: rxMethod<{ tab: CreateDocumentTab }>(
      pipe(
        switchMap(({ tab }) =>
          tabsService.createTab(tab).pipe(
            tap((newTab) => {
              patchState(store, {
                tabs: [...store.tabs(), newTab],
                selectedTabId: newTab.id,
              });
              snackBar.open('Onglet créé', 'Fermer', { duration: 2000 });
            }),
            catchError((error: Error) => {
              snackBar.open('Erreur lors de la création de l\'onglet', 'Fermer', { duration: 5000 });
              return of(null);
            })
          )
        )
      )
    ),

    /**
     * Update a tab
     */
    updateTab: rxMethod<{ tabId: string; updates: UpdateDocumentTab }>(
      pipe(
        switchMap(({ tabId, updates }) =>
          tabsService.updateTab(tabId, updates).pipe(
            tap((updatedTab) => {
              patchState(store, {
                tabs: store.tabs().map((t) => (t.id === tabId ? updatedTab : t)),
              });
            }),
            catchError((error: Error) => {
              snackBar.open('Erreur lors de la mise à jour de l\'onglet', 'Fermer', { duration: 5000 });
              return of(null);
            })
          )
        )
      )
    ),

    /**
     * Delete a tab
     */
    deleteTab: rxMethod<{ tabId: string }>(
      pipe(
        switchMap(({ tabId }) =>
          tabsService.deleteTab(tabId).pipe(
            tap(() => {
              const remainingTabs = store.tabs().filter((t) => t.id !== tabId);
              const newSelectedTabId =
                store.selectedTabId() === tabId
                  ? remainingTabs[0]?.id ?? null
                  : store.selectedTabId();

              patchState(store, {
                tabs: remainingTabs,
                sections: store.sections().filter((s) => s.tab_id !== tabId),
                items: store.items().filter((i) => i.tab_id !== tabId),
                selectedTabId: newSelectedTabId,
              });
              snackBar.open('Onglet supprimé', 'Fermer', { duration: 2000 });
            }),
            catchError((error: Error) => {
              snackBar.open('Erreur lors de la suppression de l\'onglet', 'Fermer', { duration: 5000 });
              return of(null);
            })
          )
        )
      )
    ),

    /**
     * Reorder tabs
     */
    reorderTabs: rxMethod<{ tabIds: string[] }>(
      pipe(
        tap(({ tabIds }) => {
          // Optimistic update
          const reorderedTabs = tabIds.map((id, index) => {
            const tab = store.tabs().find((t) => t.id === id);
            return tab ? { ...tab, position: index } : null;
          }).filter(Boolean) as DocumentTab[];
          patchState(store, { tabs: reorderedTabs });
        }),
        switchMap(({ tabIds }) =>
          tabsService.reorderTabs(tabIds).pipe(
            tap((updatedTabs) => {
              patchState(store, { tabs: updatedTabs });
            }),
            catchError((error: Error) => {
              // Reload on error to restore correct state
              const projectId = store.currentProjectId();
              if (projectId) {
                tabsService.getTabsWithItemsByProject(projectId).subscribe(({ tabs }) => {
                  patchState(store, { tabs });
                });
              }
              return of(null);
            })
          )
        )
      )
    ),

    /**
     * Select a tab and persist as default
     */
    selectTab(tabId: string | null): void {
      // Mise à jour immédiate de l'état local
      patchState(store, { selectedTabId: tabId });

      // Persister en BDD si on a un projectId et tabId valides
      const projectId = store.currentProjectId();
      if (projectId && tabId) {
        // Mettre à jour is_default en arrière-plan
        tabsService.setDefaultTab(tabId, projectId).subscribe({
          next: () => {
            // Mettre à jour le state local pour refléter is_default
            patchState(store, {
              tabs: store.tabs().map((t) => ({
                ...t,
                is_default: t.id === tabId,
              })),
            });
          },
          error: () => {
            // Silencieux - l'état local reste correct, juste pas persisté
          },
        });
      }
    },

    // =====================================================================
    // TAB GROUP OPERATIONS
    // =====================================================================

    /**
     * Create a new tab group
     */
    createGroup: rxMethod<{ group: CreateDocumentTabGroup }>(
      pipe(
        switchMap(({ group }) =>
          tabsService.createGroup(group).pipe(
            tap((newGroup) => {
              patchState(store, {
                groups: [...store.groups(), newGroup],
              });
              snackBar.open('Groupe créé', 'Fermer', { duration: 2000 });
            }),
            catchError((error: Error) => {
              snackBar.open('Erreur lors de la création du groupe', 'Fermer', { duration: 5000 });
              return of(null);
            })
          )
        )
      )
    ),

    /**
     * Create a group with tabs (for drag-drop group creation)
     */
    createGroupWithTabs: rxMethod<{
      group: CreateDocumentTabGroup;
      tabIds: string[];
    }>(
      pipe(
        switchMap(({ group, tabIds }) =>
          tabsService.createGroupWithTabs(group, tabIds).pipe(
            tap(({ group: newGroup, tabs: updatedTabs }) => {
              patchState(store, {
                groups: [...store.groups(), newGroup],
                tabs: store.tabs().map((t) => {
                  const updated = updatedTabs.find((u) => u.id === t.id);
                  return updated ?? t;
                }),
              });
              snackBar.open('Groupe créé', 'Fermer', { duration: 2000 });
            }),
            catchError((error: Error) => {
              snackBar.open('Erreur lors de la création du groupe', 'Fermer', { duration: 5000 });
              return of(null);
            })
          )
        )
      )
    ),

    /**
     * Update a tab group
     */
    updateGroup: rxMethod<{ groupId: string; updates: UpdateDocumentTabGroup }>(
      pipe(
        switchMap(({ groupId, updates }) =>
          tabsService.updateGroup(groupId, updates).pipe(
            tap((updatedGroup) => {
              patchState(store, {
                groups: store.groups().map((g) =>
                  g.id === groupId ? updatedGroup : g
                ),
              });
            }),
            catchError((error: Error) => {
              snackBar.open('Erreur lors de la mise à jour du groupe', 'Fermer', { duration: 5000 });
              return of(null);
            })
          )
        )
      )
    ),

    /**
     * Delete a tab group (tabs become ungrouped)
     */
    deleteGroup: rxMethod<{ groupId: string }>(
      pipe(
        switchMap(({ groupId }) =>
          tabsService.deleteGroup(groupId).pipe(
            tap(() => {
              // Update tabs to remove group reference
              const updatedTabs = store.tabs().map((t) =>
                t.tab_group_id === groupId ? { ...t, tab_group_id: null } : t
              );
              patchState(store, {
                groups: store.groups().filter((g) => g.id !== groupId),
                tabs: updatedTabs,
              });
              snackBar.open('Groupe supprimé', 'Fermer', { duration: 2000 });
            }),
            catchError((error: Error) => {
              snackBar.open('Erreur lors de la suppression du groupe', 'Fermer', { duration: 5000 });
              return of(null);
            })
          )
        )
      )
    ),

    /**
     * Reorder groups
     */
    reorderGroups: rxMethod<{ groupIds: string[] }>(
      pipe(
        tap(({ groupIds }) => {
          // Optimistic update
          const reorderedGroups = groupIds.map((id, index) => {
            const group = store.groups().find((g) => g.id === id);
            return group ? { ...group, position: index } : null;
          }).filter(Boolean) as DocumentTabGroup[];
          patchState(store, { groups: reorderedGroups });
        }),
        switchMap(({ groupIds }) =>
          tabsService.reorderGroups(groupIds).pipe(
            tap((updatedGroups) => {
              patchState(store, { groups: updatedGroups });
            }),
            catchError(() => of(null))
          )
        )
      )
    ),

    /**
     * Toggle group collapse state (accordion behavior: opening one closes others)
     */
    toggleGroupCollapse(groupId: string): void {
      const group = store.groups().find((g) => g.id === groupId);
      if (!group) return;

      const isOpening = group.is_collapsed;

      if (isOpening) {
        // Accordion behavior: collapse all other groups and expand this one
        // Optimistic update: expand target, collapse all others
        patchState(store, {
          groups: store.groups().map((g) => ({
            ...g,
            is_collapsed: g.id === groupId ? false : true,
          })),
        });

        // Persist all changes to backend
        const updates = store.groups().map((g) =>
          tabsService.updateGroup(g.id, { is_collapsed: g.id !== groupId })
        );

        // Execute all updates (fire and forget, state is already updated)
        updates.forEach((update$) => update$.subscribe());
      } else {
        // Simply collapse this group
        patchState(store, {
          groups: store.groups().map((g) =>
            g.id === groupId ? { ...g, is_collapsed: true } : g
          ),
        });

        tabsService.updateGroup(groupId, { is_collapsed: true }).subscribe();
      }
    },

    /**
     * Move a tab to a group (or remove from group if groupId is null)
     */
    moveTabToGroup: rxMethod<{ tabId: string; groupId: string | null }>(
      pipe(
        tap(({ tabId, groupId }) => {
          // Optimistic update
          patchState(store, {
            tabs: store.tabs().map((t) =>
              t.id === tabId ? { ...t, tab_group_id: groupId } : t
            ),
          });
        }),
        switchMap(({ tabId, groupId }) =>
          tabsService.moveTabToGroup(tabId, groupId).pipe(
            tap((updatedTab) => {
              patchState(store, {
                tabs: store.tabs().map((t) =>
                  t.id === tabId ? updatedTab : t
                ),
              });
              // Note: Empty groups are NOT automatically deleted.
              // User can manually delete empty groups via the group menu.
            }),
            catchError(() => of(null))
          )
        )
      )
    ),

    // =====================================================================
    // SECTION OPERATIONS
    // =====================================================================

    /**
     * Create a new section
     */
    createSection: rxMethod<{ section: CreateDocumentSection }>(
      pipe(
        switchMap(({ section }) =>
          tabsService.createSection(section).pipe(
            tap((newSection) => {
              patchState(store, {
                sections: [...store.sections(), newSection],
              });
              snackBar.open('Section créée', 'Fermer', { duration: 2000 });
            }),
            catchError((error: Error) => {
              snackBar.open('Erreur lors de la création de la section', 'Fermer', { duration: 5000 });
              return of(null);
            })
          )
        )
      )
    ),

    /**
     * Update a section
     */
    updateSection: rxMethod<{ sectionId: string; updates: UpdateDocumentSection }>(
      pipe(
        switchMap(({ sectionId, updates }) =>
          tabsService.updateSection(sectionId, updates).pipe(
            tap((updatedSection) => {
              patchState(store, {
                sections: store.sections().map((s) =>
                  s.id === sectionId ? updatedSection : s
                ),
              });
            }),
            catchError((error: Error) => {
              snackBar.open('Erreur lors de la mise à jour de la section', 'Fermer', { duration: 5000 });
              return of(null);
            })
          )
        )
      )
    ),

    /**
     * Delete a section (items move to unsectioned)
     */
    deleteSection: rxMethod<{ sectionId: string }>(
      pipe(
        switchMap(({ sectionId }) =>
          tabsService.deleteSection(sectionId).pipe(
            tap(() => {
              // Move items to unsectioned (section_id becomes null)
              const updatedItems = store.items().map((i) =>
                i.section_id === sectionId ? { ...i, section_id: null } : i
              );
              patchState(store, {
                sections: store.sections().filter((s) => s.id !== sectionId),
                items: updatedItems,
              });
              snackBar.open('Section supprimée', 'Fermer', { duration: 2000 });
            }),
            catchError((error: Error) => {
              snackBar.open('Erreur lors de la suppression de la section', 'Fermer', { duration: 5000 });
              return of(null);
            })
          )
        )
      )
    ),

    /**
     * Reorder sections within a tab
     */
    reorderSections: rxMethod<{ sectionIds: string[] }>(
      pipe(
        tap(({ sectionIds }) => {
          // Optimistic update
          const reorderedSections = store.sections().map((s) => {
            const newIndex = sectionIds.indexOf(s.id);
            if (newIndex !== -1) {
              return { ...s, position: newIndex };
            }
            return s;
          });
          patchState(store, { sections: reorderedSections });
        }),
        switchMap(({ sectionIds }) =>
          tabsService.reorderSections(sectionIds).pipe(
            tap((updatedSections) => {
              patchState(store, {
                sections: store.sections().map((s) => {
                  const updated = updatedSections.find((u) => u.id === s.id);
                  return updated ?? s;
                }),
              });
            }),
            catchError(() => of(null))
          )
        )
      )
    ),

    /**
     * Toggle section collapse
     */
    toggleSectionCollapse(sectionId: string): void {
      const section = store.sections().find((s) => s.id === sectionId);
      if (section) {
        tabsService.updateSection(sectionId, { is_collapsed: !section.is_collapsed }).subscribe({
          next: (updated) => {
            patchState(store, {
              sections: store.sections().map((s) => (s.id === sectionId ? updated : s)),
            });
          },
        });
      }
    },

    // =====================================================================
    // ITEM OPERATIONS (Document placement)
    // =====================================================================

    /**
     * Add a document to a tab
     */
    addDocumentToTab: rxMethod<{
      documentId: string;
      tabId: string;
      sectionId?: string | null;
      position?: number;
    }>(
      pipe(
        switchMap(({ documentId, tabId, sectionId, position }) =>
          tabsService.addDocumentToTab(documentId, tabId, sectionId, position).pipe(
            tap((newItem) => {
              patchState(store, {
                items: [...store.items(), newItem],
              });
            }),
            catchError((error: Error) => {
              snackBar.open('Erreur lors de l\'ajout du document', 'Fermer', { duration: 5000 });
              return of(null);
            })
          )
        )
      )
    ),

    /**
     * Move a document to a new position (different tab/section)
     */
    moveDocument: rxMethod<{ documentId: string; target: DocumentDropTarget }>(
      pipe(
        tap(({ documentId, target }) => {
          // Optimistic update
          patchState(store, {
            items: store.items().map((i) =>
              i.document_id === documentId
                ? { ...i, tab_id: target.tabId, section_id: target.sectionId, position: target.position }
                : i
            ),
          });
        }),
        switchMap(({ documentId, target }) =>
          tabsService.moveDocument(documentId, target).pipe(
            tap((updatedItem) => {
              patchState(store, {
                items: store.items().map((i) =>
                  i.document_id === documentId ? updatedItem : i
                ),
              });
            }),
            catchError((error: Error) => {
              // Reload on error
              const projectId = store.currentProjectId();
              if (projectId) {
                tabsService.getTabsWithItemsByProject(projectId).subscribe(({ items }) => {
                  patchState(store, { items });
                });
              }
              return of(null);
            })
          )
        )
      )
    ),

    /**
     * Remove a document from a tab
     */
    removeDocumentFromTab: rxMethod<{ documentId: string; tabId?: string }>(
      pipe(
        switchMap(({ documentId, tabId }) => {
          // If tabId not provided, find it from the store
          const item = store.items().find((i) => i.document_id === documentId);
          const effectiveTabId = tabId ?? item?.tab_id;

          if (!effectiveTabId) {
            // Document not in any tab
            return of(null);
          }

          return tabsService.removeDocumentFromTab(documentId, effectiveTabId).pipe(
            tap(() => {
              patchState(store, {
                items: store.items().filter(
                  (i) => !(i.document_id === documentId && i.tab_id === effectiveTabId)
                ),
              });
            }),
            catchError(() => of(null))
          );
        })
      )
    ),

    /**
     * Reorder documents within a section
     */
    reorderDocuments: rxMethod<{
      tabId: string;
      sectionId: string | null;
      documentIds: string[];
    }>(
      pipe(
        tap(({ tabId, sectionId, documentIds }) => {
          // Optimistic update
          const updatedItems = store.items().map((item) => {
            if (item.tab_id === tabId && item.section_id === sectionId) {
              const newIndex = documentIds.indexOf(item.document_id);
              if (newIndex !== -1) {
                return { ...item, position: newIndex };
              }
            }
            return item;
          });
          patchState(store, { items: updatedItems });
        }),
        switchMap(({ tabId, sectionId, documentIds }) =>
          tabsService.reorderDocuments(tabId, sectionId, documentIds).pipe(
            tap((updatedItems) => {
              patchState(store, {
                items: store.items().map((i) => {
                  const updated = updatedItems.find((u) => u.id === i.id);
                  return updated ?? i;
                }),
              });
            }),
            catchError(() => of(null))
          )
        )
      )
    ),

    /**
     * Batch add multiple documents to a tab
     */
    batchAddDocuments: rxMethod<{
      documentIds: string[];
      tabId: string;
      sectionId?: string | null;
    }>(
      pipe(
        switchMap(({ documentIds, tabId, sectionId }) =>
          tabsService.batchAddDocumentsToTab(documentIds, tabId, sectionId).pipe(
            tap((newItems) => {
              patchState(store, {
                items: [...store.items(), ...newItems],
              });
            }),
            catchError(() => of(null))
          )
        )
      )
    ),

    // =====================================================================
    // UTILITY METHODS
    // =====================================================================

    /**
     * Reset the store to initial state
     */
    reset(): void {
      patchState(store, initialState);
    },

    /**
     * Get sections for a specific tab
     */
    getSectionsByTab(tabId: string): DocumentSection[] {
      return store
        .sections()
        .filter((s) => s.tab_id === tabId)
        .sort((a, b) => a.position - b.position);
    },

    /**
     * Get items for a specific section
     */
    getItemsBySection(sectionId: string | null, tabId: string): DocumentTabItem[] {
      return store
        .items()
        .filter((i) => i.tab_id === tabId && i.section_id === sectionId)
        .sort((a, b) => a.position - b.position);
    },

    /**
     * Check if a document is in any tab
     */
    isDocumentOrganized(documentId: string): boolean {
      return store.items().some((i) => i.document_id === documentId);
    },

    /**
     * Get the tab containing a specific document
     */
    getTabForDocument(documentId: string): DocumentTab | null {
      const item = store.items().find((i) => i.document_id === documentId);
      if (!item) return null;
      return store.tabs().find((t) => t.id === item.tab_id) ?? null;
    },
  }))
);
