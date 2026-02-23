import { Component, OnInit, OnDestroy, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subject, takeUntil } from 'rxjs';

import { EventDatabaseService, EventEntry } from '../../../../core/services/event-database.service';
import { LinkedItem } from '../../../documents/models/database.model';
import {
  EventCategory,
  getCategoryLabel,
  getCategoryColors,
  getCategoryHexColor,
} from '../../../../shared/models/event-constants';
import { EventCategoryStore } from '../../../../core/stores/event-category.store';

export interface AddToEventDialogData {
  item: LinkedItem;
}

@Component({
  selector: 'app-add-to-event-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    DatePipe,
  ],
  templateUrl: './add-to-event-dialog.component.html',
  styleUrls: ['./add-to-event-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddToEventDialogComponent implements OnInit, OnDestroy {
  private dialogRef = inject(MatDialogRef<AddToEventDialogComponent>);
  private data: AddToEventDialogData = inject(MAT_DIALOG_DATA);
  private eventDatabaseService = inject(EventDatabaseService);
  private snackBar = inject(MatSnackBar);
  private categoryStore = inject(EventCategoryStore);

  private destroy$ = new Subject<void>();

  allEvents = signal<EventEntry[]>([]);
  loading = signal(true);
  linking = signal(false);
  searchQuery = signal('');
  duplicateWarning = signal<string | null>(null);

  filteredEvents = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const events = this.allEvents();
    if (!query) return events;
    return events.filter(e => e.title.toLowerCase().includes(query));
  });

  item = this.data.item;

  ngOnInit(): void {
    this.loadEvents();
  }

  onSearchInput(value: string): void {
    this.searchQuery.set(value);
  }

  selectEvent(event: EventEntry): void {
    this.duplicateWarning.set(null);

    const existingItems = event.linked_items || [];
    const isDuplicate = existingItems.some(
      li => li.id === this.item.id && li.type === this.item.type,
    );

    if (isDuplicate) {
      this.duplicateWarning.set(
        `Cet élément est déjà lié à l'événement « ${event.title} ».`,
      );
      return;
    }

    this.linking.set(true);
    const updatedItems: LinkedItem[] = [...existingItems, this.item];

    this.eventDatabaseService
      .updateEvent(event.databaseId, event.id, { linked_items: updatedItems })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.snackBar.open(
            `Lié avec succès à « ${event.title} »`,
            'OK',
            { duration: 3000 },
          );
          this.dialogRef.close(true);
        },
        error: (err) => {
          console.error('[AddToEventDialog] Update failed:', err);
          this.snackBar.open(
            'Erreur lors de la liaison. Veuillez réessayer.',
            'OK',
            { duration: 4000 },
          );
          this.linking.set(false);
        },
      });
  }

  getItemTypeLabel(): string {
    switch (this.item.type) {
      case 'task': return 'Tâche';
      case 'document': return 'Document';
      case 'database': return 'Base de données';
      default: return 'Élément';
    }
  }

  getCategoryLabelForEvent(category: EventCategory): string {
    return getCategoryLabel(category, this.categoryStore.allCategories());
  }

  getCategoryColorsForEvent(category: EventCategory): { bg: string; text: string; border: string } {
    return getCategoryColors(category, this.categoryStore.allCategories());
  }

  getCategoryHexColorForEvent(category: EventCategory): string {
    return getCategoryHexColor(category, this.categoryStore.allCategories());
  }

  close(): void {
    this.dialogRef.close(false);
  }

  private loadEvents(): void {
    const now = new Date();
    const start = new Date(now);
    start.setMonth(start.getMonth() - 1);
    const end = new Date(now);
    end.setMonth(end.getMonth() + 3);

    this.eventDatabaseService
      .getEventEntriesForDateRange(start.toISOString(), end.toISOString())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (events) => {
          this.allEvents.set(events);
          this.loading.set(false);
        },
        error: (err) => {
          console.error('[AddToEventDialog] Failed to load events:', err);
          this.loading.set(false);
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
