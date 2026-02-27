import { Routes } from '@angular/router';
import { authGuard, publicGuard } from './core/guards/auth.guards';
import { onboardingGuard, requireNoProjectsGuard } from './core/guards/onboarding.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },
  {
    path: 'login',
    canActivate: [publicGuard],
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent),
    title: 'Connexion - Kōdo'
  },
  {
    path: 'onboarding',
    canActivate: [authGuard, requireNoProjectsGuard],
    loadComponent: () => import('./features/onboarding/components/onboarding-page/onboarding-page.component').then(m => m.OnboardingPageComponent),
    title: 'Bienvenue - Kōdo'
  },
  {
    path: 'dashboard',
    canActivate: [authGuard, onboardingGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/general-dashboard/general-dashboard.component').then(m => m.GeneralDashboardComponent),
        title: 'Tableau de bord - Kōdo'
      },
      {
        path: 'tasks',
        loadComponent: () => import('./features/tasks-dashboard/dashboard.component').then(m => m.TasksDashboardComponent),
        title: 'Dashboard Tâches - Kōdo'
      }
    ]
  },
  {
    path: 'projects',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () => import('./features/projects/components/project-list/project-list.component').then(m => m.ProjectListComponent),
    title: 'Mes Projets - Kōdo'
  },
  {
    path: 'documents',
    canActivate: [authGuard, onboardingGuard],
    loadChildren: () => import('./features/documents/documents.routes').then(m => m.DOCUMENT_ROUTES),
    title: 'Documents - Kōdo'
  },
  {
    path: 'bdd/:id',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () => import('./features/documents/database-view/database-view.component').then(m => m.DatabaseViewComponent),
    title: 'Base de données - Kōdo'
  },
  {
    path: 'projects/new',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () => import('./features/projects/components/project-form/project-form.component').then(m => m.ProjectFormComponent),
    title: 'Nouveau Projet - Kōdo'
  },
  {
    path: 'projects/:id/edit',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () => import('./features/projects/components/project-form/project-form.component').then(m => m.ProjectFormComponent),
    title: 'Modifier le Projet - Kōdo'
  },
  {
    path: 'calendar',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () => import('./features/calendar/components/calendar-page/calendar-page.component').then(m => m.CalendarPageComponent),
    title: 'Calendrier - Kōdo'
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () => import('./features/profile/pages/profile-page/profile-page.component').then(m => m.ProfilePageComponent),
    title: 'Mon Profil - Kōdo'
  },
  {
    path: 'profile/google-callback',
    canActivate: [authGuard],
    loadComponent: () => import('./features/google-calendar/components/google-calendar-callback/google-calendar-callback.component').then(m => m.GoogleCalendarCallbackComponent),
    title: 'Connexion Google Calendar - Kōdo'
  },
  {
    path: 'trash',
    canActivate: [authGuard],
    loadComponent: () => import('./features/trash/components/trash-page/trash-page.component').then(m => m.TrashPageComponent),
    title: 'Corbeille - Kōdo'
  },
  {
    path: '**',
    redirectTo: '/dashboard'
  }
];
