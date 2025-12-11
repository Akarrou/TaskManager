import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { DocumentService, Document } from '../services/document.service';
import { DatabaseService } from '../services/database.service';
import { NavigationFabComponent, NavigationContext } from '../../../shared/components/navigation-fab/navigation-fab.component';
import { NavigationFabService } from '../../../shared/components/navigation-fab/navigation-fab.service';
import { DeleteDocumentDialogComponent } from '../components/delete-document-dialog/delete-document-dialog.component';
import { MarkdownImportDialogComponent } from '../components/markdown-import-dialog/markdown-import-dialog.component';

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
  private databaseService = inject(DatabaseService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
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

  openMarkdownImportDialog(): void {
    const dialogRef = this.dialog.open(MarkdownImportDialogComponent, {
      width: '600px',
      disableClose: true,
    });

    dialogRef.afterClosed().subscribe((doc: Document | null) => {
      if (doc) {
        this.snackBar.open('Document Markdown importé avec succès', 'OK', {
          duration: 3000
        });
        this.loadDocuments();
        // Optionally navigate to the new document
        // this.router.navigate(['/documents', doc.id]);
      }
    });
  }

  async deleteDocument(event: Event, id: string) {
    event.stopPropagation();

    // 1. Récupérer le document pour extraire les bases de données
    const doc = this.documents().find(d => d.id === id);
    if (!doc) {
      this.snackBar.open('Document introuvable', 'OK', { duration: 3000 });
      return;
    }

    // 2. Extraire les IDs de bases de données du contenu
    const databaseIds = this.documentService.extractDatabaseIds(doc.content);
    console.log('[deleteDocument] Bases de données trouvées:', databaseIds);

    // 3. Ouvrir le dialog de confirmation
    const dialogRef = this.dialog.open(DeleteDocumentDialogComponent, {
      width: '500px',
      data: {
        documentTitle: doc.title,
        databaseCount: databaseIds.length
      }
    });

    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.performDelete(id, databaseIds);
      }
    });
  }

  private performDelete(documentId: string, databaseIds: string[]) {
    // 1. Supprimer les bases de données en cascade (parallèle)
    const deleteDatabases$ = databaseIds.length > 0
      ? forkJoin(
          databaseIds.map(dbId =>
            this.databaseService.deleteDatabase(dbId).pipe(
              catchError(err => {
                console.error(`[deleteDocument] Erreur suppression base ${dbId}:`, err);
                return of(false); // Continue même si une base échoue
              })
            )
          )
        )
      : of([]);

    // 2. Après suppression des bases, supprimer le document
    deleteDatabases$.subscribe({
      next: (results) => {
        const successCount = results.filter(r => r === true).length;
        console.log(`[deleteDocument] ${successCount}/${databaseIds.length} bases supprimées`);

        // Supprimer le document
        this.documentService.deleteDocument(documentId).subscribe({
          next: (success) => {
            if (success) {
              this.snackBar.open(
                `Document supprimé${databaseIds.length > 0 ? ` avec ${databaseIds.length} base(s) de données` : ''}`,
                'OK',
                { duration: 5000 }
              );
              this.loadDocuments();
            } else {
              this.snackBar.open('Erreur lors de la suppression du document', 'OK', {
                duration: 5000
              });
            }
          },
          error: (err) => {
            console.error('[deleteDocument] Erreur suppression document:', err);
            this.snackBar.open('Erreur lors de la suppression du document', 'OK', {
              duration: 5000
            });
          }
        });
      },
      error: (err) => {
        console.error('[deleteDocument] Erreur suppression bases:', err);
        this.snackBar.open('Erreur lors de la suppression des bases de données', 'OK', {
          duration: 5000
        });
      }
    });
  }
}
