import { Routes } from '@angular/router';
import { TaskFormComponent } from './features/tasks/task-form/task-form.component';
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
    path: 'tasks/new',
    canActivate: [authGuard],
    component: TaskFormComponent,
    title: 'Nouvelle tâche - Kōdo',
    data: { renderMode: 'client' }
  },
  {
    path: 'tasks/:id/edit',
    canActivate: [authGuard],
    component: TaskFormComponent,
    title: 'Modifier la tâche - Kōdo',
    data: { renderMode: 'client' }
  },
  {
    path: 'epic/:id/kanban',
    canActivate: [authGuard],
    loadComponent: () => import('./features/epic-kanban/epic-kanban.component').then(m => m.EpicKanbanComponent),
    title: 'Epic Kanban - Kōdo',
    data: { renderMode: 'client' }
  },
  {
    path: 'features/:featureId/tasks-kanban',
    canActivate: [authGuard],
    loadComponent: () => import('./features/feature-kanban/feature-kanban.component').then(m => m.FeatureKanbanComponent),
    title: 'Feature Tasks Kanban - Kōdo',
    data: { renderMode: 'client' }
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
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () => import('./features/profile/pages/profile-page/profile-page.component').then(m => m.ProfilePageComponent),
    title: 'Mon Profil - Kōdo'
  },
  {
    path: '**',
    redirectTo: '/dashboard'
  }
];
