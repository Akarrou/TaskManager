import { Routes } from '@angular/router';
import { TaskFormComponent } from './features/tasks/task-form/task-form.component';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
    title: 'Dashboard - AgroFlow Task Manager'
  },
  {
    path: 'tasks/new',
    component: TaskFormComponent,
    title: 'Nouvelle tâche - AgroFlow Task Manager',
    data: { renderMode: 'client' }
  },
  {
    path: 'tasks/:id/edit',
    component: TaskFormComponent,
    title: 'Modifier la tâche - AgroFlow Task Manager',
    data: { renderMode: 'client' }
  },
  {
    path: '**',
    redirectTo: '/dashboard'
  }
];
