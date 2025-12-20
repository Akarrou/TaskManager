import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface DeleteTabDialogData {
  tabName: string;
}

@Component({
  selector: 'app-delete-tab-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './delete-tab-dialog.component.html'
})
export class DeleteTabDialogComponent {
  data = inject<DeleteTabDialogData>(MAT_DIALOG_DATA);
}
