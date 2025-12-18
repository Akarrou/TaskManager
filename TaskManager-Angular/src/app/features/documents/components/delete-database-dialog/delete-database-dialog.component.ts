import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface DeleteDatabaseDialogData {
  databaseName: string;
  rowCount: number;
}

@Component({
  selector: 'app-delete-database-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './delete-database-dialog.component.html'
})
export class DeleteDatabaseDialogComponent {
  data = inject<DeleteDatabaseDialogData>(MAT_DIALOG_DATA);
}
