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
    title: 'Connexion - AgroFlow Task Manager'
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
    title: 'Dashboard - AgroFlow Task Manager'
  },
  {
    path: 'tasks/new',
    canActivate: [authGuard],
    component: TaskFormComponent,
    title: 'Nouvelle tâche - AgroFlow Task Manager',
    data: { renderMode: 'client' }
  },
  {
    path: 'tasks/:id/edit',
    canActivate: [authGuard],
    component: TaskFormComponent,
    title: 'Modifier la tâche - AgroFlow Task Manager',
    data: { renderMode: 'client' }
  },
  {
    path: '**',
    redirectTo: '/dashboard'
  }
];
