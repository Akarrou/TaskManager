import { Routes } from '@angular/router';
import { DocumentEditorComponent } from './document-editor/document-editor.component';

export const DOCUMENT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./document-list/document-list.component').then(m => m.DocumentListComponent),
    title: 'Mes Documents - Kōdo'
  },
  {
    path: 'new',
    loadComponent: () => import('./document-editor/document-editor.component').then(m => m.DocumentEditorComponent),
    title: 'Nouveau Document - Kōdo'
  },
  {
    path: ':id',
    loadComponent: () => import('./document-editor/document-editor.component').then(m => m.DocumentEditorComponent),
    title: 'Éditer le Document - Kōdo'
  }
];
