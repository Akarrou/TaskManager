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
  templateUrl: './delete-document-dialog.component.html'
})
export class DeleteDocumentDialogComponent {
  data = inject<DeleteDocumentDialogData>(MAT_DIALOG_DATA);
}
