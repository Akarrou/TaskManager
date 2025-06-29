import { Component, inject, OnInit, ChangeDetectorRef, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTreeModule } from '@angular/material/tree';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { TaskService, Task } from '../../../core/services/task';
import { ISubtask } from '../subtask.model';
import { CdkDropList, CdkDrag, CdkDragDrop, moveItemInArray, DragDropModule } from '@angular/cdk/drag-drop';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

interface TaskTreeNode {
  id: string;
  title: string;
  slug: string;
  type: 'epic' | 'feature' | 'task';
  status: 'pending' | 'in_progress' | 'review' | 'completed' | 'cancelled';
  estimated_hours?: number;
  task_number?: number;
  children?: TaskTreeNode[];
  parent_task_id?: string | null;
  subtasks?: ISubtask[];
}

@Component({
  selector: 'app-task-tree',
  standalone: true,
  imports: [CommonModule, MatTreeModule, MatIconModule, DragDropModule],
  templateUrl: './task-tree.component.html',
  styleUrls: ['./task-tree.component.scss']
})
export class TaskTreeComponent implements OnInit, OnChanges {
  private taskService = inject(TaskService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private dialog = inject(MatDialog);

  @Input() tasks: Task[] = [];

  treeData: TaskTreeNode[] = [];
  loading = true;
  error: string | null = null;

  async ngOnInit() {
    await this.initTree();
  }

  async initTree() {
    this.loading = true;
    this.cdr.detectChanges();
    
    try {
      let tasksToUse: Task[];
      
      // Utiliser en priorité les tâches passées en input
      if (this.tasks && this.tasks.length >= 0) { // Accepter même un tableau vide
        tasksToUse = this.tasks;
      } else {
        // Fallback : charger depuis le service
        await this.taskService.loadTasks();
        tasksToUse = this.taskService.tasks();
      }
      
      this.treeData = this.buildTaskTree(tasksToUse);
      
    } catch (e) {
      console.error('TaskTree: Erreur lors du chargement:', e);
      this.error = 'Erreur lors du chargement des tâches.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    // Reconstruire l'arbre quand les tâches changent
    if (changes['tasks']) {
      this.initTree();
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
        status: task.status,
        estimated_hours: task.estimated_hours,
        task_number: task.task_number,
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

  getStatusIcon(status: string): string {
    switch (status) {
      case 'completed': return 'check_circle';
      case 'in_progress': return 'hourglass_empty';
      case 'review': return 'rate_review';
      case 'pending': return 'radio_button_unchecked';
      case 'cancelled': return 'cancel';
      default: return 'help_outline';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'completed': return 'Terminé';
      case 'in_progress': return 'En cours';
      case 'review': return 'En révision';
      case 'pending': return 'En attente';
      case 'cancelled': return 'Annulé';
      default: return 'Inconnu';
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

  onEpicKanban(node: TaskTreeNode) {
    // Naviguer vers la vue Epic Kanban
    this.router.navigate(['/epic', node.id, 'kanban']);
  }

  // Drag & drop
  async drop(event: CdkDragDrop<TaskTreeNode[]>, parentNode: TaskTreeNode | null = null) {
    console.log('DROP EVENT', event, parentNode); // DEBUG
    const dragged = event.item.data;
    const newParent = parentNode;
    console.log('dragged:', dragged, 'newParent:', newParent, 'parentNode:', parentNode); // DEBUG

    if (dragged.type === 'task' && newParent && newParent.type === 'feature') {
      await this.taskService.updateTask(dragged.id, { parent_task_id: newParent.id });
      await this.initTree();
      return;
    }

    alert('Déplacement non autorisé (seules les tâches peuvent être déplacées sous une feature)');
  }

  onDeleteNode(node: TaskTreeNode) {
    // 1. Vérification métier
    if (node.type === 'epic' && node.children && node.children.some(child => child.type === 'feature')) {
      // Epic avec features → suppression interdite
      this.dialog.open(ConfirmDialogComponent, {
        data: {
          title: 'Suppression impossible',
          message: `Impossible de supprimer l'épopée "${node.title}" car elle contient des features. Supprime d'abord les features associées.`
        } as ConfirmDialogData
      });
      return;
    }
    if (node.type === 'feature' && node.children && node.children.some(child => child.type === 'task')) {
      // Feature avec tasks → suppression interdite
      this.dialog.open(ConfirmDialogComponent, {
        data: {
          title: 'Suppression impossible',
          message: `Impossible de supprimer la feature "${node.title}" car elle contient des tâches. Supprime d'abord les tâches associées.`
        } as ConfirmDialogData
      });
      return;
    }

    // 2. Confirmation classique
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Confirmation',
        message: `Voulez-vous vraiment supprimer "${node.title}" ?`
      } as ConfirmDialogData
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.taskService.deleteTask(node.id).then(() => {
          this.initTree(); // Rafraîchir l'arbre après suppression
        });
      }
    });
  }

  canDeleteNode(node: TaskTreeNode): boolean {
    if (node.type === 'epic' && node.children && node.children.some(child => child.type === 'feature')) {
      return false;
    }
    if (node.type === 'feature' && node.children && node.children.some(child => child.type === 'task')) {
      return false;
    }
    return true;
  }

  getConnectedDropLists(nodes: TaskTreeNode[]): string[] {
    if (!nodes) return [];
    let ids: string[] = [];
    for (const node of nodes) {
      ids.push('dropList-' + node.id);
      if (node.children && node.children.length > 0) {
        ids = ids.concat(this.getConnectedDropLists(node.children));
      }
    }
    return ids;
  }

  getAllDropListIds(nodes: TaskTreeNode[] = this.treeData): string[] {
    let ids: string[] = [];
    for (const node of nodes) {
      ids.push('dropList-' + node.id);
      if (node.children && node.children.length > 0) {
        ids = ids.concat(this.getAllDropListIds(node.children));
      }
    }
    return ids;
  }

  findNodeById(nodes: TaskTreeNode[], id: string): TaskTreeNode | null {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = this.findNodeById(node.children, id);
        if (found) return found;
      }
    }
    return null;
  }

  getSiblingDropListIds(node: TaskTreeNode): string[] {
    if (!node.parent_task_id) return [];
    const parent = this.findNodeById(this.treeData, node.parent_task_id);
    if (!parent || !parent.children) return [];
    return parent.children
      .filter(child => child.id !== node.id)
      .map(child => 'dropList-' + child.id);
  }
} 