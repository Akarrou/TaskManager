import { Component, ChangeDetectionStrategy, forwardRef, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { Subject, forkJoin, of, debounceTime, distinctUntilChanged, takeUntil, catchError, map } from 'rxjs';

import { LinkedItem } from '../../../../features/documents/models/database.model';
import { TaskDatabaseService } from '../../../../core/services/task-database.service';
import { DocumentService } from '../../../../features/documents/services/document.service';
import { DatabaseService } from '../../../../features/documents/services/database.service';

type LinkedItemTab = 'all' | 'tasks' | 'documents' | 'databases';

@Component({
  selector: 'app-linked-items-picker',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './linked-items-picker.component.html',
  styleUrls: ['./linked-items-picker.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => LinkedItemsPickerComponent),
      multi: true,
    },
  ],
})
export class LinkedItemsPickerComponent implements ControlValueAccessor, OnInit, OnDestroy {
  private taskDatabaseService = inject(TaskDatabaseService);
  private documentService = inject(DocumentService);
  private databaseService = inject(DatabaseService);

  protected selectedItems = signal<LinkedItem[]>([]);
  protected searchResults = signal<LinkedItem[]>([]);
  protected activeTab = signal<LinkedItemTab>('all');
  protected isDisabled = signal(false);
  protected isSearching = signal(false);

  searchControl = new FormControl<string>('', { nonNullable: true });

  private destroy$ = new Subject<void>();
  private onChange: (value: LinkedItem[]) => void = () => {};
  private onTouched: () => void = () => {};

  readonly tabs: { value: LinkedItemTab; label: string }[] = [
    { value: 'all', label: 'Tous' },
    { value: 'tasks', label: 'Tâches' },
    { value: 'documents', label: 'Documents' },
    { value: 'databases', label: 'Bases' },
  ];

  ngOnInit(): void {
    this.searchControl.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe(query => {
      this.performSearch(query);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ControlValueAccessor implementation

  writeValue(value: LinkedItem[] | null): void {
    this.selectedItems.set(value ?? []);
  }

  registerOnChange(fn: (value: LinkedItem[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled.set(isDisabled);
    if (isDisabled) {
      this.searchControl.disable();
    } else {
      this.searchControl.enable();
    }
  }

  // Public methods

  addItem(item: LinkedItem): void {
    const current = this.selectedItems();
    const alreadySelected = current.some(
      existing => existing.id === item.id && existing.type === item.type
    );

    if (!alreadySelected) {
      const updated = [...current, item];
      this.selectedItems.set(updated);
      this.onChange(updated);
      this.onTouched();
    }

    this.searchControl.setValue('');
    this.searchResults.set([]);
  }

  removeItem(item: LinkedItem): void {
    const current = this.selectedItems();
    const updated = current.filter(
      existing => !(existing.id === item.id && existing.type === item.type)
    );
    this.selectedItems.set(updated);
    this.onChange(updated);
    this.onTouched();
  }

  setActiveTab(tab: LinkedItemTab): void {
    this.activeTab.set(tab);
    const query = this.searchControl.value;
    if (query) {
      this.performSearch(query);
    }
  }

  getItemIcon(type: string): string {
    switch (type) {
      case 'task': return 'task_alt';
      case 'document': return 'article';
      case 'database': return 'storage';
      default: return 'link';
    }
  }

  getItemTypeLabel(type: string): string {
    switch (type) {
      case 'task': return 'Tâche';
      case 'document': return 'Document';
      case 'database': return 'Base';
      default: return type;
    }
  }

  protected filteredResults = (): LinkedItem[] => {
    const results = this.searchResults();
    const tab = this.activeTab();
    const selected = this.selectedItems();

    let filtered = results;

    if (tab !== 'all') {
      const typeMap: Record<string, string> = {
        tasks: 'task',
        documents: 'document',
        databases: 'database',
      };
      filtered = filtered.filter(item => item.type === typeMap[tab]);
    }

    filtered = filtered.filter(
      item => !selected.some(s => s.id === item.id && s.type === item.type)
    );

    return filtered;
  };

  private performSearch(query: string): void {
    if (!query || query.trim().length < 2) {
      this.searchResults.set([]);
      this.isSearching.set(false);
      return;
    }

    this.isSearching.set(true);
    const lowerQuery = query.toLowerCase();

    const tasksByTitle$ = this.taskDatabaseService.getAllTaskEntries({
      filters: [{ property: 'title', operator: 'contains', value: query }],
      limit: 20,
    }).pipe(
      map(result => result.entries),
      catchError(() => of([])),
    );

    const tasksByNumber$ = this.taskDatabaseService.getAllTaskEntries({
      filters: [{ property: 'task_number', operator: 'contains', value: query }],
      limit: 20,
    }).pipe(
      map(result => result.entries),
      catchError(() => of([])),
    );

    const tasks$ = forkJoin([tasksByTitle$, tasksByNumber$]).pipe(
      map(([byTitle, byNumber]) => {
        const seen = new Set<string>();
        const merged: LinkedItem[] = [];
        for (const entry of [...byTitle, ...byNumber]) {
          if (!seen.has(entry.id)) {
            seen.add(entry.id);
            merged.push({
              type: 'task' as const,
              id: entry.id,
              databaseId: entry.databaseId,
              label: entry.task_number ? `${entry.task_number} — ${entry.title}` : entry.title,
            });
          }
        }
        return merged;
      }),
    );

    const documents$ = this.documentService.getDocuments().pipe(
      map(docs => docs
        .filter(doc => doc.title?.toLowerCase().includes(lowerQuery))
        .slice(0, 20)
        .map(doc => ({
          type: 'document' as const,
          id: doc.id,
          label: doc.title,
        }))
      ),
      catchError(() => of([] as LinkedItem[])),
    );

    const databases$ = this.databaseService.getAllDatabases().pipe(
      map(dbs => dbs
        .filter(db => db.name?.toLowerCase().includes(lowerQuery))
        .slice(0, 20)
        .map(db => ({
          type: 'database' as const,
          id: db.database_id,
          label: db.name,
        }))
      ),
      catchError(() => of([] as LinkedItem[])),
    );

    forkJoin([tasks$, documents$, databases$]).pipe(
      takeUntil(this.destroy$),
    ).subscribe({
      next: ([tasks, documents, databases]) => {
        this.searchResults.set([...tasks, ...documents, ...databases]);
        this.isSearching.set(false);
      },
      error: () => {
        this.searchResults.set([]);
        this.isSearching.set(false);
      },
    });
  }
}
