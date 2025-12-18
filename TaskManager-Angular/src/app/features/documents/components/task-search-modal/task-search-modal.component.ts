import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { debounceTime, Subject } from 'rxjs';
import { DocumentService } from '../../services/document.service';
import { TaskSearchResult } from '../../models/document-task-relation.model';

@Component({
  selector: 'app-task-search-modal',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './task-search-modal.component.html',
  styleUrl: './task-search-modal.component.scss',
})
export class TaskSearchModalComponent implements OnInit {
  private dialogRef = inject(MatDialogRef<TaskSearchModalComponent>);
  private documentService = inject(DocumentService);

  searchQuery = signal('');
  searchResults = signal<TaskSearchResult[]>([]);
  isSearching = signal(false);
  selectedTask = signal<TaskSearchResult | null>(null);

  private searchSubject = new Subject<string>();

  ngOnInit() {
    this.searchSubject.pipe(debounceTime(300)).subscribe((query) => {
      this.performSearch(query);
    });
  }

  onSearchInput(event: Event) {
    const target = event.target as HTMLInputElement;
    const query = target.value;
    this.searchQuery.set(query);

    if (query.trim().length >= 2) {
      this.isSearching.set(true);
      this.searchSubject.next(query);
    } else {
      this.searchResults.set([]);
      this.isSearching.set(false);
    }
  }

  private performSearch(query: string) {
    this.documentService.searchTasks(query).subscribe({
      next: (results) => {
        this.searchResults.set(results);
        this.isSearching.set(false);
      },
      error: () => {
        this.searchResults.set([]);
        this.isSearching.set(false);
      },
    });
  }

  selectTask(task: TaskSearchResult) {
    this.selectedTask.set(task);
  }

  confirmSelection() {
    const task = this.selectedTask();
    if (task) {
      this.dialogRef.close(task);
    }
  }

  cancel() {
    this.dialogRef.close(null);
  }
}
