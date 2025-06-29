import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';

import { EpicHeaderComponent } from './components/epic-header/epic-header.component';
import { KanbanColumnComponent } from './components/kanban-column/kanban-column.component';
import { EpicMetricsComponent } from './components/epic-metrics/epic-metrics.component';

import { TaskService, Task } from '../../core/services/task';
import { EpicKanbanService } from './services/epic-kanban.service';
import { EpicBoard } from './models/epic-board.model';

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
export class EpicKanbanComponent implements OnInit {
  
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private taskService = inject(TaskService);
  private epicKanbanService = inject(EpicKanbanService);

  // Signals
  epicBoard = signal<EpicBoard | null>(null);
  isLoading = signal(true);
  error = signal<string | null>(null);
  
  // Current epic ID
  epicId = signal<string | null>(null);

  ngOnInit(): void {
    this.loadEpicFromRoute();
  }

  private loadEpicFromRoute(): void {
    this.route.params.subscribe(params => {
      const id = params['id'];
      if (id) {
        this.epicId.set(id);
        this.loadEpicBoard(id);
      } else {
        this.error.set('Aucun ID d\'épic fourni');
        this.isLoading.set(false);
      }
    });
  }

  private async loadEpicBoard(epicId: string): Promise<void> {
    try {
      this.isLoading.set(true);
      this.error.set(null);
      
      const board = await this.epicKanbanService.loadEpicBoard(epicId);
      this.epicBoard.set(board);
      
    } catch (error) {
      console.error('Erreur lors du chargement de l\'épic board:', error);
      this.error.set('Erreur lors du chargement de l\'épic');
    } finally {
      this.isLoading.set(false);
    }
  }

  onNavigateBack(): void {
    this.router.navigate(['/dashboard']);
  }

  onRefreshBoard(): void {
    const currentEpicId = this.epicId();
    if (currentEpicId) {
      this.loadEpicBoard(currentEpicId);
    }
  }

  getFeaturesByStatus(status: string): Task[] {
    const board = this.epicBoard();
    if (!board) return [];
    
    return this.epicKanbanService.getFeaturesByStatus(status, board.features);
  }

  trackColumn(index: number, column: any): string {
    return column.id;
  }
} 