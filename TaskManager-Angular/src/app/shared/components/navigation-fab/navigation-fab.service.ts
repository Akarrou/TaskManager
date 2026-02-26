import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { NavigationAction, NavigationContext } from './navigation-fab.component';

@Injectable({
  providedIn: 'root'
})
export class NavigationFabService {
  private router = inject(Router);

  /**
   * Génère des actions de navigation communes selon le contexte de la page
   */
  getCommonActions(pageContext: string): NavigationAction[] {
    const actions: NavigationAction[] = [];

    switch (pageContext) {
      case 'dashboard':
        actions.push(
          {
            id: 'tasks',
            icon: 'task_alt',
            label: 'Tâches',
            tooltip: 'Voir toutes les tâches',
            action: () => this.router.navigate(['/tasks']),
            color: 'primary'
          },
          {
            id: 'new-task',
            icon: 'add_task',
            label: 'Nouvelle tâche',
            tooltip: 'Créer une nouvelle tâche',
            action: () => this.router.navigate(['/tasks/new']),
            color: 'accent'
          },
          {
            id: 'new-document',
            icon: 'post_add', // or description
            label: 'Nouveau document',
            tooltip: 'Créer un nouveau document',
            action: () => this.router.navigate(['/documents/new']),
            color: 'primary'
          },
          {
            id: 'document-list',
            icon: 'description', // Icon representing a list of docs
            label: 'Mes documents',
            tooltip: 'Voir la liste des documents',
            action: () => this.router.navigate(['/documents']),
            color: 'accent' 
          }
        );
        break;

      case 'task-list':
        actions.push(
          {
            id: 'new-task',
            icon: 'add',
            label: 'Nouvelle tâche',
            tooltip: 'Créer une nouvelle tâche',
            action: () => this.router.navigate(['/tasks/new']),
            color: 'primary'
          }
        );
        break;

      case 'epic-kanban':
        actions.push(
          {
            id: 'epic-list',
            icon: 'list',
            label: 'Liste des epics',
            tooltip: 'Voir tous les epics',
            action: () => this.router.navigate(['/epics']),
            color: 'accent'
          },
          {
            id: 'new-epic',
            icon: 'add',
            label: 'Nouvel epic',
            tooltip: 'Créer un nouvel epic',
            action: () => this.router.navigate(['/epics/new']),
            color: 'primary'
          }
        );
        break;

      case 'feature-kanban':
        actions.push(
          {
            id: 'feature-list',
            icon: 'list',
            label: 'Liste des features',
            tooltip: 'Voir toutes les features',
            action: () => this.router.navigate(['/features']),
            color: 'accent'
          },
          {
            id: 'new-task',
            icon: 'add_task',
            label: 'Nouvelle tâche',
            tooltip: 'Ajouter une tâche à cette feature',
            action: () => this.router.navigate(['/tasks/new']),
            color: 'primary'
          }
        );
        break;

      case 'document-list':
        actions.push(
          {
            id: 'new-document',
            icon: 'post_add',
            label: 'Nouveau document',
            tooltip: 'Créer un nouveau document',
            action: () => this.router.navigate(['/documents/new']),
            color: 'primary'
          },
          {
            id: 'dashboard',
            icon: 'dashboard',
            label: 'Dashboard',
            tooltip: 'Retour au tableau de bord',
            action: () => this.router.navigate(['/dashboard']),
            color: 'accent'
          }
        );
        break;

      case 'document-editor':
        actions.push(
          {
            id: 'document-list',
            icon: 'description',
            label: 'Mes documents',
            tooltip: 'Voir la liste des documents',
            action: () => this.router.navigate(['/documents']),
            color: 'secondary'
          },
          {
            id: 'dashboard',
            icon: 'dashboard',
            label: 'Dashboard',
            tooltip: 'Retour au tableau de bord',
            action: () => this.router.navigate(['/dashboard']),
            color: 'accent'
          }
        );
        break;

      default:
        // Actions par défaut
        actions.push({
          id: 'home',
          icon: 'home',
          label: 'Accueil',
          tooltip: 'Retour à l\'accueil',
          action: () => this.router.navigate(['/']),
          color: 'accent'
        });
        break;
    }

    return actions;
  }

  /**
   * Génère un contexte de navigation standard
   */
  createContext(options: {
    isDirty?: boolean;
    hasUnsavedChanges?: boolean;
    canNavigateAway?: boolean;
    currentPage?: string;
  }): NavigationContext {
    return {
      isDirty: options.isDirty || false,
      hasUnsavedChanges: options.hasUnsavedChanges || false,
      canNavigateAway: options.canNavigateAway !== false,
      currentPage: options.currentPage || 'unknown',
      showSaveAction: options.isDirty || options.hasUnsavedChanges || false
    };
  }

  /**
   * Actions de navigation rapides pour différentes parties de l'app
   */
  getQuickNavActions(): NavigationAction[] {
    return [
      {
        id: 'dashboard',
        icon: 'dashboard',
        label: 'Dashboard',
        tooltip: 'Aller au dashboard',
        action: () => this.router.navigate(['/dashboard']),
        color: 'primary'
      },
      {
        id: 'tasks',
        icon: 'assignment',
        label: 'Tâches',
        tooltip: 'Voir toutes les tâches',
        action: () => this.router.navigate(['/tasks']),
        color: 'accent'
      },
      {
        id: 'projects',
        icon: 'folder',
        label: 'Projets',
        tooltip: 'Voir tous les projets',
        action: () => this.router.navigate(['/projects']),
        color: 'accent'
      }
    ];
  }

  /**
   * Actions de gestion de formulaires
   */
  getFormActions(callbacks: {
    onSave?: () => void;
    onCancel?: () => void;
    onReset?: () => void;
  }): NavigationAction[] {
    const actions: NavigationAction[] = [];

    if (callbacks.onSave) {
      actions.push({
        id: 'save',
        icon: 'save',
        label: 'Sauvegarder',
        tooltip: 'Sauvegarder les modifications',
        action: callbacks.onSave,
        color: 'primary'
      });
    }

    if (callbacks.onCancel) {
      actions.push({
        id: 'cancel',
        icon: 'cancel',
        label: 'Annuler',
        tooltip: 'Annuler les modifications',
        action: callbacks.onCancel,
        color: 'warn'
      });
    }

    if (callbacks.onReset) {
      actions.push({
        id: 'reset',
        icon: 'refresh',
        label: 'Réinitialiser',
        tooltip: 'Réinitialiser le formulaire',
        action: callbacks.onReset,
        color: 'accent'
      });
    }

    return actions;
  }
}