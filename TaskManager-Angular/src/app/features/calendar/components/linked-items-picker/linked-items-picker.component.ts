import { Component, ChangeDetectionStrategy, forwardRef, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { LinkedItem } from '../../../../features/documents/models/database.model';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';

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
    MatChipsModule,
    MatIconModule,
    MatTabsModule,
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
  protected selectedItems = signal<LinkedItem[]>([]);
  protected searchResults = signal<LinkedItem[]>([]);
  protected activeTab = signal<LinkedItemTab>('all');
  protected isDisabled = signal(false);

  searchControl = new FormControl<string>('', { nonNullable: true });

  private destroy$ = new Subject<void>();
  private onChange: (value: LinkedItem[]) => void = () => {};
  private onTouched: () => void = () => {};

  readonly tabs: { value: LinkedItemTab; label: string }[] = [
    { value: 'all', label: 'Tous' },
    { value: 'tasks', label: 'Taches' },
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

    // Clear search after selection
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
    // Re-run search with current query and new tab filter
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

  getItemIconColor(type: string): string {
    switch (type) {
      case 'task': return 'text-green-600';
      case 'document': return 'text-blue-600';
      case 'database': return 'text-purple-600';
      default: return 'text-gray-600';
    }
  }

  protected filteredResults = (): LinkedItem[] => {
    const results = this.searchResults();
    const tab = this.activeTab();
    const selected = this.selectedItems();

    let filtered = results;

    // Filter by tab
    if (tab !== 'all') {
      const typeMap: Record<string, string> = {
        tasks: 'task',
        documents: 'document',
        databases: 'database',
      };
      filtered = filtered.filter(item => item.type === typeMap[tab]);
    }

    // Exclude already selected items
    filtered = filtered.filter(
      item => !selected.some(s => s.id === item.id && s.type === item.type)
    );

    return filtered;
  };

  /**
   * Perform search across tasks, documents, and databases.
   * Currently a stub returning empty results.
   * Wire up TaskDatabaseService, DocumentService, DatabaseService later.
   */
  private performSearch(query: string): void {
    if (!query || query.trim().length < 2) {
      this.searchResults.set([]);
      return;
    }

    // Stub: return empty results for now.
    // In production, this would call services to search across
    // tasks, documents, and databases, then merge results.
    this.searchResults.set([]);
  }
}
