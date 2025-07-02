import { Component, OnInit, OnDestroy, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';

import { Store } from '@ngrx/store';
import {  takeUntil, Subject } from 'rxjs';
import { takeUntil as takeUntilOperator } from 'rxjs/operators';

import { Task } from '../../core/services/task';
import { TaskService } from '../../core/services/task';
import { KanbanColumn } from './models/epic-board.model';
import { EpicKanbanActions } from './store/epic-kanban.actions';
import * as EpicKanbanSelectors from './store/epic-kanban.selectors';

import { EpicHeaderComponent } from './components/epic-header/epic-header.component';
import { KanbanColumnComponent } from './components/kanban-column/kanban-column.component';
import { EpicMetricsComponent } from './components/epic-metrics/epic-metrics.component';
import { SearchFiltersComponent } from './components/search-filters/search-filters.component';

import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';

import { CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { ISubtask } from '../tasks/subtask.model';

@Component({
  selector: 'app-epic-kanban',
  standalone: true,
  imports: [
    CommonModule,
    MatProgressBarModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatDialogModule,
    MatSnackBarModule,

    EpicHeaderComponent,
    KanbanColumnComponent,
    EpicMetricsComponent,
    SearchFiltersComponent
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
  columns$ = this.store.select(EpicKanbanSelectors.selectColumns);
  features$ = this.store.select(EpicKanbanSelectors.selectFeatures);
  tasks$ = this.store.select(EpicKanbanSelectors.selectTasks);
  featuresByColumn$ = this.store.select(EpicKanbanSelectors.selectFeaturesByColumn);
  metrics$ = this.store.select(EpicKanbanSelectors.selectMetrics);
  loading$ = this.store.select(EpicKanbanSelectors.selectLoading);
  error$ = this.store.select(EpicKanbanSelectors.selectError);
  expandedFeatures$ = this.store.select(EpicKanbanSelectors.selectExpandedFeatures);
  filteredFeaturesCount = this.store.selectSignal(EpicKanbanSelectors.selectFilteredFeaturesCount);

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
  onTaskStatusChange(event: { task: Task | ISubtask; newStatus: string }): void {
    this.store.dispatch(EpicKanbanActions.updateTaskStatus({ 
      taskId: event.task.id!,
      newStatus: event.newStatus
    }));
  }

  onTaskClick(task: Task | ISubtask): void {
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
      tasks.forEach((task: Task) => {
        if (task.parent_task_id) {
          if (!this.featureTasksMap[task.parent_task_id]) {
            this.featureTasksMap[task.parent_task_id] = [];
          }
          this.featureTasksMap[task.parent_task_id].push(task);
        }
      });
    });

    // T021 - Sous-tâches qui matchent les filtres par feature
    this.store.select(EpicKanbanSelectors.selectMatchingSubtasksByFeature).pipe(
      takeUntil(this.destroy$)
    ).subscribe(highlighted => {
      this.highlightedSubtasksByFeature = highlighted;
    });
  }

  getFeatureTasksMap(): { [featureId: string]: (Task | ISubtask)[] } {
    return this.featureTasksMap;
  }

  onFeatureClick(feature: Task): void {
    this.router.navigate(['/tasks', feature.id, 'edit']);
  }

  // === ACTIONS EPIC HEADER (T007) ===

  onEditEpic(epic: Task): void {
    // Navigation vers le formulaire d'édition de l'epic
    this.router.navigate(['/tasks', epic.id, 'edit']);
  }

  onSaveEpic(epicData: Partial<Task>): void {
    // Dispatch action pour sauvegarder l'epic
    this.store.dispatch(EpicKanbanActions.updateEpic({ 
      epic: epicData 
    }));
    
    // Notification de succès
    this.snackBar.open('Epic mis à jour avec succès', 'Fermer', {
      duration: 3000,
      horizontalPosition: 'right',
      verticalPosition: 'top'
    });
  }

  onDeleteEpic(epic: Task): void {
    // Ouvrir dialog de confirmation
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Supprimer l\'epic',
        message: `Êtes-vous sûr de vouloir supprimer l'epic "${epic.title}" ?\nCette action est irréversible.`
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && epic.id) {
        // Utiliser TaskService pour supprimer l'epic
        this.taskService.deleteTask(epic.id).then(
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

  onFeatureDrop(event: CdkDragDrop<Task[]>): void {
    if (event.previousContainer === event.container) {
      // Réorganisation dans la même colonne
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      // Déplacement entre colonnes différentes
      const feature = event.previousContainer.data[event.previousIndex];
      const newStatus = this.getStatusFromColumnId(event.container.id);
      
      // Transfer de l'item
      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex
      );

      // Dispatch action pour mettre à jour le statut
      this.store.dispatch(EpicKanbanActions.moveFeature({
        featureId: feature.id!,
        fromColumnId: event.previousContainer.id,
        toColumnId: event.container.id,
        newStatus: newStatus
      }));

      // Notification de succès
      this.snackBar.open(
        `Feature "${feature.title}" déplacée vers "${this.getColumnDisplayName(newStatus)}"`,
        'Fermer',
        { duration: 3000 }
      );
    }
  }

  private getStatusFromColumnId(columnId: string): string {
    // Extrait le statut depuis l'ID de la colonne (ex: 'column-in_progress' -> 'in_progress')
    return columnId.replace('column-', '');
  }

  private getColumnDisplayName(status: string): string {
    switch (status) {
      case 'pending': return 'À faire';
      case 'in_progress': return 'En cours';
      case 'review': return 'Review';
      case 'completed': return 'Terminé';
      case 'cancelled': return 'Annulé';
      default: return status;
    }
  }

  // === INJECTION DE DÉPENDANCES ===
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private taskService = inject(TaskService);

  // T018 - Handle task priority change
  onTaskPriorityChange(event: { task: Task | ISubtask, newPriority: string }): void {
    console.log('🔄 Changement de priorité task:', event.task.id, 'Nouvelle priorité:', event.newPriority);
    
    this.store.dispatch(EpicKanbanActions.updateTask({ 
      task: { 
        ...(event.task as Task), 
        priority: event.newPriority as 'low' | 'medium' | 'high' | 'urgent'
      } 
    }));
  }

  // T018 - Handle task edit - Navigate to task edit or open modal
  onTaskEdit(task: Task | ISubtask): void {
    console.log('✏️ Édition task:', task.id);
    
    // Option 1: Navigation vers page d'édition
    // this.router.navigate(['/tasks', task.id, 'edit']);
    
    // Option 2: Modal d'édition (à implémenter plus tard)
    // this.openTaskEditModal(task);
    
    // Pour l'instant, on log seulement
    console.log('Task edit modal à implémenter:', task);
  }

  // T018 - Handle task delete
  onTaskDelete(taskId: string): void {
    console.log('🗑️ Suppression task:', taskId);
    
    // Confirmation avant suppression
    const taskToDelete = this.featureTasksMap[this.epicId!].find(t => t.id === taskId);
    const confirmed = confirm(`Êtes-vous sûr de vouloir supprimer la tâche "${taskToDelete?.title}" ?`);
    
    if (confirmed) {
      this.store.dispatch(EpicKanbanActions.deleteTask({ taskId }));
    }
  }

  retryLoad(): void {
    if (this.epicId) {
      this.store.dispatch(EpicKanbanActions.loadEpicBoard({ epicId: this.epicId }));
    }
  }

  onAddTaskToFeature(feature: Task): void {
    console.log('Add task to feature:', feature);
    // TODO: Ouvrir le dialog de création de tâche avec parent_id = feature.id
    // Temporairement, on peut naviguer vers le formulaire de création de tâche
    this.router.navigate(['/tasks/new'], { 
      queryParams: { 
        parent_id: feature.id,
        epic_id: this.route.snapshot.paramMap.get('id')
      }
    });
  }

}