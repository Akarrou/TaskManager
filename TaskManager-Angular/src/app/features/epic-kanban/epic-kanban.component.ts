import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Store } from '@ngrx/store';
import { Subject, takeUntil } from 'rxjs';

import { EpicHeaderComponent } from './components/epic-header/epic-header.component';
import { KanbanColumnComponent } from './components/kanban-column/kanban-column.component';
import { EpicMetricsComponent } from './components/epic-metrics/epic-metrics.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';

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
    MatDialogModule,
    MatSnackBarModule,
    EpicHeaderComponent,
    KanbanColumnComponent,
    EpicMetricsComponent,
    ConfirmDialogComponent
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
        message: `Êtes-vous sûr de vouloir supprimer l'epic "${epic.title}" ? Cette action est irréversible.`,
        confirmText: 'Supprimer',
        cancelText: 'Annuler',
        confirmColor: 'warn'
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

  // === INJECTION DE DÉPENDANCES ===
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private taskService = inject(TaskService);

} 