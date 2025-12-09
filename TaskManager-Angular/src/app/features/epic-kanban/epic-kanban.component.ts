import { Component, OnInit, OnDestroy, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatButtonModule } from '@angular/material/button';

import { Store } from '@ngrx/store';
import { takeUntil, Subject } from 'rxjs';
import { take } from 'rxjs/operators';

import { Task } from '../../core/services/task';
type TaskStatus = Task['status'];
import { TaskService } from '../../core/services/task';
import { KanbanColumn } from './models/epic-board.model';
import * as ProjectSelectors from '../projects/store/project.selectors';
import { EpicKanbanActions } from './store/epic-kanban.actions';
import * as EpicKanbanSelectors from './store/epic-kanban.selectors';

import { ItemHeaderComponent } from '../../shared/components/item-header/item-header.component';

import { ItemMetricsComponent } from '../../shared/components/item-metrics/item-metrics.component';
import { SearchFiltersComponent } from './components/search-filters/search-filters.component';

import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';

import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { ISubtask } from '../tasks/subtask.model';
import { KanbanItem } from './models/kanban-item.model';
import { GenericKanbanComponent } from '../../shared/components/generic-kanban/generic-kanban.component';

@Component({
  selector: 'app-epic-kanban',
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
    ItemMetricsComponent,
    SearchFiltersComponent,
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
  currentEpic$ = this.store.select(EpicKanbanSelectors.selectCurrentEpic);
  currentEpicItem = this.store.selectSignal(EpicKanbanSelectors.selectCurrentEpicAsKanbanItem);
  columns$ = this.store.select(EpicKanbanSelectors.selectColumns);
  features$ = this.store.select(EpicKanbanSelectors.selectAllFeatures);
  featuresAsKanbanItems$ = this.store.select(EpicKanbanSelectors.selectFilteredFeaturesAsKanbanItems);
  tasks$ = this.store.select(EpicKanbanSelectors.selectAllTasks);
  metrics$ = this.store.select(EpicKanbanSelectors.selectMetrics);
  loading$ = this.store.select(EpicKanbanSelectors.selectLoading);
  error$ = this.store.select(EpicKanbanSelectors.selectError);
  expandedFeatures$ = this.store.select(EpicKanbanSelectors.selectExpandedFeatures);

  // Nouveaux sélecteurs pour les projets
  selectedProjectId$ = this.store.select(ProjectSelectors.selectSelectedProjectId);

  // Local state for template
  expandedFeaturesSet = new Set<string>();
  featureTasksMap: { [featureId: string]: (Task | ISubtask)[] } = {};

  // Current epic ID
  epicId: string | null = null;

  // T021 - Highlighted subtasks par feature
  highlightedSubtasksByFeature: { [featureId: string]: string[] } = {};

  // Permissions
  get canEditEpic(): boolean {
    // TODO: Implémenter la logique de permissions réelle
    return true; // Pour l'instant, autoriser l'édition
  }

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

  onNavigateToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  onRefreshBoard(): void {
    if (this.epicId) {
      this.store.dispatch(EpicKanbanActions.loadEpicBoard({ epicId: this.epicId }));
    }
  }

  // Événements des features
  onFeatureMove(event: { item: KanbanItem, newStatus: string }): void {
    if (!event.item || !event.item.status) return;

    this.store.dispatch(EpicKanbanActions.moveFeature({
      featureId: event.item.id as string,
      fromColumnId: event.item.status,
      toColumnId: event.newStatus,
      newStatus: event.newStatus as TaskStatus,
    }));
    console.log('🔄 Feature moved:', event);
  }

  onFeatureExpand(featureId: string): void {
    this.store.dispatch(EpicKanbanActions.toggleFeatureExpansion({ featureId }));
  }

  onFeatureEdit(item: KanbanItem): void {
    this.router.navigate(['/tasks', item.id, 'edit']);
  }

  onFeatureDelete(item: KanbanItem): void {
    // TODO: Implémenter la suppression avec confirmation
  }

  // Événements des tâches
  onTaskStatusChange(event: { task: Task | ISubtask; newStatus: TaskStatus }): void {
    this.store.dispatch(EpicKanbanActions.updateTaskStatus({
      taskId: event.task.id!,
      newStatus: event.newStatus
    }));
  }

  onTaskClick(task: Task | ISubtask): void {
    this.router.navigate(['/tasks', task.id, 'edit']);
  }

  // Événements de l'item header
  onItemUpdate(item: Partial<KanbanItem>): void {
    this.store.dispatch(EpicKanbanActions.updateEpic({ epic: item as Partial<Task> }));
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
      (tasks || []).forEach((task: Task) => {
        if (task.parent_task_id) {
          if (!this.featureTasksMap[task.parent_task_id]) {
            this.featureTasksMap[task.parent_task_id] = [];
          }
          this.featureTasksMap[task.parent_task_id].push(task);
        }
      });
    });

    // T021 - Sous-tâches qui matchent les filtres par feature
    // this.store.select(EpicKanbanSelectors.selectMatchingSubtasksByFeature).pipe(
    //   takeUntil(this.destroy$)
    // ).subscribe(highlighted => {
    //   this.highlightedSubtasksByFeature = highlighted;
    // });
  }

  getFeatureTasksMap(): { [featureId: string]: (Task | ISubtask)[] } {
    return this.featureTasksMap;
  }

  onFeatureClick(item: KanbanItem): void {
    this.router.navigate(['/tasks', item.id, 'edit']);
  }

  // === ACTIONS ITEM HEADER (T007) ===

  onEditItem(item: KanbanItem): void {
    // Navigation vers le formulaire d'édition de l'epic
    this.router.navigate(['/tasks', item.id, 'edit']);
  }

  onSaveItem(itemData: Partial<KanbanItem>): void {
    // Dispatch action pour sauvegarder l'epic
    this.store.dispatch(EpicKanbanActions.updateEpic({
      epic: itemData as Partial<Task>
    }));

    // Notification de succès
    this.snackBar.open('Epic mis à jour avec succès', 'Fermer', {
      duration: 3000,
      horizontalPosition: 'right',
      verticalPosition: 'top'
    });
  }

  onDeleteItem(item: KanbanItem): void {
    // Ouvrir dialog de confirmation
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: `Supprimer l'item`,
        message: `Êtes-vous sûr de vouloir supprimer l'item "${item.title}" ?\nCette action est irréversible.`
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && item.id) {
        // Utiliser TaskService pour supprimer l'epic
        this.taskService.deleteTask(item.id as string).then(
          (success: boolean) => {
            if (success) {
              // Navigation vers le dashboard après suppression
              this.router.navigate(['/dashboard']);

              this.snackBar.open('Epic supprimé avec succès', 'Fermer', {
                duration: 3000,
                horizontalPosition: 'right',
                verticalPosition: 'top'
              });
            }
          }
        ).catch((error: any) => {
          console.error('Erreur lors de la suppression:', error);
          this.snackBar.open('Erreur lors de la suppression de l\'epic', 'Fermer', {
            duration: 5000,
            horizontalPosition: 'right',
            verticalPosition: 'top'
          });
        });
      }
    });
  }

  onExportBoard(): void {
    // Export du tableau en format JSON
    this.currentEpic$.pipe(takeUntil(this.destroy$)).subscribe(epic => {
      if (!epic) return;

      const exportData = {
        epic: epic,
        exportDate: new Date().toISOString(),
        features: [], // TODO: Récupérer les features depuis le store
        tasks: []     // TODO: Récupérer les tasks depuis le store
      };

      // Création et téléchargement du fichier
      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `epic-${epic.task_number || epic.id}-kanban-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      this.snackBar.open('Tableau exporté avec succès', 'Fermer', {
        duration: 3000,
        horizontalPosition: 'right',
        verticalPosition: 'top'
      });
    });
  }

  onShareBoard(): void {
    // Création d'un lien de partage (URL actuelle)
    const shareUrl = window.location.href;

    // Utiliser l'API Web Share si disponible
    if (navigator.share) {
      navigator.share({
        title: 'Epic Kanban Board',
        text: 'Consultez ce tableau Kanban Epic',
        url: shareUrl,
      }).then(() => {
        this.snackBar.open('Lien partagé avec succès', 'Fermer', {
          duration: 3000,
          horizontalPosition: 'right',
          verticalPosition: 'top'
        });
      }).catch(err => {
        console.log('Erreur lors du partage:', err);
        this.fallbackCopyToClipboard(shareUrl);
      });
    } else {
      // Fallback: copier dans le presse-papier
      this.fallbackCopyToClipboard(shareUrl);
    }
  }

  private fallbackCopyToClipboard(text: string): void {
    // Méthode de secours pour copier dans le presse-papier
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        this.snackBar.open('Lien copié dans le presse-papier', 'Fermer', {
          duration: 3000,
          horizontalPosition: 'right',
          verticalPosition: 'top'
        });
      }).catch(() => {
        this.showShareUrlDialog(text);
      });
    } else {
      this.showShareUrlDialog(text);
    }
  }

  private showShareUrlDialog(url: string): void {
    // Afficher une boîte de dialogue avec l'URL à copier manuellement
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '500px',
      data: {
        title: 'Partager le tableau',
        message: `Copiez ce lien pour partager le tableau :\n\n${url}`,
        confirmText: 'Fermer',
        hideCancel: true
      }
    });
  }

  // === DRAG & DROP METHODS (T015) ===

  getConnectedDropLists(currentColumnStatus: string): string[] {
    // Retourne la liste des IDs des autres colonnes (toutes sauf la courante)
    const allColumns = ['column-pending', 'column-in_progress', 'column-review', 'column-completed'];
    return allColumns.filter(columnId => columnId !== `column-${currentColumnStatus}`);
  }

  onFeatureDrop(event: CdkDragDrop<KanbanItem[]>): void {
    if (event.previousContainer === event.container) {
      // moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      const item = event.item.data;
      const newStatus = (event.container.id.split('-').pop() || 'pending') as TaskStatus;

      this.store.dispatch(EpicKanbanActions.moveFeature({
        featureId: item.id as string,
        fromColumnId: event.previousContainer.id,
        toColumnId: event.container.id,
        newStatus
      }));
    }
  }

  private getStatusFromColumnId(columnId: string): TaskStatus {
    // La logique ici peut être simple ou complexe.
    // Pour l'instant, on fait un mapping direct.
    // ex: "cdk-drop-list-pending" -> "pending"
    return (columnId.split('-').pop() || 'pending') as TaskStatus;
  }

  private getColumnDisplayName(status: TaskStatus): string {
    const columns = this.store.selectSignal(EpicKanbanSelectors.selectColumns)();
    const column = columns.find(c => c.statusValue === status);
    return column ? column.title : status;
  }

  // === INJECTION DE DÉPENDANCES ===
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private taskService = inject(TaskService);

  // T018 - Handle task priority change
  onTaskPriorityChange(event: { task: Task | ISubtask, newPriority: string }): void {
    const { task, newPriority } = event;
    if (task && task.id) {
      const updatedTask = {
        ...(task as any),
        priority: newPriority as Task['priority'],
        id: task.id,
      };
      this.store.dispatch(EpicKanbanActions.updateTask({ task: updatedTask }));
    }
  }

  // T018 - Handle task edit - Navigate to task edit or open modal
  onTaskEdit(task: Task | ISubtask): void {
    // TODO: ouvrir le dialog d'édition de la tâche
  }

  // T018 - Handle task delete
  onTaskDelete(taskId: string): void {
    this.tasks$.pipe(take(1)).subscribe((tasks: Task[]) => {
      const task = tasks.find(t => t.id === taskId);
      const dialogRef = this.dialog.open(ConfirmDialogComponent, {
        width: '400px',
        data: {
          title: 'Supprimer la tâche',
          message: `Êtes-vous sûr de vouloir supprimer la tâche "${task?.title}" ?`
        }
      });

      dialogRef.afterClosed().subscribe(result => {
        if (result) {
          this.store.dispatch(EpicKanbanActions.deleteTask({ taskId }));
        }
      });
    });
  }

  retryLoad(): void {
    if (this.epicId) {
      this.store.dispatch(EpicKanbanActions.loadEpicBoard({ epicId: this.epicId }));
    }
  }

  onAddTaskToFeature(feature: Task): void {
    // TODO: Implémenter la logique de création de tâche, probablement via un dialogue
  }

}
