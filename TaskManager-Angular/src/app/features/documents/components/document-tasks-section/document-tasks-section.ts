import { Component, input, signal, computed, inject, effect, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject, takeUntil } from 'rxjs';
import { CdkDragDrop, CdkDrag, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';

// Import view-toggle component
import { ViewToggleComponent, ViewMode } from '../../../../shared/components/view-toggle/view-toggle.component';

// Import view components (reuse from dashboard)
import { KanbanBoardComponent } from '../../../../shared/components/kanban-board/kanban-board.component';
import { CalendarViewComponent } from '../../../../shared/components/calendar-view/calendar-view.component';
import { TimelineViewComponent } from '../../../../shared/components/timeline-view/timeline-view.component';

// Import services and models
import { DocumentService } from '../../services/document.service';
import { Task } from '../../../../core/services/task';

@Component({
  selector: 'app-document-tasks-section',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    CdkDropList,
    CdkDrag,
    ViewToggleComponent,
    KanbanBoardComponent,
    CalendarViewComponent,
    TimelineViewComponent,
  ],
  templateUrl: './document-tasks-section.html',
  styleUrl: './document-tasks-section.scss',
})
export class DocumentTasksSectionComponent implements OnDestroy {
  private documentService = inject(DocumentService);
  private router = inject(Router);
  private destroy$ = new Subject<void>();

  // Input: document ID
  documentId = input.required<string>();

  // State signals
  tasks = signal<Task[]>([]);
  isLoading = signal(false);
  currentView = signal<ViewMode>('table');
  kanbanGroupBy = signal<'status' | 'priority'>('status');

  // Computed signals for view filtering
  filteredTasks = computed(() => this.tasks());

  // Effect to load tasks when document ID changes
  constructor() {
    effect(() => {
      const docId = this.documentId();
      if (docId) {
        this.loadTasks(docId);
      }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadTasks(documentId: string) {
    this.isLoading.set(true);
    this.documentService.getFullTasksForDocument(documentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (tasks) => {
          this.tasks.set(tasks);
          this.isLoading.set(false);
        },
        error: (err) => {
          console.error('Error loading tasks for document:', err);
          this.isLoading.set(false);
        }
      });
  }

  onViewChange(view: ViewMode) {
    this.currentView.set(view);
  }

  onKanbanGroupByChange(groupBy: 'status' | 'priority') {
    this.kanbanGroupBy.set(groupBy);
  }

  onTaskEdit(task: Task) {
    if (task.id) {
      this.router.navigate(['/tasks', task.id]);
    }
  }

  onTaskDelete(taskId: string) {
    // TODO: Implement task deletion
  }

  onTaskDeleteFromTable(task: Task) {
    // For table view, we receive the full task object
    if (task.id) {
      this.onTaskDelete(task.id);
    }
  }

  onTaskCreate() {
    // Navigate to task creation with return URL
    const docId = this.documentId();
    this.router.navigate(['/tasks/new'], {
      queryParams: {
        returnTo: `/documents/${docId}`,
        createFromDocument: docId,
      },
    });
  }

  onTaskDrop(event: CdkDragDrop<Task[]>) {
    const tasksCopy = [...this.tasks()];
    moveItemInArray(tasksCopy, event.previousIndex, event.currentIndex);
    this.tasks.set(tasksCopy);

    // Update positions in database
    this.updateTaskPositions(tasksCopy);
  }

  private updateTaskPositions(tasks: Task[]) {
    const docId = this.documentId();
    if (!docId) return;

    // Update each task's position in the document_task_relations table
    tasks.forEach((task, index) => {
      if (task.id) {
        this.documentService.updateTaskPosition(docId, task.id, index).subscribe({
          error: (err) => console.error(`Error updating position for task ${task.id}:`, err)
        });
      }
    });
  }
}
