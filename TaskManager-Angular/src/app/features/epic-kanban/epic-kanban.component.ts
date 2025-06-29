import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { Store } from '@ngrx/store';
import { Subject, takeUntil } from 'rxjs';

import { EpicHeaderComponent } from './components/epic-header/epic-header.component';
import { KanbanColumnComponent } from './components/kanban-column/kanban-column.component';
import { EpicMetricsComponent } from './components/epic-metrics/epic-metrics.component';

import { TaskService, Task } from '../../core/services/task';
import { EpicKanbanService } from './services/epic-kanban.service';
import { EpicBoard, KanbanColumn } from './models/epic-board.model';

// NgRx imports
import { EpicKanbanActions } from './store/epic-kanban.actions';
import { 
  selectCurrentEpic, 
  selectColumns, 
  selectFeatures,
  selectFeaturesByColumn, 
  selectTasks,
  selectMetrics,
  selectLoading,
  selectError,
  selectExpandedFeatures,
  selectTasksForFeature
} from './store/epic-kanban.selectors';

@Component({
  selector: 'app-epic-kanban',
  standalone: true,
  imports: [
    CommonModule,
    MatProgressBarModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    EpicHeaderComponent,
    KanbanColumnComponent,
    EpicMetricsComponent
  ],
  templateUrl: './epic-kanban.component.html',
  styleUrls: ['./epic-kanban.component.scss']
})
export class EpicKanbanComponent implements OnInit, OnDestroy {
  
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private store = inject(Store);
  private destroy$ = new Subject<void>();

  // Store selectors
  currentEpic$ = this.store.select(selectCurrentEpic);
  columns$ = this.store.select(selectColumns);
  features$ = this.store.select(selectFeatures);
  tasks$ = this.store.select(selectTasks);
  featuresByColumn$ = this.store.select(selectFeaturesByColumn);
  metrics$ = this.store.select(selectMetrics);
  loading$ = this.store.select(selectLoading);
  error$ = this.store.select(selectError);
  expandedFeatures$ = this.store.select(selectExpandedFeatures);

  // Local state for template
  expandedFeaturesSet = new Set<string>();
  featureTasksMap: { [featureId: string]: Task[] } = {};
  
  // Current epic ID
  epicId: string | null = null;

  ngOnInit(): void {
    this.loadEpicFromRoute();
    this.subscribeToStoreChanges();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadEpicFromRoute(): void {
    this.route.params.pipe(
      takeUntil(this.destroy$)
    ).subscribe(params => {
      const id = params['id'];
      if (id) {
        this.epicId = id;
        this.store.dispatch(EpicKanbanActions.loadEpicBoard({ epicId: id }));
      }
    });
  }

  onNavigateBack(): void {
    this.router.navigate(['/dashboard']);
  }

  onRefreshBoard(): void {
    if (this.epicId) {
      this.store.dispatch(EpicKanbanActions.loadEpicBoard({ epicId: this.epicId }));
    }
  }

  // Événements des features
  onFeatureMove(event: { featureId: string; fromColumnId: string; toColumnId: string; newStatus: string }): void {
    this.store.dispatch(EpicKanbanActions.moveFeature(event));
  }

  onFeatureExpand(featureId: string): void {
    this.store.dispatch(EpicKanbanActions.toggleFeatureExpansion({ featureId }));
  }

  onFeatureEdit(feature: Task): void {
    this.router.navigate(['/tasks', feature.id, 'edit']);
  }

  onFeatureDelete(feature: Task): void {
    // TODO: Implémenter la suppression avec confirmation
    console.log('Delete feature:', feature);
  }

  // Événements des tâches
  onTaskStatusChange(event: { task: Task; newStatus: string }): void {
    this.store.dispatch(EpicKanbanActions.updateTaskStatus({ 
      taskId: event.task.id!, 
      newStatus: event.newStatus 
    }));
  }

  onTaskClick(task: Task): void {
    this.router.navigate(['/tasks', task.id, 'edit']);
  }

  // Événements de l'epic header
  onEpicUpdate(epic: Partial<Task>): void {
    this.store.dispatch(EpicKanbanActions.updateEpic({ epic }));
  }

  // Utilitaires pour le template
  trackColumn(index: number, column: KanbanColumn): string {
    return column.id;
  }

  trackFeature(index: number, feature: Task): string {
    return feature.id || index.toString();
  }

  private subscribeToStoreChanges(): void {
    // Sync expanded features with local state
    this.expandedFeatures$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(expandedFeatures => {
      this.expandedFeaturesSet = expandedFeatures;
    });

    // Build feature-tasks map
    this.tasks$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(tasks => {
      this.featureTasksMap = {};
      tasks.forEach(task => {
        if (task.parent_task_id) {
          if (!this.featureTasksMap[task.parent_task_id]) {
            this.featureTasksMap[task.parent_task_id] = [];
          }
          this.featureTasksMap[task.parent_task_id].push(task);
        }
      });
    });
  }

  getFeatureTasksMap(): { [featureId: string]: Task[] } {
    return this.featureTasksMap;
  }

  onFeatureClick(feature: Task): void {
    this.router.navigate(['/tasks', feature.id, 'edit']);
  }

} 