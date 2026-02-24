import { Component, inject, signal, computed, OnInit, OnDestroy, HostListener, afterNextRender, viewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GlobalSearchStore } from '../../../core/stores/global-search.store';
import { SearchResult } from '../../models/search.model';

@Component({
  selector: 'app-global-search-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './global-search-dialog.component.html',
  styleUrl: './global-search-dialog.component.scss',
})
export class GlobalSearchDialogComponent implements OnInit, OnDestroy {
  private dialogRef = inject(MatDialogRef<GlobalSearchDialogComponent>);
  private router = inject(Router);
  readonly store = inject(GlobalSearchStore);

  readonly searchInputRef = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  searchQuery = signal('');
  selectedIndex = signal(-1);
  private searchSubject = new Subject<string>();

  /** All results flattened for keyboard navigation */
  readonly flatResults = computed<SearchResult[]>(() => {
    const r = this.store.results();
    if (!r) return [];
    return [...r.documents, ...r.tasks, ...r.events];
  });

  constructor() {
    // Subscription auto-cleanup via takeUntilDestroyed (no debounce here — store handles it)
    this.searchSubject.pipe(takeUntilDestroyed()).subscribe((query) => {
      if (query.trim().length >= 2) {
        this.store.search(query.trim());
        this.selectedIndex.set(-1);
      }
    });

    // Focus input after render (replaces ElementRef + ngAfterViewInit)
    afterNextRender(() => {
      this.searchInputRef()?.nativeElement.focus();
    });
  }

  ngOnInit() {
    this.store.clear();
  }

  ngOnDestroy() {
    this.searchSubject.complete();
  }

  onSearchInput(event: Event) {
    const target = event.target as HTMLInputElement;
    const query = target.value;
    this.searchQuery.set(query);
    this.searchSubject.next(query);
  }

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    const flat = this.flatResults();

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = this.selectedIndex() + 1;
      this.selectedIndex.set(next < flat.length ? next : 0);
      this.scrollToSelected();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prev = this.selectedIndex() - 1;
      this.selectedIndex.set(prev >= 0 ? prev : flat.length - 1);
      this.scrollToSelected();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const idx = this.selectedIndex();
      if (idx >= 0 && idx < flat.length) {
        this.selectResult(flat[idx]);
      }
    }
  }

  selectResult(result: SearchResult) {
    const query = this.searchQuery().trim();
    this.store.clear();
    this.dialogRef.close();

    // For database results (tasks/events), pass search query to filter the table
    if (result.databaseId && query) {
      this.router.navigate([result.navigateTo], { queryParams: { search: query } });
    } else {
      this.router.navigate([result.navigateTo]);
    }
  }

  isSelected(result: SearchResult): boolean {
    const flat = this.flatResults();
    const idx = this.selectedIndex();
    return idx >= 0 && flat[idx]?.id === result.id;
  }

  private scrollToSelected() {
    requestAnimationFrame(() => {
      const el = document.querySelector('.spotlight-result-item.is-selected');
      el?.scrollIntoView({ block: 'nearest' });
    });
  }
}
