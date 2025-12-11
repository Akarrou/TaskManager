import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface DeleteDocumentDialogData {
  documentTitle: string;
  databaseCount: number;
}

@Component({
  selector: 'app-delete-document-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
  ],
  template: `
    <h2 mat-dialog-title class="flex items-center gap-2 text-red-600">
      <mat-icon>warning</mat-icon>
      Confirmer la suppression
    </h2>

    <mat-dialog-content class="py-6">
      <p class="mb-4">
        Voulez-vous vraiment supprimer le document
        <strong>"{{ data.documentTitle }}"</strong> ?
      </p>

      @if (data.databaseCount > 0) {
        <div class="p-4 bg-orange-50 border-l-4 border-orange-400 rounded">
          <div class="flex items-start gap-2">
            <mat-icon class="text-orange-600">info</mat-icon>
            <div>
              <p class="font-medium text-orange-900 mb-2">
                Ce document contient {{ data.databaseCount }}
                base{{ data.databaseCount > 1 ? 's' : '' }} de données
              </p>
              <p class="text-sm text-orange-800">
                Toutes les bases de données et leurs tables PostgreSQL associées seront
                <strong>définitivement supprimées</strong>.
              </p>
            </div>
          </div>
        </div>
      }

      <p class="mt-4 text-sm text-gray-600">
        <mat-icon class="text-base align-middle">info</mat-icon>
        Cette action est irréversible.
      </p>
    </mat-dialog-content>

    <mat-dialog-actions align="end" class="gap-2">
      <button mat-button mat-dialog-close>Annuler</button>
      <button
        mat-raised-button
        color="warn"
        [mat-dialog-close]="true"
      >
        <mat-icon>delete</mat-icon>
        Supprimer définitivement
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    :host {
      display: block;
    }
  `]
})
export class DeleteDocumentDialogComponent {
  data = inject<DeleteDocumentDialogData>(MAT_DIALOG_DATA);
}
