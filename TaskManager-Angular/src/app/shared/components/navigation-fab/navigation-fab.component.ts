import { Component, Input, Output, EventEmitter, inject, OnInit, signal, computed } from '@angular/core';
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

  @Input() context: NavigationContext = {};
  @Input() customActions: NavigationAction[] = [];
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
    const actions: NavigationAction[] = [];
    
    // Action Dashboard (toujours visible)
    actions.push({
      id: 'dashboard',
      icon: 'dashboard',
      label: 'Dashboard',
      tooltip: 'Retour au Dashboard',
      action: () => this.navigateTo('/dashboard'),
      color: 'secondary'
    });

    // Action Sauvegarde (si changements non sauvés)
    if (this.context.isDirty || this.context.hasUnsavedChanges) {
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
    if (this.context.hasUnsavedChanges) {
      actions.push({
        id: 'navigate-without-save',
        icon: 'exit_to_app',
        label: 'Quitter',
        tooltip: 'Quitter sans sauvegarder',
        action: () => this.navigateWithoutSave(),
        color: 'warn'
      });
    }

    // Actions contextuelles selon la page
    const route = this.currentRoute();
    if (route.includes('/tasks/') && route.includes('/edit')) {
      actions.push({
        id: 'task-list',
        icon: 'list',
        label: 'Liste des tâches',
        tooltip: 'Voir toutes les tâches',
        action: () => this.navigateTo('/tasks'),
        color: 'accent'
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
    return [...this.defaultActions(), ...this.customActions];
  });

  // Actions visibles (filtrées)
  visibleActions = computed(() => {
    return this.allActions().filter(action => action.visible !== false);
  });

  // Icône principale du FAB
  mainIcon = computed(() => {
    if (this.context.isDirty || this.context.hasUnsavedChanges) {
      return 'save_alt';
    }
    return 'navigation';
  });

  // Couleur principale du FAB
  mainColor = computed(() => {
    if (this.context.isDirty || this.context.hasUnsavedChanges) {
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
    
    if (this.context.canNavigateAway !== false) {
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
    this.customActions.push(action);
  }

  public removeAction(actionId: string) {
    const index = this.customActions.findIndex(a => a.id === actionId);
    if (index > -1) {
      this.customActions.splice(index, 1);
    }
  }

  // TrackBy function pour optimiser les performances de ngFor
  trackAction(index: number, action: NavigationAction | null): string {
    return action ? action.id : index.toString();
  }
}