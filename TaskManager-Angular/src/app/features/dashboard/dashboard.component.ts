import { Component, OnInit, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card'; // Kept from HEAD just in case, though unused in incoming template
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Store } from '@ngrx/store';
import { SupabaseService } from '../../core/services/supabase';
import { TaskService, Task } from '../../core/services/task';
import { SearchFilters } from '../../shared/components/task-search/task-search.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { UserService } from '../../core/services/user.service';
import * as ProjectSelectors from '../projects/store/project.selectors';
import { TaskSearchComponent } from '../../shared/components/task-search/task-search.component';
import { ViewToggleComponent, ViewMode } from '../../shared/components/view-toggle/view-toggle.component';
import { KanbanBoardComponent, KanbanGroupBy } from '../../shared/components/kanban-board/kanban-board.component';
import { CalendarViewComponent } from '../../shared/components/calendar-view/calendar-view.component';
import { TimelineViewComponent } from '../../shared/components/timeline-view/timeline-view.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatDialogModule,
    MatSelectModule,
    MatButtonModule,
    MatCardModule,
    TaskSearchComponent,
    ViewToggleComponent,
    KanbanBoardComponent,
    CalendarViewComponent,
    TimelineViewComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  private supabaseService = inject(SupabaseService);
  private taskService = inject(TaskService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private userService = inject(UserService);
  private store = inject(Store);

  supabaseStatus = signal<'connecting' | 'connected' | 'error'>('connecting');
  statusMessage = signal('Connexion en cours...');

  tasks = this.taskService.tasks;
  loading = this.taskService.loading;
  taskError = this.taskService.error;

  // Project store selectors
  selectedProjectId$ = this.store.select(ProjectSelectors.selectSelectedProjectId);
  selectedProject$ = this.store.select(ProjectSelectors.selectSelectedProject);

  // Current selected project ID signal
  selectedProjectId = signal<string | null>(null);

  // Epics for selected project
  epicsForSelectedProject = computed(() => {
    const allTasks = this.tasks();
    const selectedProjectId = this.selectedProjectId();
    
    // Filter epics that belong to the selected project
    if (!selectedProjectId) return [];
    
    return allTasks.filter(task => 
      task.type === 'epic' && 
      task.project_id === selectedProjectId
    );
  });

  users = signal<{ id: string; email: string }[]>([]);

  // View mode state
  currentView = signal<ViewMode>('table');
  kanbanGroupBy = signal<KanbanGroupBy>('status');

  currentSearchFilters = signal<SearchFilters>({
    searchText: '',
    status: '',
    priority: '',
    environment: '',
    type: '',
    prd_slug: '',
    tag: ''
  });

  filteredTasks = computed(() => {
    const allTasks = this.tasks();
    const filters = this.currentSearchFilters();
    return allTasks
      .filter(task => {
        const searchTextMatch = filters.searchText
          ? task.title.toLowerCase().includes(filters.searchText.toLowerCase()) ||
            (task.description && task.description.toLowerCase().includes(filters.searchText.toLowerCase()))
          : true;
        const statusMatch = filters.status ? task.status === filters.status : true;
        const priorityMatch = filters.priority ? task.priority === filters.priority : true;
        const envMatch = filters.environment ? (Array.isArray(task.environment) && task.environment.includes(filters.environment)) : true;
        
        // Also apply type filter if present (missing in incoming but present in HEAD logic)
        const typeMatch = filters.type ? task.type === filters.type : true;

        return searchTextMatch && statusMatch && priorityMatch && envMatch && typeMatch;
      });
  });

  stats = computed(() => {
    const taskStats = this.getTaskStats();
    return [
      { title: 'Tâches totales', value: taskStats.total, icon: 'list_alt', iconClass: 'c-stat-card__icon--total' },
      { title: 'En cours', value: taskStats.inProgress, icon: 'hourglass_top', iconClass: 'c-stat-card__icon--in-progress' },
      { title: 'Terminées', value: taskStats.completed, icon: 'check_circle', iconClass: 'c-stat-card__icon--completed' },
      { title: 'À faire', value: taskStats.pending, icon: 'pending_actions', iconClass: 'c-stat-card__icon--todo' }
    ];
  });

  constructor() {
    effect(() => {
    });
  }

  async ngOnInit() {
    await this.loadUsers();

    // Subscribe to selected project ID changes
    this.selectedProjectId$.subscribe(projectId => {
      this.selectedProjectId.set(projectId);
    });

    // Lecture des filtres depuis localStorage au démarrage
    const savedFilters = localStorage.getItem('dashboardFilters');
    if (savedFilters) {
      try {
        const parsed = JSON.parse(savedFilters);
        this.currentSearchFilters.set(parsed);
      } catch (e) { /* Ignorer si parsing échoue */ }
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
    await this.taskService.loadTasks();
  }

  async debugTasks() {
  }

  navigateToNewTaskForm() {
    this.router.navigate(['/tasks/new']);
  }

  navigateToEditTaskForm(task: Task) {
    if (task.id) {
      this.router.navigate(['/tasks', task.id, 'edit']);
    }
  }

  navigateToEpicKanban(epic: Task) {
    if (epic.id) {
      this.router.navigate(['/epic', epic.id, 'kanban']);
    }
  }

  async deleteTask(id: string): Promise<void> {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
        message: 'Êtes-vous sûr de vouloir supprimer cette tâche ?\nCette action est irréversible.'
      }
    });

    try {
      const result = await firstValueFrom(dialogRef.afterClosed());
      if (result) {
        const success = await this.taskService.deleteTask(id);
        if (success) {
          // Optionally show a success snackbar
        } else {
          // Optionally show an error snackbar
        }
      }
    } catch (error) {
      // Optionally show an error snackbar
    }
  }

  onSearchFiltersChange(filters: SearchFilters) {
    this.currentSearchFilters.set(filters);
    localStorage.setItem('dashboardFilters', JSON.stringify(filters));
    this.applyFilters(this.tasks(), filters);
  }

  private applyFilters(tasks: Task[], filters: SearchFilters) {
    let filtered = tasks;

    if (filters.searchText) {
      const search = filters.searchText.toLowerCase();
      filtered = filtered.filter(task =>
        task.title.toLowerCase().includes(search) ||
        (task.slug && task.slug.toLowerCase().includes(search)) ||
        (task.prd_slug && task.prd_slug.toLowerCase().includes(search)) ||
        (task.task_number && task.task_number.toString().includes(search))
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

    if (filters.prd_slug && typeof filters.prd_slug === 'string' && filters.prd_slug.trim()) {
      filtered = filtered.filter(task => task.prd_slug && task.prd_slug.toLowerCase().includes(filters.prd_slug!.toLowerCase()));
    }

    if (filters.tag && typeof filters.tag === 'string' && filters.tag.trim()) {
      filtered = filtered.filter(task => task.tags && task.tags.some(tag => tag.toLowerCase().includes(filters.tag!.toLowerCase())));
    }

    if (filters.type === 'epic' || filters.type === 'feature') {
      const descendants = new Set<string>();
      function collectDescendants(task: Task) {
        descendants.add(task.id!);
        for (const child of tasks) {
          if (child.parent_task_id === task.id) {
            collectDescendants(child);
          }
        }
      }
      for (const root of filtered) {
        collectDescendants(root);
      }
      filtered = tasks.filter(t => descendants.has(t.id!));
    }

    this.filteredTasks.set(filtered);
  }

  onViewChange(view: ViewMode) {
    this.currentView.set(view);
  }

  onKanbanGroupByChange(groupBy: KanbanGroupBy) {
    this.kanbanGroupBy.set(groupBy);
  }

  async onTaskMoved(event: { task: Task; newStatus?: string; newPriority?: string }) {
    const { task, newStatus, newPriority } = event;
    if (!task.id) return;

    const updates: Partial<Task> = {};
    if (newStatus) {
      updates.status = newStatus as Task['status'];
    }
    if (newPriority) {
      updates.priority = newPriority as Task['priority'];
    }

    const success = await this.taskService.updateTask(task.id, updates);
    if (!success) {
      console.error('Erreur lors de la mise à jour de la tâche');
      // Reload tasks to revert the optimistic update
      await this.taskService.loadTasks();
    }
  }

  onTaskEdit(task: Task) {
    this.navigateToEditTaskForm(task);
  }

  onTaskDelete(taskId: string) {
    this.deleteTask(taskId);
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

  getFilteredTreeTasks(): Task[] {
    return this.filteredTasks();
  }

  // TrackBy function for epic cards performance optimization
  trackEpic(index: number, epic: Task): string {
    return epic.id || index.toString();
  }
}
