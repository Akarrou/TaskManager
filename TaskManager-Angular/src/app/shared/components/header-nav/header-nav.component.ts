import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth';
import { LogoComponent } from '../logo/logo.component';

@Component({
  selector: 'app-header-nav',
  standalone: true,
  imports: [CommonModule, RouterModule, LogoComponent],
  template: `
    <header class="header-nav">
      <div class="nav-container">
        <!-- Logo et titre -->
        <app-logo></app-logo>

        <!-- Navigation principale -->
        <nav class="nav-menu" role="navigation" aria-label="Navigation principale">
          <ul class="nav-list">
            <li class="nav-item">
              <a 
                href="/dashboard" 
                class="nav-link"
                [class.active]="activeRoute() === 'dashboard'"
                (click)="setActiveRoute('dashboard')"
                aria-label="Tableau de bord">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>
                </svg>
                Dashboard
              </a>
            </li>
          </ul>
        </nav>

        <!-- Actions utilisateur -->
        <div class="nav-actions">
          <button 
            class="profile-btn"
            aria-label="Menu profil"
            title="Menu profil"
            (click)="toggleProfileMenu()">
            <div class="avatar">JV</div>
          </button>

          <!-- Menu déroulant profil -->
          <div class="profile-dropdown" *ngIf="showProfileMenu()">
            <ng-container *ngIf="currentUser() as user; else notConnected">
              <div class="dropdown-header">
                <div class="user-info">
                  <div class="user-name">{{ user.email }}</div>
                  <div class="user-email">Connecté</div>
                </div>
              </div>
              <div class="dropdown-divider"></div>
              <ul class="dropdown-menu">
                <li><a routerLink="/profile" class="dropdown-item">Mon profil</a></li>
                <li><a routerLink="/settings" class="dropdown-item">Paramètres</a></li>
                <li class="dropdown-divider"></li>
                <li><button (click)="logout()" class="dropdown-item logout-btn">Déconnexion</button></li>
              </ul>
            </ng-container>
            <ng-template #notConnected>
              <ul class="dropdown-menu">
                <li><a routerLink="/login" class="dropdown-item">Connexion</a></li>
              </ul>
            </ng-template>
          </div>
        </div>

        <!-- Bouton menu mobile -->
        <button 
          class="mobile-menu-btn"
          aria-label="Menu mobile"
          (click)="toggleMobileMenu()"
          [attr.aria-expanded]="showMobileMenu()">
          <svg class="menu-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3,6H21V8H3V6M3,11H21V13H3V11M3,16H21V18H3V16Z"/>
          </svg>
        </button>
      </div>

      <!-- Menu mobile -->
      <div class="mobile-nav" *ngIf="showMobileMenu()">
        <nav class="mobile-menu" role="navigation" aria-label="Navigation mobile">
          <ul class="mobile-nav-list">
            <li><a href="/dashboard" class="mobile-nav-link" (click)="closeMobileMenu()">Dashboard</a></li>
            <li><a href="/tasks" class="mobile-nav-link" (click)="closeMobileMenu()">Tâches</a></li>
            <li><a href="/projects" class="mobile-nav-link" (click)="closeMobileMenu()">Projets</a></li>
            <li><a href="/profile" class="mobile-nav-link" (click)="closeMobileMenu()">Profil</a></li>
          </ul>
        </nav>
      </div>
    </header>
  `,
  styles: [`
    .header-nav {
      background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
      border-bottom: 1px solid #e2e8f0;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
      position: sticky;
      top: 0;
      z-index: 1000;
    }

    .nav-container {
      max-width: 1200px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 2rem;
      height: 70px;
    }

    .nav-menu {
      flex: 1;
      display: flex;
      justify-content: center;
    }

    .nav-list {
      display: flex;
      list-style: none;
      margin: 0;
      padding: 0;
      gap: 2rem;
    }

    .nav-item {
      position: relative;
    }

    .nav-link {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      text-decoration: none;
      color: #64748b;
      font-weight: 500;
      border-radius: 0.5rem;
      transition: all 0.2s ease;
      position: relative;
    }

    .nav-link:hover {
      color: #2563eb;
      background-color: #f1f5f9;
    }

    .nav-link:focus {
      outline: 2px solid #3b82f6;
      outline-offset: 2px;
    }

    .nav-link.active {
      color: #2563eb;
      background-color: #eff6ff;
    }

    .nav-link.active::after {
      content: '';
      position: absolute;
      bottom: -1rem;
      left: 50%;
      transform: translateX(-50%);
      width: 4px;
      height: 4px;
      background: #2563eb;
      border-radius: 50%;
    }

    .nav-icon {
      width: 20px;
      height: 20px;
    }

    .nav-actions {
      display: flex;
      align-items: center;
      gap: 1rem;
      position: relative;
    }

    .notification-btn,
    .profile-btn {
      position: relative;
      background: none;
      border: none;
      padding: 0.5rem;
      border-radius: 0.5rem;
      cursor: pointer;
      transition: background-color 0.2s ease;
    }

    .notification-btn:hover,
    .profile-btn:hover {
      background-color: #f1f5f9;
    }

    .notification-btn:focus,
    .profile-btn:focus {
      outline: 2px solid #3b82f6;
      outline-offset: 2px;
    }

    .action-icon {
      width: 24px;
      height: 24px;
      color: #64748b;
    }

    .notification-badge {
      position: absolute;
      top: 0;
      right: 0;
      background: #ef4444;
      color: white;
      font-size: 0.75rem;
      padding: 0.125rem 0.375rem;
      border-radius: 9999px;
      min-width: 18px;
      text-align: center;
    }

    .avatar {
      width: 36px;
      height: 36px;
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 0.875rem;
    }

    .profile-dropdown {
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 0.5rem;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 0.75rem;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
      min-width: 200px;
      overflow: hidden;
      z-index: 50;
    }

    .dropdown-header {
      padding: 1rem;
      background: #f8fafc;
    }

    .user-name {
      font-weight: 600;
      color: #1f2937;
    }

    .user-email {
      font-size: 0.875rem;
      color: #64748b;
    }

    .dropdown-divider {
      height: 1px;
      background: #e2e8f0;
      margin: 0;
    }

    .dropdown-menu {
      list-style: none;
      margin: 0;
      padding: 0.5rem 0;
    }

    .dropdown-item {
      display: block;
      width: 100%;
      padding: 0.75rem 1rem;
      text-decoration: none;
      color: #374151;
      background: none;
      border: none;
      text-align: left;
      cursor: pointer;
      transition: background-color 0.2s ease;
    }

    .dropdown-item:hover {
      background-color: #f1f5f9;
    }

    .logout-btn {
      color: #ef4444;
    }

    .logout-btn:hover {
      background-color: #fef2f2;
    }

    .mobile-menu-btn {
      display: none;
      background: none;
      border: none;
      padding: 0.5rem;
      cursor: pointer;
      border-radius: 0.5rem;
    }

    .mobile-menu-btn:hover {
      background-color: #f1f5f9;
    }

    .menu-icon {
      width: 24px;
      height: 24px;
      color: #64748b;
    }

    .mobile-nav {
      display: none;
      border-top: 1px solid #e2e8f0;
      background: white;
    }

    .mobile-nav-list {
      list-style: none;
      margin: 0;
      padding: 1rem 0;
    }

    .mobile-nav-link {
      display: block;
      padding: 0.75rem 2rem;
      text-decoration: none;
      color: #374151;
      font-weight: 500;
      transition: background-color 0.2s ease;
    }

    .mobile-nav-link:hover {
      background-color: #f1f5f9;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .nav-menu {
        display: none;
      }

      .mobile-menu-btn {
        display: block;
      }

      .mobile-nav {
        display: block;
      }

      .nav-actions {
        gap: 0.5rem;
      }
    }

    @media (max-width: 480px) {
      .nav-container {
        padding: 0 1rem;
      }
    }
  `]
})
export class HeaderNavComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  currentUser = this.authService.currentUser;
  
  activeRoute = signal('dashboard');
  notificationCount = signal(3);
  showProfileMenu = signal(false);
  showMobileMenu = signal(false);

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