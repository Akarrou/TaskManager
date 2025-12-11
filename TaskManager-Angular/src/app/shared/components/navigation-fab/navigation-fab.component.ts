import { Component, Input, Output, EventEmitter, inject, OnInit, signal, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

export interface NavigationAction {
  id: string;
  icon: string;
  label: string;
  tooltip: string;
  action: () => void;
  visible?: boolean;
  color?: 'primary' | 'secondary' | 'warn' | 'accent';
  disabled?: boolean;
}

export interface NavigationContext {
  isDirty?: boolean;
  hasUnsavedChanges?: boolean;
  canNavigateAway?: boolean;
  currentPage?: string;
  showSaveAction?: boolean;
}

@Component({
  selector: 'app-navigation-fab',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule
  ],
  templateUrl: './navigation-fab.component.html',
  styleUrls: ['./navigation-fab.component.scss']
})
export class NavigationFabComponent implements OnInit {
  private router = inject(Router);

  // Utiliser signal inputs pour la réactivité
  context = input<NavigationContext>({});
  customActions = input<NavigationAction[]>([]);
  @Input() position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' = 'bottom-right';
  @Input() size: 'small' | 'medium' | 'large' = 'medium';

  @Output() actionClicked = new EventEmitter<string>();
  @Output() saveRequested = new EventEmitter<void>();
  @Output() navigateRequested = new EventEmitter<string>();

  // État du FAB
  isOpen = signal(false);
  currentRoute = signal('');

  // Actions par défaut basées sur le contexte
  defaultActions = computed(() => {
    const ctx = this.context();
    const route = this.currentRoute();
    const actions: NavigationAction[] = [];

    // 1. TOUJOURS EN PREMIER : Action Dashboard (cohérence globale, même couleur)
    // Afficher "Dashboard principal" sur tasks-dashboard, sinon "Dashboard" partout ailleurs
    if (ctx.currentPage === 'tasks-dashboard') {
      actions.push({
        id: 'dashboard',
        icon: 'dashboard',
        label: 'Dashboard principal',
        tooltip: 'Retour au Dashboard principal',
        action: () => this.navigateTo('/dashboard'),
        color: 'accent'
      });
    } else if (ctx.currentPage !== 'dashboard') {
      actions.push({
        id: 'dashboard',
        icon: 'dashboard',
        label: 'Dashboard',
        tooltip: 'Retour au Dashboard',
        action: () => this.navigateTo('/dashboard'),
        color: 'accent'
      });
    }

    // 2. Actions contextuelles selon la page

    // Page de création ou édition de tâche
    if (route.includes('/tasks/new') || (route.includes('/tasks/') && route.includes('/edit'))) {
      actions.push({
        id: 'tasks-dashboard',
        icon: 'view_list',
        label: 'Dashboard Tâches',
        tooltip: 'Retour au Dashboard des tâches',
        action: () => this.navigateTo('/dashboard/tasks'),
        color: 'primary'
      });
    }

    // Actions spécifiques au Dashboard principal
    if (ctx.currentPage === 'dashboard') {
      actions.push(
        {
          id: 'tasks-dashboard',
          icon: 'view_list',
          label: 'Dashboard Tâches',
          tooltip: 'Aller au Dashboard des tâches',
          action: () => this.navigateTo('/dashboard/tasks'),
          color: 'primary'
        },
        {
          id: 'new-task',
          icon: 'add_task',
          label: 'Nouvelle tâche',
          tooltip: 'Créer une nouvelle tâche',
          action: () => this.navigateTo('/tasks/new'),
          color: 'accent'
        },
        {
          id: 'new-document',
          icon: 'post_add',
          label: 'Nouveau document',
          tooltip: 'Créer un nouveau document',
          action: () => this.navigateTo('/documents/new'),
          color: 'warn'
        },
        {
          id: 'document-list',
          icon: 'description',
          label: 'Mes documents',
          tooltip: 'Voir la liste des documents',
          action: () => this.navigateTo('/documents'),
          color: 'primary'
        }
      );
    }

    // Actions spécifiques au Dashboard des tâches
    if (ctx.currentPage === 'tasks-dashboard') {
      actions.push({
        id: 'new-task',
        icon: 'add_task',
        label: 'Nouvelle tâche',
        tooltip: 'Créer une nouvelle tâche',
        action: () => this.navigateTo('/tasks/new'),
        color: 'primary'
      });
    }

    // Action Sauvegarde (si changements non sauvés)
    console.log('[NavigationFAB] Checking save action - isDirty:', ctx.isDirty, 'hasUnsavedChanges:', ctx.hasUnsavedChanges, 'currentPage:', ctx.currentPage);
    if (ctx.isDirty || ctx.hasUnsavedChanges) {
      console.log('[NavigationFAB] Adding save action');
      actions.push({
        id: 'save',
        icon: 'save',
        label: 'Sauvegarder',
        tooltip: 'Sauvegarder les modifications',
        action: () => this.saveRequested.emit(),
        color: 'primary'
      });
    }

    // Action Navigation sans sauvegarde (si changements)
    if (ctx.hasUnsavedChanges) {
      actions.push({
        id: 'navigate-without-save',
        icon: 'exit_to_app',
        label: 'Quitter',
        tooltip: 'Quitter sans sauvegarder',
        action: () => this.navigateWithoutSave(),
        color: 'warn'
      });
    }

    // Actions spécifiques à la liste des documents
    if (ctx.currentPage === 'document-list') {
      actions.push({
        id: 'new-document',
        icon: 'post_add',
        label: 'Nouveau document',
        tooltip: 'Créer un nouveau document',
        action: () => this.navigateTo('/documents/new'),
        color: 'primary'
      });
    }

    // Actions spécifiques à l'éditeur de document
    if (ctx.currentPage === 'document-editor') {
      actions.push({
        id: 'document-list',
        icon: 'description',
        label: 'Mes documents',
        tooltip: 'Retour à la liste des documents',
        action: () => this.navigateTo('/documents'),
        color: 'primary'
      });
    }

    if (route.includes('/epic/') && route.includes('/kanban')) {
      actions.push({
        id: 'epic-list',
        icon: 'view_kanban',
        label: 'Epics',
        tooltip: 'Voir tous les epics',
        action: () => this.navigateTo('/epics'),
        color: 'accent'
      });
    }

    return actions;
  });

  // Toutes les actions disponibles
  allActions = computed(() => {
    return [...this.defaultActions(), ...this.customActions()];
  });

  // Actions visibles (filtrées)
  visibleActions = computed(() => {
    return this.allActions().filter(action => action.visible !== false);
  });

  // Icône principale du FAB
  mainIcon = computed(() => {
    const ctx = this.context();
    if (ctx.isDirty || ctx.hasUnsavedChanges) {
      return 'save_alt';
    }
    return 'navigation';
  });

  // Couleur principale du FAB
  mainColor = computed(() => {
    const ctx = this.context();
    if (ctx.isDirty || ctx.hasUnsavedChanges) {
      return 'primary';
    }
    return 'secondary';
  });

  ngOnInit() {
    // Surveiller les changements de route
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      this.currentRoute.set(event.url);
    });

    // Initialiser la route actuelle
    this.currentRoute.set(this.router.url);
  }

  toggleFab() {
    this.isOpen.update(value => !value);
  }

  closeFab() {
    this.isOpen.set(false);
  }

  executeAction(action: NavigationAction) {
    if (action.disabled) return;
    
    this.actionClicked.emit(action.id);
    action.action();
    this.closeFab();
  }

  private navigateTo(route: string) {
    this.navigateRequested.emit(route);

    const ctx = this.context();
    if (ctx.canNavigateAway !== false) {
      this.router.navigate([route]);
    }
  }

  private navigateWithoutSave() {
    this.navigateRequested.emit('navigate-without-save');
  }

  // Méthodes publiques pour contrôle externe
  public open() {
    this.isOpen.set(true);
  }

  public close() {
    this.isOpen.set(false);
  }

  public addAction(action: NavigationAction) {
    // Note: customActions est maintenant un input signal (read-only)
    // Cette méthode est conservée pour compatibilité mais ne fait rien
    console.warn('addAction() is deprecated - use customActions input instead');
  }

  public removeAction(actionId: string) {
    // Note: customActions est maintenant un input signal (read-only)
    // Cette méthode est conservée pour compatibilité mais ne fait rien
    console.warn('removeAction() is deprecated - use customActions input instead');
  }

  // TrackBy function pour optimiser les performances de ngFor
  trackAction(index: number, action: NavigationAction | null): string {
    return action ? action.id : index.toString();
  }
}