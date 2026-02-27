import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd, Event as RouterEvent } from '@angular/router';
import { AuthService } from '../../../core/services/auth';
import { LogoComponent } from '../logo/logo.component';
import { ProjectSelectorComponent } from '../../../features/projects/components/project-selector/project-selector.component';
import { TrashStore } from '../../../features/trash/store/trash.store';
import { TourService } from '../../../features/tour/services/tour.service';

@Component({
  selector: 'app-header-nav',
  standalone: true,
  imports: [CommonModule, RouterModule, LogoComponent, ProjectSelectorComponent],
  templateUrl: './header-nav.component.html',
  styleUrls: ['./header-nav.component.scss']
})
export class HeaderNavComponent {
  private authService = inject(AuthService);
  private router = inject(Router);
  private trashStore = inject(TrashStore);
  private tourService = inject(TourService);

  currentUser = this.authService.currentUser;
  trashCount = this.trashStore.trashCount;

  activeRoute = signal('dashboard');
  notificationCount = signal(3);
  showProfileMenu = signal(false);
  showMobileMenu = signal(false);
  isLoginPage = signal(false);

  constructor() {
    // Détecte si on est sur la page de login
    this.checkLoginRoute(this.router.url);

    // Écoute les changements de route
    this.router.events.subscribe((event: RouterEvent) => {
      if (event instanceof NavigationEnd) {
        this.checkLoginRoute(event.urlAfterRedirects);
      }
    });

    // Load trash count for badge
    this.trashStore.loadTrashCount();
  }

  private checkLoginRoute(url: string): void {
    this.isLoginPage.set(url.includes('/login') || url.includes('/onboarding'));
  }

  startTour(): void {
    this.closeProfileMenu();
    this.tourService.startAppTour();
  }

  setActiveRoute(route: string) {
    this.activeRoute.set(route);
  }

  toggleProfileMenu() {
    this.showProfileMenu.set(!this.showProfileMenu());
  }

  closeProfileMenu() {
    this.showProfileMenu.set(false);
  }

  toggleMobileMenu() {
    this.showMobileMenu.set(!this.showMobileMenu());
  }

  closeMobileMenu() {
    this.showMobileMenu.set(false);
  }

  async logout(): Promise<void> {
    await this.authService.signOut();
    this.closeProfileMenu();
    this.router.navigate(['/login']);
  }
}
