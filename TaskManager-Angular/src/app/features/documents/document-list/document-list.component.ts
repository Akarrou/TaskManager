import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { Router } from '@angular/router';
import { DocumentService, Document } from '../services/document.service';
import { NavigationFabComponent, NavigationContext } from '../../../shared/components/navigation-fab/navigation-fab.component';
import { NavigationFabService } from '../../../shared/components/navigation-fab/navigation-fab.service';

@Component({
  selector: 'app-document-list',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatCardModule,
    NavigationFabComponent
  ],
  templateUrl: './document-list.component.html',
  styleUrls: ['./document-list.component.scss']
})
export class DocumentListComponent implements OnInit {
  private documentService = inject(DocumentService);
  private router = inject(Router);
  private navigationFabService = inject(NavigationFabService);

  documents = signal<Document[]>([]);
  loading = signal(true);

  // Navigation FAB configuration
  fabContext = signal<NavigationContext>(this.navigationFabService.createContext({ currentPage: 'document-list' }));
  fabActions = this.navigationFabService.getCommonActions('document-list');

  ngOnInit() {
    this.loadDocuments();
  }

  loadDocuments() {
    this.loading.set(true);
    this.documentService.getDocuments().subscribe({
      next: (docs: Document[]) => {
        this.documents.set(docs);
        this.loading.set(false);
      },
      error: (err: any) => {
        console.error('Error loading documents:', err);
        this.loading.set(false);
      }
    });
  }

  openDocument(id: string) {
    this.router.navigate(['/documents', id]);
  }

  createNewDocument() {
    this.router.navigate(['/documents/new']);
  }

  async deleteDocument(event: Event, id: string) {
    event.stopPropagation();
    if (confirm('Voulez-vous vraiment supprimer ce document ?')) {
      await this.documentService.deleteDocument(id).toPromise();
      this.loadDocuments();
    }
  }
}
