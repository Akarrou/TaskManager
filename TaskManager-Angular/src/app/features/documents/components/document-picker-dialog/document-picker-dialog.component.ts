import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { debounceTime, Subject } from 'rxjs';
import { Document } from '../../services/document.service';

export interface DocumentPickerDialogData {
  documents: Document[];
  excludeDocumentIds: Set<string>;
}

@Component({
  selector: 'app-document-picker-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
  ],
  templateUrl: './document-picker-dialog.component.html',
  styleUrl: './document-picker-dialog.component.scss',
})
export class DocumentPickerDialogComponent implements OnInit {
  private dialogRef = inject(MatDialogRef<DocumentPickerDialogComponent>);
  private data: DocumentPickerDialogData = inject(MAT_DIALOG_DATA);

  searchQuery = signal('');
  filteredDocuments = signal<Document[]>([]);
  selectedDocument = signal<Document | null>(null);

  private availableDocuments: Document[] = [];
  private searchSubject = new Subject<string>();

  ngOnInit(): void {
    this.availableDocuments = this.data.documents.filter(
      (doc) => !this.data.excludeDocumentIds.has(doc.id)
    );

    // Show all available documents initially
    this.filteredDocuments.set(this.availableDocuments);

    this.searchSubject.pipe(debounceTime(300)).subscribe((query) => {
      this.performFilter(query);
    });
  }

  onSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const query = target.value;
    this.searchQuery.set(query);

    if (query.trim().length >= 2) {
      this.searchSubject.next(query);
    } else {
      this.filteredDocuments.set(this.availableDocuments);
    }
  }

  private performFilter(query: string): void {
    const lowerQuery = query.toLowerCase().trim();
    this.filteredDocuments.set(
      this.availableDocuments.filter((doc) =>
        (doc.title || 'Sans titre').toLowerCase().includes(lowerQuery)
      )
    );
  }

  selectDocument(doc: Document): void {
    this.selectedDocument.set(doc);
  }

  confirmSelection(): void {
    const doc = this.selectedDocument();
    if (doc) {
      this.dialogRef.close(doc.id);
    }
  }

  cancel(): void {
    this.dialogRef.close(null);
  }
}
