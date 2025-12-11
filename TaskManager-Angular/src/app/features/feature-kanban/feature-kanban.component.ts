import { Component, OnInit, OnDestroy, inject, computed, signal } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Store, select } from '@ngrx/store';
import { Observable, Subject } from 'rxjs';
import { takeUntil, take } from 'rxjs/operators';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatCardModule } from '@angular/material/card';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';

import { GenericKanbanComponent } from '../../shared/components/generic-kanban/generic-kanban.component';
import { ItemHeaderComponent } from '../../shared/components/item-header/item-header.component';
import { SearchFiltersComponent } from '../epic-kanban/components/search-filters/search-filters.component';
import { ItemMetricsComponent } from '../../shared/components/item-metrics/item-metrics.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { KanbanItem } from '../epic-kanban/models/kanban-item.model';
import { KanbanColumn } from '../epic-kanban/models/epic-board.model';
import { DEFAULT_KANBAN_COLUMNS } from '../epic-kanban/models/kanban-constants';
import { EpicKanbanActions } from '../epic-kanban/store/epic-kanban.actions';
import * as fromFeatureKanban from '../epic-kanban/store/epic-kanban.selectors';
import { Task, TaskService } from '../../core/services/task';
import { ISubtask } from '../tasks/subtask.model';
import { CdkDragDrop } from '@angular/cdk/drag-drop';

type TaskStatus = Task['status'];

@Component({
  selector: 'app-feature-kanban',
  standalone: true,
  imports: [
    CommonModule,
    MatProgressBarModule,
    MatIconModule,
    MatCardModule,
    MatDialogModule,
    MatSnackBarModule,
    MatButtonModule,
    GenericKanbanComponent,
    ItemHeaderComponent,
    SearchFiltersComponent,
    ItemMetricsComponent,
  ],
  templateUrl: './feature-kanban.component.html',
  styleUrls: ['./feature-kanban.component.scss'],
})
export class FeatureKanbanComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private store = inject(Store);
  private location = inject(Location);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private taskService = inject(TaskService);
  private destroy$ = new Subject<void>();

  // Signals for reactive state
  currentFeatureId = signal<string | null>(null);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  // Observables
  currentFeature$ = this.store.pipe(select(fromFeatureKanban.selectCurrentFeatureAsKanbanItem));
  currentEpic$ = this.store.pipe(select(fromFeatureKanban.selectCurrentEpic));
  tasks$ = this.store.pipe(select(fromFeatureKanban.selectTasksForCurrentFeatureAsKanbanItems));
  tasksAsKanbanItems$ = this.store.pipe(select(fromFeatureKanban.selectTasksForCurrentFeatureAsKanbanItems));
  columns$ = this.store.pipe(select(fromFeatureKanban.selectColumns));
  metrics$ = this.store.pipe(select(fromFeatureKanban.selectMetrics));
  loading$ = this.store.pipe(select(fromFeatureKanban.selectFeatureTasksLoading));
  error$ = this.store.pipe(select(fromFeatureKanban.selectFeatureTasksError));

  // Computed values
  currentFeatureItem = this.store.selectSignal(fromFeatureKanban.selectCurrentFeatureAsKanbanItem);

  readonly columns: KanbanColumn[] = DEFAULT_KANBAN_COLUMNS;

  constructor() {
    // Initialize reactive state
    this.initializeFeatureId();
  }

  ngOnInit(): void {
    this.loadTasks();
    this.setupSubscriptions();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeFeatureId(): void {
    const featureId = this.route.snapshot.paramMap.get('featureId');
    if (featureId) {
      this.currentFeatureId.set(featureId);
    }
  }

  private setupSubscriptions(): void {
    // Setup any additional subscriptions if needed
    this.loading$.pipe(takeUntil(this.destroy$)).subscribe(loading => {
      this.isLoading.set(loading);
    });

    this.error$.pipe(takeUntil(this.destroy$)).subscribe(error => {
      this.errorMessage.set(error);
    });
  }

  loadTasks(): void {
    const featureId = this.route.snapshot.paramMap.get('featureId');
    if (featureId) {
      this.store.dispatch(EpicKanbanActions.loadFeatureTasks({ featureId }));
    }
  }

  // Kanban event handlers
  onTaskMove(event: { item: KanbanItem; newStatus: TaskStatus }): void {
    this.store.dispatch(EpicKanbanActions.updateTaskStatus({
      taskId: event.item.id as string,
      newStatus: event.newStatus
    }));
  }

  onTaskEdit(item: KanbanItem): void {
    // Navigate to task edit page
    if (item.id) {
      this.router.navigate(['/tasks', item.id, 'edit']);
    }
  }

  onTaskDelete(item: KanbanItem): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Supprimer la tâche',
        message: `Êtes-vous sûr de vouloir supprimer la tâche "${item.title}" ?`,
        confirmText: 'Supprimer',
        cancelText: 'Annuler'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && item.id) {
        this.store.dispatch(EpicKanbanActions.deleteTask({ taskId: item.id as string }));
        this.snackBar.open('Tâche supprimée', 'Fermer', { duration: 3000 });
      }
    });
  }

  onNavigateBack(): void {
    this.location.back();
  }

  onNavigateToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  onNavigateToEpicKanban(): void {
    this.currentFeature$.pipe(take(1)).subscribe((feature: KanbanItem | null | undefined) => {
      if (feature?.parent_task_id) {
        this.router.navigate(['/epic', feature.parent_task_id, 'kanban']);
      } else {
        this.router.navigate(['/dashboard']);
      }
    });
  }

  // Additional navigation and action methods
  onRefreshBoard(): void {
    this.loadTasks();
    this.snackBar.open('Tableau actualisé', 'Fermer', { duration: 2000 });
  }

  onEditItem(item: KanbanItem): void {
    if (item.id) {
      this.router.navigate(['/tasks', item.id, 'edit']);
    }
  }

  onSaveItem(item: Partial<KanbanItem>): void {
    // Implementation for saving item
  }

  onDeleteItem(item: KanbanItem): void {
    this.onTaskDelete(item);
  }

  onExportBoard(): void {
    // Implementation for board export
    this.snackBar.open('Export en cours...', 'Fermer', { duration: 2000 });
  }

  onShareBoard(): void {
    // Implementation for board sharing
    this.snackBar.open('Lien de partage copié', 'Fermer', { duration: 2000 });
  }

  retryLoad(): void {
    this.loadTasks();
  }
}