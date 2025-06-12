import { Component, inject, OnInit, ChangeDetectorRef, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTreeModule } from '@angular/material/tree';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { TaskService, Task } from '../../../core/services/task';
import { ISubtask } from '../subtask.model';
import { CdkDropList, CdkDrag, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';

interface TaskTreeNode {
  id: string;
  title: string;
  slug: string;
  type: 'epic' | 'feature' | 'task';
  estimated_hours?: number;
  children?: TaskTreeNode[];
  parent_task_id?: string | null;
  subtasks?: ISubtask[];
}

@Component({
  selector: 'app-task-tree',
  standalone: true,
  imports: [CommonModule, MatTreeModule, MatIconModule, CdkDropList, CdkDrag],
  templateUrl: './task-tree.component.html',
  styleUrls: ['./task-tree.component.scss']
})
export class TaskTreeComponent implements OnInit, OnChanges {
  private taskService = inject(TaskService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  @Input() tasks: Task[] | null = null;

  treeData: TaskTreeNode[] = [];
  loading = true;
  error: string | null = null;

  async ngOnInit() {
    if (!this.tasks) {
      this.loading = true;
      this.cdr.detectChanges();
      try {
        await this.taskService.loadTasks();
        const tasks = this.taskService.tasks();
        this.treeData = this.buildTaskTree(tasks);
        this.cdr.detectChanges();
      } catch (e) {
        this.error = 'Erreur lors du chargement des tâches.';
        this.cdr.detectChanges();
      } finally {
        this.loading = false;
        this.cdr.detectChanges();
      }
    } else {
      this.treeData = this.buildTaskTree(this.tasks);
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['tasks'] && this.tasks) {
      this.treeData = this.buildTaskTree(this.tasks);
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  buildTaskTree(tasks: Task[]): TaskTreeNode[] {
    const nodeMap = new Map<string, TaskTreeNode>();
    const roots: TaskTreeNode[] = [];
    const filteredIds = new Set(tasks.map(t => t.id));

    // Création des nœuds
    for (const task of tasks) {
      nodeMap.set(task.id!, {
        id: task.id!,
        title: task.title,
        slug: task.slug,
        type: task.type,
        estimated_hours: task.estimated_hours,
        parent_task_id: task.parent_task_id ?? null,
        children: [],
        subtasks: task.subtasks ?? []
      });
    }
    // Construction de l'arbre (uniquement si le parent est aussi dans le filtre)
    for (const node of nodeMap.values()) {
      if (
        node.parent_task_id &&
        nodeMap.has(node.parent_task_id) &&
        filteredIds.has(node.parent_task_id)
      ) {
        nodeMap.get(node.parent_task_id)!.children!.push(node);
      } else if (!node.parent_task_id || !filteredIds.has(node.parent_task_id)) {
        roots.push(node);
      }
    }
    return roots;
  }

  getTypeIcon(type: string): string {
    switch (type) {
      case 'epic': return 'star';
      case 'feature': return 'extension';
      case 'task': return 'check_box';
      default: return 'help_outline';
    }
  }

  onNodeClick(node: TaskTreeNode) {
    // Naviguer vers la page d'édition de la tâche
    this.router.navigate(['/tasks', node.id, 'edit']);
  }

  onAddChild(node: TaskTreeNode, type: 'feature' | 'task') {
    // Naviguer vers le formulaire de création avec type et parent_task_id en query params
    this.router.navigate(['/tasks/new'], {
      queryParams: {
        type,
        parent_task_id: node.id
      }
    });
  }

  // Drag & drop
  drop(event: CdkDragDrop<TaskTreeNode[]>, parentNode: TaskTreeNode | null = null) {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      // Vérification métier :
      const dragged = event.previousContainer.data[event.previousIndex];
      const newParent = parentNode;
      if (!this.isValidMove(dragged, newParent)) {
        alert('Déplacement non autorisé (règle métier)');
        return;
      }
      // Mettre à jour le parent_task_id
      this.taskService.updateTask(dragged.id, { parent_task_id: newParent ? newParent.id : null }).then(() => {
        this.ngOnInit(); // Rafraîchir l'arbre
      });
    }
  }

  isValidMove(dragged: TaskTreeNode, newParent: TaskTreeNode | null): boolean {
    if (!newParent) return dragged.type === 'epic'; // Seul un epic peut être à la racine
    if (dragged.type === 'feature' && newParent.type === 'epic') return true;
    if (dragged.type === 'task' && newParent.type === 'feature') return true;
    return false;
  }
} 