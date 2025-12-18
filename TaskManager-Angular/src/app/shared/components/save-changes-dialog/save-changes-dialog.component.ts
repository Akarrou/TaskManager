import { Component, Inject } from '@angular/core';
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
  constructor(
    public dialogRef: MatDialogRef<SaveChangesDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: SaveChangesDialogData
  ) {}

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