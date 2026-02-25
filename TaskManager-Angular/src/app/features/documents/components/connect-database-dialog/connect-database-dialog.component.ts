import { Component, inject, signal, computed, OnInit } from '@angular/core';
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

import { DatabaseStore } from '../../store/database.store';
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
export class ConnectDatabaseDialogComponent implements OnInit {
  private dialogRef = inject(MatDialogRef<ConnectDatabaseDialogComponent>);
  private data = inject<ConnectDatabaseDialogData>(MAT_DIALOG_DATA);
  private databaseStore = inject(DatabaseStore);

  // State
  isLoading = this.databaseStore.loading;
  selectedDatabase = signal<DocumentDatabase | null>(null);
  error = this.databaseStore.error;

  // Filter out the current database from the store's list
  databases = computed(() =>
    this.databaseStore.databases().filter(
      db => db.database_id !== this.data.currentDatabaseId
    )
  );

  ngOnInit(): void {
    this.databaseStore.loadAllDatabases();
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
