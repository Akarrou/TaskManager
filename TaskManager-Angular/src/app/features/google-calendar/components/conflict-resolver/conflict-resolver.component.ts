import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';

import { FormsModule } from '@angular/forms';

import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';

import { ConflictInfo } from '../../models/google-calendar.model';

type ResolutionStrategy = 'kodo' | 'google' | 'newest';

interface ConflictResolution {
  conflictId: string;
  strategy: ResolutionStrategy;
}

@Component({
  selector: 'app-conflict-resolver',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatIconModule,
    MatRadioModule,
  ],
  templateUrl: './conflict-resolver.component.html',
  styleUrls: ['./conflict-resolver.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConflictResolverComponent {
  private readonly dialogRef = inject(MatDialogRef<ConflictResolverComponent>);
  protected readonly conflicts: ConflictInfo[] = inject(MAT_DIALOG_DATA);

  protected readonly currentIndex = signal(0);
  protected resolution: ResolutionStrategy = 'newest';
  protected applyToAll = false;

  private readonly resolutions: ConflictResolution[] = [];

  protected readonly currentConflict = computed(() => this.conflicts[this.currentIndex()]);
  protected readonly isLast = computed(() => this.currentIndex() >= this.conflicts.length - 1);

  resolveAndNext(): void {
    const conflict = this.currentConflict();

    if (this.applyToAll) {
      const remaining = this.conflicts.slice(this.currentIndex()).map(c => ({
        conflictId: c.mapping_id,
        strategy: this.resolution,
      }));
      this.resolutions.push(...remaining);
      this.dialogRef.close(this.resolutions);
      return;
    }

    this.resolutions.push({
      conflictId: conflict.mapping_id,
      strategy: this.resolution,
    });

    if (this.isLast()) {
      this.dialogRef.close(this.resolutions);
    } else {
      this.currentIndex.update(i => i + 1);
      this.resolution = 'newest';
    }
  }

  skip(): void {
    if (this.isLast()) {
      this.dialogRef.close(this.resolutions);
    } else {
      this.currentIndex.update(i => i + 1);
      this.resolution = 'newest';
    }
  }
}
