import { Injectable, afterNextRender, Injector, inject } from '@angular/core';
import type { DriveStep } from 'driver.js';

const TOUR_COMPLETED_KEY = 'kodo_tour_completed';

@Injectable({ providedIn: 'root' })
export class TourService {
  private injector = inject(Injector);

  get isTourCompleted(): boolean {
    return localStorage.getItem(TOUR_COMPLETED_KEY) === 'true';
  }

  startAppTour(): void {
    afterNextRender(() => {
      // Small delay to ensure all DOM elements are rendered after navigation
      setTimeout(() => this.launchTour(), 500);
    }, { injector: this.injector });
  }

  private async launchTour(): Promise<void> {
    const { driver } = await import('driver.js');

    const driverObj = driver({
      showProgress: true,
      animate: true,
      allowClose: true,
      overlayColor: 'rgba(0, 0, 0, 0.6)',
      popoverClass: 'kodo-tour-popover',
      nextBtnText: 'Suivant',
      prevBtnText: 'Précédent',
      doneBtnText: 'Terminer',
      progressText: '{{current}} sur {{total}}',
      onDestroyStarted: () => {
        localStorage.setItem(TOUR_COMPLETED_KEY, 'true');
        driverObj.destroy();
      },
      steps: this.buildSteps(),
    });

    driverObj.drive();
  }

  private buildSteps(): DriveStep[] {
    const steps: DriveStep[] = [];

    // Step 1: Project selector
    if (document.querySelector('app-project-selector')) {
      steps.push({
        element: 'app-project-selector',
        popover: {
          title: 'Sélecteur de projet',
          description: 'Basculez facilement entre vos différents projets depuis cet espace.',
          side: 'bottom',
          align: 'start',
        },
      });
    }

    // Step 2: Navigation menu
    if (document.querySelector('.nav-menu')) {
      steps.push({
        element: '.nav-menu',
        popover: {
          title: 'Navigation',
          description: 'Accédez au Dashboard, Documents, Tâches et Calendrier depuis cette barre de navigation.',
          side: 'bottom',
          align: 'center',
        },
      });
    }

    // Step 3: Document sidebar
    if (document.querySelector('app-document-sidebar')) {
      steps.push({
        element: 'app-document-sidebar',
        popover: {
          title: 'Sidebar documents',
          description: 'Naviguez dans vos documents, bases de données et notes depuis cette sidebar.',
          side: 'right',
          align: 'start',
        },
      });
    }

    // Step 4: FAB
    if (document.querySelector('app-navigation-fab')) {
      steps.push({
        element: 'app-navigation-fab',
        popover: {
          title: 'Actions rapides',
          description: 'Créez rapidement des tâches, documents ou événements avec ce bouton d\'action.',
          side: 'top',
          align: 'end',
        },
      });
    }

    // Fallback: if no steps could be found, show a generic welcome
    if (steps.length === 0) {
      steps.push({
        popover: {
          title: 'Bienvenue sur Kōdo !',
          description: 'Explorez l\'interface pour découvrir toutes les fonctionnalités. Vous pouvez relancer cette visite depuis votre profil.',
        },
      });
    }

    return steps;
  }

  resetTour(): void {
    localStorage.removeItem(TOUR_COMPLETED_KEY);
  }
}
