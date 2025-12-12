import { Component, OnInit, OnDestroy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Store } from '@ngrx/store';
import { SupabaseService } from '../../core/services/supabase';
import { Task } from '../../core/services/task';
import { TaskDatabaseService, TaskEntry } from '../../core/services/task-database.service';
import { DatabaseService } from '../documents/services/database.service';
import { CellValue } from '../documents/models/database.model';
import { SearchFilters, TaskSearchComponent } from '../../shared/components/task-search/task-search.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { UserService } from '../../core/services/user.service';
import * as ProjectSelectors from '../projects/store/project.selectors';
import { ViewToggleComponent, ViewMode } from '../../shared/components/view-toggle/view-toggle.component';
import { KanbanBoardComponent, KanbanGroupBy } from '../../shared/components/kanban-board/kanban-board.component';
import { CalendarViewComponent } from '../../shared/components/calendar-view/calendar-view.component';
import { TimelineViewComponent } from '../../shared/components/timeline-view/timeline-view.component';
import { FabStore } from '../../core/stores/fab.store';
import { DashboardStatsStore } from '../../core/stores/dashboard-stats.store';

@Component({
  selector: 'app-tasks-dashboard',
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
export class TasksDashboardComponent implements OnInit, OnDestroy {
  private supabaseService = inject(SupabaseService);
  taskDatabaseService = inject(TaskDatabaseService); // Public for template access
  private databaseService = inject(DatabaseService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private userService = inject(UserService);
  private store = inject(Store);
  private fabStore = inject(FabStore);
  private dashboardStatsStore = inject(DashboardStatsStore);
  private pageId = crypto.randomUUID();

  supabaseStatus = signal<'connecting' | 'connected' | 'error'>('connecting');
  statusMessage = signal('Connexion en cours...');

  // Database-based task entries
  taskEntries = signal<TaskEntry[]>([]);
  totalCount = signal<number>(0);
  loading = signal<boolean>(false);
  taskError = signal<string | null>(null);

  // Project store selectors
  selectedProjectId$ = this.store.select(ProjectSelectors.selectSelectedProjectId);
  selectedProject$ = this.store.select(ProjectSelectors.selectSelectedProject);

  // Current selected project ID signal
  selectedProjectId = signal<string | null>(null);

  // Epics for selected project
  epicsForSelectedProject = computed(() => {
    const allEntries = this.taskEntries();
    const selectedProjectId = this.selectedProjectId();

    // Filter epics that belong to the selected project
    if (!selectedProjectId) return [];

    return allEntries.filter(entry =>
      entry.type === 'epic' &&
      entry.project_id === selectedProjectId
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
    const allEntries = this.taskEntries();
    const filters = this.currentSearchFilters();
    let filtered = allEntries;

    if (filters.searchText) {
      const search = filters.searchText.toLowerCase();
      filtered = filtered.filter(entry =>
        entry.title.toLowerCase().includes(search) ||
        (entry.description && entry.description.toLowerCase().includes(search)) ||
        (entry.databaseName && entry.databaseName.toLowerCase().includes(search))
      );
    }

    if (filters.status) {
      filtered = filtered.filter(entry => entry.status === filters.status);
    }
    if (filters.priority) {
      filtered = filtered.filter(entry => entry.priority === filters.priority);
    }
    if (filters.type) {
      filtered = filtered.filter(entry => entry.type === filters.type);
    }
    if (filters.tag && typeof filters.tag === 'string' && filters.tag.trim()) {
      filtered = filtered.filter(entry => entry.tags && entry.tags.some((tag: string) => tag.toLowerCase().includes(filters.tag!.toLowerCase())));
    }

    // Handle hierarchy for epics/features
    if (filters.type === 'epic' || filters.type === 'feature') {
      const descendants = new Set<string>();
      const collectDescendants = (entry: TaskEntry) => {
        descendants.add(entry.id);
        for (const child of allEntries) {
          if (child.parent_task_id === entry.id) {
            collectDescendants(child);
          }
        }
      };

      for (const root of filtered) {
        collectDescendants(root);
      }
      return allEntries.filter((e: TaskEntry) => descendants.has(e.id));
    }

    return filtered;
  });

  // Computed signal for legacy Task[] to maintain compatibility with view components
  legacyTasks = computed(() => {
    return this.filteredTasks().map(entry =>
      this.taskDatabaseService.convertEntryToLegacyTask(entry)
    );
  });

  stats = computed(() => {
    const taskStats = this.dashboardStatsStore.taskStats();
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
    // Enregistrer la configuration FAB
    this.fabStore.registerPage(
      {
        context: { currentPage: 'tasks-dashboard' },
        actions: []
      },
      this.pageId
    );

    await this.loadUsers();
    await this.loadTaskEntries();

    // Charger les stats des tâches depuis la BDD (via RPC)
    this.dashboardStatsStore.loadTaskStats({ projectId: undefined });

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

  private loadTaskEntries(): void {
    this.loading.set(true);
    this.taskDatabaseService.getAllTaskEntries({
      limit: 1000,
      offset: 0
    }).subscribe({
      next: (result) => {
        this.taskEntries.set(result.entries);
        this.totalCount.set(result.totalCount);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error loading task entries:', err);
        this.taskError.set('Failed to load tasks from databases');
        this.loading.set(false);
      }
    });
  }

  ngOnDestroy() {
    this.fabStore.unregisterPage(this.pageId);
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
    const entries = this.filteredTasks();
    return this.taskDatabaseService.getTaskStats(entries);
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
    // No longer needed with database-based tasks
    console.log('Sample data creation not supported for database-based tasks');
  }

  async refreshData() {
    this.loadTaskEntries();
  }

  async debugTasks() {
  }

  navigateToNewTaskForm() {
    // Redirect to documents for creating new task database
    this.router.navigate(['/documents']);
  }

  navigateToEditTaskForm(task: Task) {
    // For database-based tasks, navigate to the linked document
    // This requires fetching the document linked to the database row
    console.log('Edit task:', task);
    // TODO: Implement document navigation for database row editing
  }

  navigateToEpicKanban(epic: Task) {
    if (epic.id) {
      this.router.navigate(['/epic', epic.id, 'kanban']);
    }
  }

  async deleteTask(id: string): Promise<void> {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        message: 'Êtes-vous sûr de vouloir supprimer cette tâche ?\nCette action est irréversible.'
      }
    });

    try {
      const result = await firstValueFrom(dialogRef.afterClosed());
      if (result) {
        // Find the task entry to get database information
        const taskEntry = this.taskEntries().find(e => e.id === id);
        if (taskEntry) {
          // Delete the database row
          this.databaseService.deleteRows({
            databaseId: taskEntry.databaseId,
            rowIds: [id]
          }).subscribe({
            next: () => {
              // Reload task entries after deletion
              this.loadTaskEntries();
              // Rafraîchir les stats des tâches
              this.dashboardStatsStore.loadTaskStats({});
            },
            error: (err) => {
              console.error('Failed to delete task:', err);
              this.taskError.set('Failed to delete task');
            }
          });
        }
      }
    } catch (error) {
      console.error('Error in delete dialog:', error);
    }
  }

  onSearchFiltersChange(filters: SearchFilters) {
    this.currentSearchFilters.set(filters);
    localStorage.setItem('dashboardFilters', JSON.stringify(filters));
    // Filtering is now handled automatically by the computed 'filteredTasks'
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

    // Find the corresponding TaskEntry
    const taskEntry = this.taskEntries().find(e => e.id === task.id);
    if (!taskEntry) {
      console.error('Task entry not found for id:', task.id);
      return;
    }

    // Get database metadata to find column IDs
    const dbMetadata = await firstValueFrom(
      this.taskDatabaseService.getDatabaseMetadata(taskEntry.databaseId)
    );

    const updates: Record<string, CellValue> = {};

    // Find Status and Priority columns by name
    const statusColumn = dbMetadata.config.columns.find(col => col.name === 'Status');
    const priorityColumn = dbMetadata.config.columns.find(col => col.name === 'Priority');

    if (newStatus && statusColumn) {
      updates[statusColumn.id] = newStatus;
    }
    if (newPriority && priorityColumn) {
      updates[priorityColumn.id] = newPriority;
    }

    // Update database row
    this.databaseService.updateRow(taskEntry.databaseId, task.id, updates).subscribe({
      next: () => {
        // Reload task entries to reflect changes
        this.loadTaskEntries();
        // Rafraîchir les stats des tâches
        this.dashboardStatsStore.loadTaskStats({});
      },
      error: (err) => {
        console.error('Failed to update task:', err);
        this.taskError.set('Failed to update task');
        // Reload to revert optimistic update
        this.loadTaskEntries();
      }
    });
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
    const tasks = this.legacyTasks();
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
    const tasks = this.legacyTasks();
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
    return this.legacyTasks();
  }

  // TrackBy function for epic cards performance optimization
  trackEpic(index: number, epic: Task): string {
    return epic.id || index.toString();
  }
}
