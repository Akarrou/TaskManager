import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface DeleteSectionDialogData {
  sectionTitle: string;
}

@Component({
  selector: 'app-delete-section-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './delete-section-dialog.component.html'
})
export class DeleteSectionDialogComponent {
  data = inject<DeleteSectionDialogData>(MAT_DIALOG_DATA);
}
