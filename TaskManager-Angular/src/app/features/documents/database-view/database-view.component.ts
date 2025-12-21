import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Observable, Subject, takeUntil, switchMap, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { DocumentDatabaseTableComponent } from '../components/document-database-table/document-database-table.component';
import { DatabaseService } from '../services/database.service';
import { DocumentService, Document } from '../services/document.service';
import { DocumentDatabase, DEFAULT_DATABASE_CONFIG } from '../models/database.model';

interface BreadcrumbItem {
  id: string;
  title: string;
  type: 'document' | 'database';
}

/**
 * DatabaseViewComponent
 *
 * Standalone page to view a database without the document editor context.
 * Route: /bdd/:id
 */
@Component({
  selector: 'app-database-view',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    DocumentDatabaseTableComponent,
  ],
  templateUrl: './database-view.component.html',
  styleUrls: ['./database-view.component.scss'],
})
export class DatabaseViewComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private databaseService = inject(DatabaseService);
  private documentService = inject(DocumentService);

  private destroy$ = new Subject<void>();

  // State
  isLoading = signal(true);
  error = signal<string | null>(null);
  database = signal<DocumentDatabase | null>(null);
  documentId = signal<string | null>(null);
  breadcrumbs = signal<BreadcrumbItem[]>([]);

  // Computed
  databaseName = computed(() => this.database()?.name || 'Base de données');
  databaseConfig = computed(() => this.database()?.config || DEFAULT_DATABASE_CONFIG);

  ngOnInit(): void {
    this.route.paramMap
      .pipe(
        takeUntil(this.destroy$),
        switchMap(params => {
          const id = params.get('id');
          if (!id) {
            throw new Error('Database ID is required');
          }
          this.isLoading.set(true);
          this.error.set(null);
          return this.databaseService.getDatabaseMetadata(id);
        })
      )
      .subscribe({
        next: (metadata) => {
          this.database.set(metadata);
          // Get the document ID for this database and build breadcrumbs
          this.databaseService
            .getDocumentIdByDatabaseId(metadata.database_id)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: (docId) => {
                this.documentId.set(docId);
                if (docId) {
                  this.buildBreadcrumbs(docId, metadata);
                } else {
                  // No parent document, just show database name
                  this.breadcrumbs.set([
                    { id: metadata.database_id, title: metadata.name, type: 'database' }
                  ]);
                  this.isLoading.set(false);
                }
              },
              error: () => {
                // Document ID is optional, continue without it
                this.breadcrumbs.set([
                  { id: metadata.database_id, title: metadata.name, type: 'database' }
                ]);
                this.isLoading.set(false);
              }
            });
        },
        error: (err) => {
          console.error('Failed to load database:', err);
          this.error.set('Base de données introuvable');
          this.isLoading.set(false);
        }
      });
  }

  /**
   * Build breadcrumb hierarchy from document to database
   */
  private buildBreadcrumbs(docId: string, database: DocumentDatabase): void {
    this.documentService.getDocument(docId)
      .pipe(
        takeUntil(this.destroy$),
        switchMap((doc: Document | null) => {
          if (!doc) {
            return of([]);
          }

          // Build hierarchy by traversing parent_id
          const hierarchy: Document[] = [doc];
          return this.buildDocumentHierarchy(doc, hierarchy);
        })
      )
      .subscribe({
        next: (hierarchy: Document[]) => {
          // Convert to breadcrumb items (reverse to get root first)
          const crumbs: BreadcrumbItem[] = hierarchy.reverse().map(doc => ({
            id: doc.id,
            title: doc.title || 'Sans titre',
            type: 'document' as const
          }));

          // Add database as last item
          crumbs.push({
            id: database.database_id,
            title: database.name,
            type: 'database'
          });

          this.breadcrumbs.set(crumbs);
          this.isLoading.set(false);
        },
        error: () => {
          this.breadcrumbs.set([
            { id: database.database_id, title: database.name, type: 'database' }
          ]);
          this.isLoading.set(false);
        }
      });
  }

  /**
   * Recursively build document hierarchy
   */
  private buildDocumentHierarchy(doc: Document, hierarchy: Document[]): Observable<Document[]> {
    if (!doc.parent_id) {
      return of(hierarchy);
    }

    return this.documentService.getDocument(doc.parent_id).pipe(
      switchMap((parentDoc: Document | null): Observable<Document[]> => {
        if (parentDoc) {
          hierarchy.push(parentDoc);
          return this.buildDocumentHierarchy(parentDoc, hierarchy);
        }
        return of(hierarchy);
      }),
      catchError(() => of(hierarchy))
    );
  }

  navigateBack(): void {
    // If we have a document ID, navigate to the document
    const docId = this.documentId();
    if (docId) {
      this.router.navigate(['/documents', docId]);
    } else {
      // Otherwise go to documents list
      this.router.navigate(['/documents']);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
