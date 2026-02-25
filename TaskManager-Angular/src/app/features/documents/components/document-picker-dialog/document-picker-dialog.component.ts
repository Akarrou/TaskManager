import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { catchError, debounceTime, of, Subject, switchMap, finalize } from 'rxjs';

import { Document } from '../../services/document.service';
import { GlobalSearchService } from '../../../../core/services/global-search.service';
import { DatabaseService } from '../../services/database.service';
import { DocumentStore } from '../../store/document.store';
import { SearchResult, SearchResponse } from '../../../../shared/models/search.model';

export interface DocumentPickerDialogData {
  documents: Document[];
  excludeDocumentIds: Set<string>;
}

@Component({
  selector: 'app-document-picker-dialog',
  standalone: true,
  imports: [
    MatDialogModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './document-picker-dialog.component.html',
  styleUrl: './document-picker-dialog.component.scss',
})
export class DocumentPickerDialogComponent {
  private dialogRef = inject(MatDialogRef<DocumentPickerDialogComponent>);
  private data: DocumentPickerDialogData = inject(MAT_DIALOG_DATA);
  private globalSearchService = inject(GlobalSearchService);
  private databaseService = inject(DatabaseService);
  private documentStore = inject(DocumentStore);
  private destroyRef = inject(DestroyRef);

  searchQuery = signal('');
  filteredDocuments = signal<Document[]>([]);
  searchResults = signal<SearchResponse | null>(null);
  loading = signal(false);
  resolving = signal(false);
  resolveError = signal<string | null>(null);
  selectedDocument = signal<Document | null>(null);
  selectedResult = signal<SearchResult | null>(null);

  hasSelection = computed(() => this.selectedDocument() !== null || this.selectedResult() !== null);
  isSearchMode = computed(() => this.searchQuery().trim().length >= 2 && this.searchResults() !== null);

  private readonly availableDocuments: Document[];
  private readonly searchSubject = new Subject<string>();
  private readonly emptyResponse: SearchResponse = { documents: [], tasks: [], events: [], total: 0 };

  constructor() {
    this.availableDocuments = this.data.documents.filter(
      (doc) => !this.data.excludeDocumentIds.has(doc.id)
    );
    this.filteredDocuments.set(this.availableDocuments);

    this.searchSubject.pipe(
      debounceTime(300),
      switchMap((query) => {
        this.loading.set(true);
        return this.globalSearchService.search(query).pipe(
          catchError(() => of(this.emptyResponse)),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((response) => {
      const filteredDocs = response.documents.filter(
        (doc) => !this.data.excludeDocumentIds.has(doc.id)
      );
      this.searchResults.set({
        ...response,
        documents: filteredDocs,
        total: filteredDocs.length + response.tasks.length + response.events.length,
      });
      this.loading.set(false);
    });
  }

  isResultSelected(result: SearchResult): boolean {
    const selected = this.selectedResult();
    return selected?.id === result.id && selected?.type === result.type;
  }

  onSearchInput(event: Event): void {
    const query = (event.target as HTMLInputElement).value;
    this.searchQuery.set(query);
    this.selectedDocument.set(null);
    this.selectedResult.set(null);
    this.resolveError.set(null);

    if (query.trim().length >= 2) {
      this.searchSubject.next(query);
    } else {
      this.searchResults.set(null);
      this.loading.set(false);
      this.filteredDocuments.set(this.availableDocuments);
    }
  }

  selectResult(result: SearchResult): void {
    this.selectedResult.set(result);
    this.selectedDocument.set(null);
    this.resolveError.set(null);
  }

  selectDocument(doc: Document): void {
    this.selectedDocument.set(doc);
    this.selectedResult.set(null);
    this.resolveError.set(null);
  }

  confirmSelection(): void {
    const result = this.selectedResult();
    const doc = this.selectedDocument();

    if (doc) {
      this.dialogRef.close(doc.id);
      return;
    }

    if (!result) return;

    if (result.type === 'document') {
      this.dialogRef.close(result.id);
      return;
    }

    if (!result.databaseId) return;

    this.resolving.set(true);
    this.resolveError.set(null);

    this.databaseService
      .getRowDocument(result.databaseId, result.id)
      .pipe(finalize(() => this.resolving.set(false)))
      .subscribe({
        next: (resolvedDoc) => {
          if (!resolvedDoc) {
            this.resolveError.set('Aucun document associé trouvé');
            return;
          }
          this.documentStore.upsertDocumentEntity(resolvedDoc);
          this.dialogRef.close(resolvedDoc.id);
        },
        error: () => {
          this.resolveError.set('Erreur lors de la résolution du document');
        },
      });
  }

  cancel(): void {
    this.dialogRef.close(null);
  }
}
