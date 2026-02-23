import { Routes } from '@angular/router';
import { authGuard, publicGuard } from './core/guards/auth.guards';

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
    path: 'dashboard',
    canActivate: [authGuard],
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
    canActivate: [authGuard],
    loadComponent: () => import('./features/projects/components/project-list/project-list.component').then(m => m.ProjectListComponent),
    title: 'Mes Projets - Kōdo'
  },
  {
    path: 'documents',
    canActivate: [authGuard],
    loadChildren: () => import('./features/documents/documents.routes').then(m => m.DOCUMENT_ROUTES),
    title: 'Documents - Kōdo'
  },
  {
    path: 'bdd/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./features/documents/database-view/database-view.component').then(m => m.DatabaseViewComponent),
    title: 'Base de données - Kōdo'
  },
  {
    path: 'projects/new',
    canActivate: [authGuard],
    loadComponent: () => import('./features/projects/components/project-form/project-form.component').then(m => m.ProjectFormComponent),
    title: 'Nouveau Projet - Kōdo'
  },
  {
    path: 'projects/:id/edit',
    canActivate: [authGuard],
    loadComponent: () => import('./features/projects/components/project-form/project-form.component').then(m => m.ProjectFormComponent),
    title: 'Modifier le Projet - Kōdo'
  },
  {
    path: 'calendar',
    canActivate: [authGuard],
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
    path: '**',
    redirectTo: '/dashboard'
  }
];
