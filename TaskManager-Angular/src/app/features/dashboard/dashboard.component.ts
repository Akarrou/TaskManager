import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SupabaseService } from '../../core/services/supabase';
import { TaskService, Task } from '../../core/services/task';
import { SearchFilters } from '../../shared/components/task-search/task-search.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { UserService } from '../../core/services/user.service';
import { TaskSearchComponent } from '../../shared/components/task-search/task-search.component';
import { TaskTreeComponent } from '../tasks/task-tree/task-tree.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatDialogModule,TaskSearchComponent, TaskTreeComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  private supabaseService = inject(SupabaseService);
  private taskService = inject(TaskService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private userService = inject(UserService);
  
  supabaseStatus = signal<'connecting' | 'connected' | 'error'>('connecting');
  statusMessage = signal('Connexion en cours...');

  tasks = this.taskService.tasks;
  loading = this.taskService.loading;
  taskError = this.taskService.error;

  users = signal<{ id: string; email: string }[]>([]);

  currentSearchFilters = signal<SearchFilters>({
    searchText: '',
    status: '',
    priority: '',
    environment: ''
  });

  filteredTasks = signal<Task[]>([]);

  stats = computed(() => {
    const taskStats = this.getTaskStats();
    return [
      { title: 'Tâches totales', value: taskStats.total, icon: 'list_alt', iconClass: 'c-stat-card__icon--total' },
      { title: 'En cours', value: taskStats.inProgress, icon: 'hourglass_top', iconClass: 'c-stat-card__icon--in-progress' },
      { title: 'Terminées', value: taskStats.completed, icon: 'check_circle', iconClass: 'c-stat-card__icon--completed' },
      { title: 'À faire', value: taskStats.pending, icon: 'pending_actions', iconClass: 'c-stat-card__icon--todo' }
    ];
  });

  async ngOnInit() {
    await this.checkSupabaseConnection();
    await this.loadUsers();
    // Lecture des filtres depuis localStorage (après chargement des tâches)
    const savedFilters = localStorage.getItem('dashboardFilters');
    if (savedFilters) {
      try {
        const parsed = JSON.parse(savedFilters);
        this.currentSearchFilters.set(parsed);
        this.onSearchFiltersChange(parsed);
      } catch (e) {
        // Si parsing échoue, ignorer
      }
    }
  }

  private async checkSupabaseConnection() {
    this.statusMessage.set('Vérification de la connexion Supabase...');
    try {
      await this.taskService.loadTasks();
      this.supabaseStatus.set('connected');
      this.statusMessage.set('Connecté à Supabase.');
    } catch (error: any) {
      this.supabaseStatus.set('error');
      this.statusMessage.set(`Erreur de connexion: ${error.message || 'Vérifiez la console'}`);
    }
  }

  private async loadUsers() {
    const users = await this.userService.getUsers();
    this.users.set(users);
  }

  getAssigneeEmail(userId: string | undefined): string {
    if (!userId) return '';
    const user = this.users().find(u => u.id === userId);
    return user ? user.email : '';
  }

  getTaskStats() {
    return this.taskService.getStats();
  }

  getStatusIcon(): string {
    switch (this.supabaseStatus()) {
      case 'connected': return 'cloud_done';
      case 'connecting': return 'cloud_queue';
      case 'error': return 'cloud_off';
      default: return 'help_outline';
    }
  }

  getStatusClass(): string {
    switch (this.supabaseStatus()) {
      case 'connected': return 'status-connected';
      case 'connecting': return 'status-connecting';
      case 'error': return 'status-error';
      default: return '';
    }
  }

  getTaskStatusIcon(status: string): string {
    switch (status) {
      case 'pending': return 'hourglass_empty';
      case 'in_progress': return 'sync';
      case 'completed': return 'check_circle_outline';
      case 'cancelled': return 'cancel';
      default: return 'help_outline';
    }
  }

  async createSampleData() {
    await this.taskService.createSampleTasks();
  }

  async refreshData() {
    this.statusMessage.set('Rafraîchissement des données...');
    this.supabaseStatus.set('connecting');
    await this.checkSupabaseConnection();
  }

  async debugTasks() {
    console.log('--- Debugging Tasks ---');
    console.log('Current Tasks Signal:', this.tasks());
    console.log('Loading State:', this.loading());
    console.log('Error State:', this.taskError());
    console.log('Supabase Status:', this.supabaseStatus());
    console.log('Stats:', this.getTaskStats());
    console.log('Filtered Tasks:', this.filteredTasks());
  }

  navigateToNewTaskForm() {
    this.router.navigate(['/tasks/new']);
  }

  navigateToEditTaskForm(task: Task) {
    if (task.id) {
      this.router.navigate(['/tasks', task.id, 'edit']);
    }
  }

  async deleteTask(id: string): Promise<void> {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: { 
        title: 'Confirmation de suppression de tâches', 
        message: 'Êtes-vous sûr de vouloir supprimer cette tâche ?\\nCette action est irréversible.'
      }
    });

    try {
      const result = await firstValueFrom(dialogRef.afterClosed());
      if (result) {
        const success = await this.taskService.deleteTask(id);
        if (success) {
          console.log(`Tâche ${id} supprimée.`);
        } else {
          console.error(`Erreur lors de la suppression de la tâche ${id}.`);
        }
      }
    } catch (error) {
      console.error('Error closing dialog:', error);
    }
  }

  onSearchFiltersChange(filters: SearchFilters) {
    // Sauvegarde dans localStorage
    localStorage.setItem('dashboardFilters', JSON.stringify(filters));
    const allTasks = this.tasks();
    let filtered = allTasks;
    if (filters.searchText) {
      const search = filters.searchText.toLowerCase();
      filtered = filtered.filter(task =>
        task.title.toLowerCase().includes(search) ||
        (task.slug && task.slug.toLowerCase().includes(search)) ||
        (task.prd_slug && task.prd_slug.toLowerCase().includes(search))
      );
    }
    if (filters.status) {
      filtered = filtered.filter(task => task.status === filters.status);
    }
    if (filters.priority) {
      filtered = filtered.filter(task => task.priority === filters.priority);
    }
    if (filters.environment) {
      filtered = filtered.filter(task => task.environment && task.environment.includes(filters.environment));
    }
    if (filters.type) {
      filtered = filtered.filter(task => task.type === filters.type);
    }
    if (filters.prd_slug && typeof filters.prd_slug === 'string') {
      filtered = filtered.filter(task => task.prd_slug && task.prd_slug.toLowerCase().includes(filters.prd_slug!.toLowerCase()));
    }
    if (filters.tag && typeof filters.tag === 'string') {
      filtered = filtered.filter(task => task.tags && task.tags.some(tag => tag.toLowerCase().includes(filters.tag!.toLowerCase())));
    }

    if (filters.type === 'epic' || filters.type === 'feature') {
      const descendants = new Set<string>();
      function collectDescendants(task: Task) {
        descendants.add(task.id!);
        for (const child of allTasks) {
          if (child.parent_task_id === task.id) {
            collectDescendants(child);
          }
        }
      }
      for (const root of filtered) {
        collectDescendants(root);
      }
      filtered = allTasks.filter(t => descendants.has(t.id!));
    }

    this.filteredTasks.set(filtered);
  }

  getStatusLabel(status: string): string {
    const statusMap: { [key: string]: string } = {
      pending: 'En attente',
      in_progress: 'En cours',
      completed: 'Terminée',
      cancelled: 'Annulée'
    };
    return statusMap[status] || status;
  }

  getPriorityLabel(priority: string): string {
    const priorityMap: { [key: string]: string } = {
      low: 'Faible',
      medium: 'Moyenne',
      high: 'Élevée',
      urgent: 'Urgente'
    };
    return priorityMap[priority] || priority;
  }

  // --- Export roadmap amélioré ---
  private buildTaskTree(tasks: Task[]): any[] {
    const nodeMap = new Map<string, any>();
    const roots: any[] = [];
    for (const task of tasks) {
      nodeMap.set(task.id!, { ...task, children: [] });
    }
    for (const node of nodeMap.values()) {
      if (node.parent_task_id && nodeMap.has(node.parent_task_id)) {
        nodeMap.get(node.parent_task_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  exportRoadmapMarkdown() {
    const tasks = this.filteredTasks();
    if (!tasks.length) {
      this.downloadFile('# Roadmap (aucune tâche filtrée)\n', 'roadmap.md', 'text/markdown');
      return;
    }
    const tree = this.buildTaskTree(tasks);
    let md = '# Roadmap filtrée\n\n';
    const renderNode = (node: any, level = 1) => {
      const indent = '  '.repeat(level - 1);
      const typeEmoji = node.type === 'epic' ? '⭐' : node.type === 'feature' ? '🔧' : '✅';
      md += `${indent}${'#'.repeat(level)} ${typeEmoji} ${node.title}  `;
      if (node.slug) md += `\`[${node.slug}]\``;
      if (node.prd_slug) md += `  _(PRD: ${node.prd_slug})_`;
      if (node.guideline_refs && node.guideline_refs.length)
        md += `  _[Guidelines: ${node.guideline_refs.join(', ')}]_`;
      if (node.estimated_hours) md += `  ⏱️${node.estimated_hours}h`;
      md += '\n';
      if (node.children && node.children.length) {
        for (const child of node.children) renderNode(child, level + 1);
      }
    };
    for (const root of tree) renderNode(root);
    this.downloadFile(md, 'roadmap.md', 'text/markdown');
  }

  exportRoadmapJson() {
    const tasks = this.filteredTasks();
    if (!tasks.length) {
      this.downloadFile(JSON.stringify({ message: 'Aucune tâche filtrée.' }, null, 2), 'roadmap.json', 'application/json');
      return;
    }
    const tree = this.buildTaskTree(tasks);
    const json = JSON.stringify(tree, null, 2);
    this.downloadFile(json, 'roadmap.json', 'application/json');
  }

  private downloadFile(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  /**
   * Retourne la liste des racines à afficher dans l'arborescence :
   * - Si aucun filtre sur type, retourne l'arbre complet filtré
   * - Si filtre sur epic ou feature, retourne le sous-arbre complet pour chaque tâche filtrée
   */
  getFilteredTreeTasks(): Task[] {
    const allTasks = this.tasks();
    const filtered = this.filteredTasks();
    if (!filtered.length) return [];
    // Si filtre sur type epic ou feature, on veut afficher le sous-arbre complet pour chaque racine filtrée
    if (this.currentSearchFilters().type === 'epic' || this.currentSearchFilters().type === 'feature') {
      // Pour chaque tâche filtrée, récupérer tous ses descendants
      const descendants = new Set<string>();
      const idToTask = new Map(allTasks.map(t => [t.id, t]));
      function collectDescendants(task: Task) {
        descendants.add(task.id!);
        for (const child of allTasks) {
          if (child.parent_task_id === task.id) {
            collectDescendants(child);
          }
        }
      }
      for (const root of filtered) {
        collectDescendants(root);
      }
      // Retourner toutes les tâches concernées (racines + descendants)
      return allTasks.filter(t => descendants.has(t.id!));
    }
    // Sinon, comportement par défaut : on affiche la liste filtrée
    return filtered;
  }
}
