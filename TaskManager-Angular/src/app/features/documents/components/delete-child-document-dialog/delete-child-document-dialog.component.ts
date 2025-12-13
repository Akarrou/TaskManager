import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface DeleteChildDocumentDialogData {
  documentTitle: string;
  childDocumentCount: number;
  databaseCount: number;
}

@Component({
  selector: 'app-delete-child-document-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './delete-child-document-dialog.component.html'
})
export class DeleteChildDocumentDialogComponent {
  data = inject<DeleteChildDocumentDialogData>(MAT_DIALOG_DATA);
}
