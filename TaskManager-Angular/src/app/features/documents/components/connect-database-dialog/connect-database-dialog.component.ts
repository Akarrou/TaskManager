import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  MAT_DIALOG_DATA,
  MatDialogRef,
  MatDialogModule,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatListModule } from '@angular/material/list';
import { Subject, takeUntil } from 'rxjs';

import { DatabaseService } from '../../services/database.service';
import { DocumentDatabase, DatabaseConfig } from '../../models/database.model';

export interface ConnectDatabaseDialogData {
  currentDatabaseId: string;
}

export interface ConnectDatabaseDialogResult {
  selectedDatabaseId: string;
  selectedDatabaseConfig: DatabaseConfig;
}

@Component({
  selector: 'app-connect-database-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatListModule,
  ],
  templateUrl: './connect-database-dialog.component.html',
  styleUrl: './connect-database-dialog.component.scss',
})
export class ConnectDatabaseDialogComponent implements OnInit, OnDestroy {
  private dialogRef = inject(MatDialogRef<ConnectDatabaseDialogComponent>);
  private data = inject<ConnectDatabaseDialogData>(MAT_DIALOG_DATA);
  private databaseService = inject(DatabaseService);
  private destroy$ = new Subject<void>();

  // State
  isLoading = signal(true);
  databases = signal<DocumentDatabase[]>([]);
  selectedDatabase = signal<DocumentDatabase | null>(null);
  error = signal<string | null>(null);

  ngOnInit(): void {
    this.loadDatabases();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadDatabases(): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.databaseService
      .getAllDatabases()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: allDatabases => {
          // Filter out the current database
          const filtered = allDatabases.filter(
            db => db.database_id !== this.data.currentDatabaseId
          );
          this.databases.set(filtered);
          this.isLoading.set(false);
        },
        error: err => {
          console.error('Failed to load databases:', err);
          this.error.set('Erreur lors du chargement des bases de données');
          this.isLoading.set(false);
        },
      });
  }

  onSelectDatabase(db: DocumentDatabase): void {
    this.selectedDatabase.set(db);
  }

  isSelected(db: DocumentDatabase): boolean {
    return this.selectedDatabase()?.database_id === db.database_id;
  }

  onConfirm(): void {
    const selected = this.selectedDatabase();
    if (!selected) return;

    const result: ConnectDatabaseDialogResult = {
      selectedDatabaseId: selected.database_id,
      selectedDatabaseConfig: selected.config,
    };

    this.dialogRef.close(result);
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  getColumnCount(db: DocumentDatabase): number {
    return db.config?.columns?.length || 0;
  }

  getDatabaseName(db: DocumentDatabase): string {
    return db.name || db.config?.name || 'Base de données sans nom';
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('fr-FR');
  }
}
