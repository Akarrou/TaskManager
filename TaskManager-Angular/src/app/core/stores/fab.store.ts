import { Signal, computed } from '@angular/core';
import { signalStore, withState, withMethods, withComputed, patchState } from '@ngrx/signals';
import { NavigationContext, NavigationAction } from '../../shared/components/navigation-fab/navigation-fab.component';

/**
 * Configuration pour enregistrer le FAB d'une page
 */
export interface PageFabConfig {
  context: NavigationContext;
  actions?: NavigationAction[];
  onSave?: () => void | Promise<void>;
  onNavigateAway?: (route: string) => boolean | Promise<boolean>;
  /**
   * Optional: Pass a signal for isDirty to enable reactive updates
   * without requiring repeated registerPage calls
   */
  isDirtySignal?: Signal<boolean>;
}

/**
 * État interne du FAB Store
 *
 * NOTE: `saveCallback`, `navigateCallback`, and `isDirtySignal` are non-serializable
 * values stored in state as a deliberate exception to the serializable state rule.
 * Refactoring them out would require storing them in a separate service and threading
 * references through all 6 consumer components (app, dashboard, general-dashboard,
 * document-list, calendar-page, document-editor). The current design is intentional:
 * the FAB acts as a page-scoped communication bus where page components register
 * transient callbacks for the duration of their lifecycle, not persistent state.
 */
interface FabState {
  context: NavigationContext;
  actions: NavigationAction[];
  currentPageId: string | null;
  saveCallback: (() => void | Promise<void>) | null;
  navigateCallback: ((route: string) => boolean | Promise<boolean>) | null;
  isDirtySignal: Signal<boolean> | null;
  hidden: boolean;
}

/**
 * Store NgRx SignalStore pour gérer l'état du FAB de manière centralisée
 *
 * Permet aux pages de s'enregistrer/désenregistrer pour contrôler
 * le contexte et les actions du FAB sans dupliquer le composant.
 *
 * @example
 * ```typescript
 * export class MyComponent implements OnInit, OnDestroy {
 *   private fabStore = inject(FabStore);
 *   private pageId = crypto.randomUUID();
 *
 *   ngOnInit() {
 *     this.fabStore.registerPage({
 *       context: { currentPage: 'my-page', isDirty: this.isDirty() },
 *       actions: [...],
 *       onSave: () => this.save()
 *     }, this.pageId);
 *   }
 *
 *   ngOnDestroy() {
 *     this.fabStore.unregisterPage(this.pageId);
 *   }
 * }
 * ```
 */
export const FabStore = signalStore(
  { providedIn: 'root' },

  // État initial
  withState<FabState>({
    context: { currentPage: 'default' },
    actions: [],
    currentPageId: null,
    saveCallback: null,
    navigateCallback: null,
    isDirtySignal: null,
    hidden: false
  }),

  // Computed for reactive isDirty (reads from signal if provided, else from context)
  withComputed((store) => ({
    /**
     * Reactive isDirty: reads from isDirtySignal if available,
     * otherwise falls back to context.isDirty
     */
    isDirty: computed(() => {
      const signal = store.isDirtySignal();
      if (signal) {
        return signal();
      }
      return store.context().isDirty ?? false;
    })
  })),

  // Méthodes publiques
  withMethods((store) => ({
    /**
     * Enregistre la configuration FAB d'une page
     *
     * @param config - Configuration du contexte, actions et callbacks
     * @param pageId - ID unique de la page (utilisé pour éviter les race conditions)
     */
    registerPage(config: PageFabConfig, pageId: string): void {
      patchState(store, {
        context: config.context,
        actions: config.actions ?? [],
        currentPageId: pageId,
        saveCallback: config.onSave ?? null,
        navigateCallback: config.onNavigateAway ?? null,
        isDirtySignal: config.isDirtySignal ?? null
      });
    },

    /**
     * Désenregistre la configuration FAB d'une page
     *
     * Protection contre race conditions : ne désenregistre que si le pageId
     * correspond à la page actuellement enregistrée.
     *
     * @param pageId - ID unique de la page à désenregistrer
     */
    unregisterPage(pageId: string): void {
      if (store.currentPageId() === pageId) {
        patchState(store, {
          context: { currentPage: 'default' },
          actions: [],
          currentPageId: null,
          saveCallback: null,
          navigateCallback: null,
          isDirtySignal: null
        });
      }
    },

    /**
     * Exécute le callback de sauvegarde de la page courante
     *
     * Appelé lorsque l'utilisateur clique sur l'action "Save" du FAB
     */
    async executeSave(): Promise<void> {
      const callback = store.saveCallback();
      if (callback) {
        await callback();
      }
    },

    /**
     * Vérifie si la navigation est autorisée
     *
     * Appelé avant navigation pour permettre à la page de bloquer
     * si des modifications non sauvegardées existent.
     *
     * @param route - Route de destination
     * @returns true si navigation autorisée, false sinon
     */
    async canNavigateAway(route: string): Promise<boolean> {
      const callback = store.navigateCallback();
      if (callback) {
        return await callback(route);
      }
      return true;
    },

    /**
     * Contrôle la visibilité du FAB
     *
     * Permet aux composants de masquer/afficher le FAB
     * (ex: panneau de détail calendrier ouvert)
     */
    setHidden(hidden: boolean): void {
      patchState(store, { hidden });
    }
  }))
);
