import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface SaveChangesDialogData {
  title: string;
  message: string;
}

@Component({
  selector: 'app-save-changes-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './save-changes-dialog.component.html',
})
export class SaveChangesDialogComponent {
  dialogRef = inject(MatDialogRef<SaveChangesDialogComponent>);
  data = inject<SaveChangesDialogData>(MAT_DIALOG_DATA);

  onSave() {
    this.dialogRef.close('save');
  }
  onDiscard() {
    this.dialogRef.close('discard');
  }
  onCancel() {
    this.dialogRef.close('cancel');
  }
} 