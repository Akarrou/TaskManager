import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../core/services/supabase';
import { TaskService, Task } from '../../core/services/task';
import { TaskFormComponent } from '../tasks/task-form/task-form.component';
import { FilterBarComponent, FilterOptions } from '../../shared/components/filter-bar/filter-bar.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, TaskFormComponent, FilterBarComponent],
  template: `
    <div class="dashboard-container">
      <header class="dashboard-header">
        <h1>🌱 AgroFlow Task Manager</h1>
      </header>
      
      <main class="dashboard-content">
        <div class="welcome-card">
          <!-- Section des statistiques des tâches -->
          <div class="task-stats-section" *ngIf="supabaseStatus() === 'connected'">
            <h3>📊 Statistiques des tâches</h3>
            
            <div class="stats-loading" *ngIf="loading()">
              <p>🔄 Chargement des données...</p>
            </div>

            <div class="stats-error" *ngIf="taskError()">
              <p>❌ Erreur: {{ taskError() }}</p>
            </div>

            <div class="stats-grid" *ngIf="!loading() && !taskError()">
              <div class="stat-card">
                <div class="stat-value">{{ getTaskStats().total }}</div>
                <div class="stat-label">Total</div>
              </div>
              <div class="stat-card completed">
                <div class="stat-value">{{ getTaskStats().completed }}</div>
                <div class="stat-label">Terminées</div>
              </div>
              <div class="stat-card pending">
                <div class="stat-value">{{ getTaskStats().pending }}</div>
                <div class="stat-label">En attente</div>
              </div>
              <div class="stat-card progress">
                <div class="stat-value">{{ getTaskStats().inProgress }}</div>
                <div class="stat-label">En cours</div>
              </div>
              <div class="stat-card rate">
                <div class="stat-value">{{ getTaskStats().completionRate }}%</div>
                <div class="stat-label">Taux de réussite</div>
              </div>
            </div>

            <div class="recent-tasks" *ngIf="tasks().length > 0">
              <h4>📝 Dernières tâches</h4>
              <div class="task-list">
                <div class="task-item" *ngFor="let task of tasks().slice(0, 3)">
                  <span class="task-status" [ngClass]="'status-' + task.status">
                    {{ getTaskStatusIcon(task.status) }}
                  </span>
                  <span class="task-title">{{ task.title }}</span>
                  <span class="task-priority" [ngClass]="'priority-' + task.priority">
                    {{ task.priority }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Liste complète des tâches -->
            <div class="tasks-management" *ngIf="!loading() && !taskError()">
              <div class="section-header">
                <h4>📋 Gestion des tâches</h4>
                <button 
                  class="new-task-btn" 
                  (click)="openNewTaskForm()"
                  aria-label="Créer une nouvelle tâche">
                  ➕ Nouvelle tâche
                </button>
              </div>

              <!-- Barre de filtres -->
              <app-filter-bar 
                (filtersChange)="onFiltersChange($event)"
                *ngIf="tasks().length > 0">
              </app-filter-bar>

              <div class="tasks-grid" *ngIf="filteredTasks().length > 0">
                <div class="task-card" *ngFor="let task of filteredTasks()" [ngClass]="'priority-' + task.priority">
                  <div class="task-header">
                    <span class="task-status-icon">{{ getTaskStatusIcon(task.status) }}</span>
                    <h5 class="task-title">{{ task.title }}</h5>
                    <div class="task-actions" role="group" [attr.aria-label]="'Actions pour la tâche ' + task.title">
                      <button 
                        class="edit-btn" 
                        (click)="editTask(task)" 
                        [attr.aria-label]="'Modifier la tâche ' + task.title"
                        title="Modifier">✏️</button>
                      <button 
                        class="delete-btn" 
                        (click)="deleteTask(task.id!)" 
                        [attr.aria-label]="'Supprimer la tâche ' + task.title"
                        title="Supprimer">🗑️</button>
                    </div>
                  </div>
                  
                  <p class="task-description" *ngIf="task.description">{{ task.description }}</p>
                  
                  <div class="task-meta">
                    <span class="task-priority">{{ task.priority }}</span>
  
                    <span class="task-due-date" *ngIf="task.due_date">📅 {{ task.due_date }}</span>
                  </div>

                  <div class="task-tags" *ngIf="task.tags && task.tags.length > 0">
                    <span class="tag" *ngFor="let tag of task.tags">#{{ tag }}</span>
                  </div>
                </div>
              </div>

              <!-- État vide global -->
              <div class="empty-state" *ngIf="tasks().length === 0">
                <p>📝 Aucune tâche trouvée</p>
                <button class="demo-button" (click)="createSampleData()">
                  🌱 Créer des données de test
                </button>
              </div>

              <!-- État vide après filtrage -->
              <div class="empty-state filtered" *ngIf="tasks().length > 0 && filteredTasks().length === 0">
                <p>🔍 Aucune tâche ne correspond aux filtres</p>
                <p class="empty-state-subtitle">Essayez de modifier vos critères de recherche</p>
              </div>
            </div>

            <div class="demo-actions" *ngIf="!loading() && !taskError() && tasks().length > 0">
              <h4>🧪 Actions de démonstration</h4>
              <div class="action-buttons">
                <button 
                  class="demo-button" 
                  (click)="createSampleData()"
                  [disabled]="loading()">
                  <span *ngIf="!loading()">🌱 Ajouter plus de données</span>
                  <span *ngIf="loading()">⏳ Création en cours...</span>
                </button>
                <button 
                  class="demo-button refresh" 
                  (click)="refreshData()"
                  [disabled]="loading()">
                  🔄 Actualiser les données
                </button>
                <button 
                  class="demo-button" 
                  (click)="debugTasks()">
                  🔍 Debug Tâches
                </button>
              </div>
            </div>
          </div>
          
          <div class="status-info">
            <p><strong>Status :</strong> ✅ Application fonctionnelle</p>
            <p><strong>Base de données :</strong> 
              <span [ngClass]="getStatusClass()">
                {{ getStatusIcon() }} {{ statusMessage() }}
              </span>
            </p>
            <p><strong>Prochaine étape :</strong> 📝 Développement des fonctionnalités avancées</p>
          </div>
        </div>

        <!-- Modal de formulaire de tâche -->
        <div 
          class="modal-overlay" 
          *ngIf="showTaskForm()" 
          (click)="closeTaskForm()"
          role="dialog"
          aria-modal="true"
          aria-labelledby="task-form-title"
          (keydown.escape)="closeTaskForm()">
          <div class="modal-content" (click)="$event.stopPropagation()">
            <app-task-form 
              [task]="editingTask()"
              (onSave)="handleTaskSave()"
              (onCancel)="closeTaskForm()">
            </app-task-form>
          </div>
        </div>
      </main>
    </div>
  `,
  styles: [`
    .dashboard-container {
      min-height: 100vh;
      background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
      padding: 2rem;
      font-family: 'Inter', system-ui, sans-serif;
    }
    
    .dashboard-header {
      text-align: center;
      margin-bottom: 3rem;
    }
    
    .dashboard-header h1 {
      font-size: 3rem;
      background: linear-gradient(135deg, #2563eb 0%, #16a34a 100%);
      background-clip: text;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 0.5rem;
      font-weight: 700;
    }
    
    .dashboard-header p {
      color: #64748b;
      font-size: 1.25rem;
    }
    
    .dashboard-content {
      max-width: 1200px;
      margin: 0 auto;
    }
    
    .welcome-card {
      background: white;
      border-radius: 1rem;
      padding: 3rem;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
      border: 1px solid rgba(226, 232, 240, 0.8);
    }
    
    .welcome-card h2 {
      font-size: 2.5rem;
      color: #1e293b;
      margin-bottom: 1rem;
      text-align: center;
    }
    
    .welcome-card > p {
      font-size: 1.25rem;
      color: #64748b;
      text-align: center;
      margin-bottom: 3rem;
    }
    
    .features-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 2rem;
      margin-bottom: 3rem;
    }
    
    .feature-card {
      background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
      padding: 2rem;
      border-radius: 0.75rem;
      border-left: 4px solid #3b82f6;
    }
    
    .feature-card h3 {
      color: #1e293b;
      margin-bottom: 1rem;
      font-size: 1.5rem;
    }
    
    .feature-card ul {
      list-style: none;
      padding: 0;
    }
    
    .feature-card li {
      color: #475569;
      margin-bottom: 0.5rem;
      padding-left: 1.5rem;
      position: relative;
    }
    
    .feature-card li::before {
      content: '✓';
      position: absolute;
      left: 0;
      color: #16a34a;
      font-weight: bold;
    }
    
    .status-info {
      background: linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%);
      padding: 2rem;
      border-radius: 0.75rem;
      border-left: 4px solid #16a34a;
    }
    
    .status-info p {
      margin-bottom: 0.75rem;
      color: #166534;
      font-size: 1.125rem;
    }
    
         .status-info p:last-child {
       margin-bottom: 0;
     }

     .status-connecting {
       color: #f59e0b;
       animation: pulse 2s infinite;
     }

     .status-connected {
       color: #16a34a;
       font-weight: 600;
     }

     .status-error {
       color: #dc2626;
       font-weight: 600;
     }

     @keyframes pulse {
       0%, 100% { opacity: 1; }
       50% { opacity: 0.5; }
     }

     .task-stats-section {
       margin-top: 3rem;
       padding: 2rem;
       background: linear-gradient(135deg, #fefce8 0%, #fef3c7 100%);
       border-radius: 0.75rem;
       border-left: 4px solid #f59e0b;
     }

     .task-stats-section h3 {
       color: #92400e;
       margin-bottom: 1.5rem;
       font-size: 1.5rem;
     }

     .stats-loading, .stats-error {
       text-align: center;
       padding: 2rem;
       color: #6b7280;
       font-style: italic;
     }

     .stats-grid {
       display: grid;
       grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
       gap: 1rem;
       margin-bottom: 2rem;
     }

     .stat-card {
       background: white;
       padding: 1.5rem;
       border-radius: 0.5rem;
       text-align: center;
       box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
       border-top: 3px solid #e5e7eb;
       transition: transform 0.2s;
     }

     .stat-card:hover {
       transform: translateY(-2px);
     }

     .stat-card.completed { border-top-color: #16a34a; }
     .stat-card.pending { border-top-color: #f59e0b; }
     .stat-card.progress { border-top-color: #3b82f6; }
     .stat-card.rate { border-top-color: #8b5cf6; }

     .stat-value {
       font-size: 2rem;
       font-weight: 700;
       color: #1f2937;
       margin-bottom: 0.25rem;
     }

     .stat-label {
       font-size: 0.875rem;
       color: #6b7280;
       text-transform: uppercase;
       letter-spacing: 0.05em;
     }

     .recent-tasks h4 {
       color: #92400e;
       margin-bottom: 1rem;
       font-size: 1.25rem;
     }

     .task-list {
       display: flex;
       flex-direction: column;
       gap: 0.75rem;
     }

     .task-item {
       display: flex;
       align-items: center;
       gap: 1rem;
       padding: 1rem;
       background: white;
       border-radius: 0.5rem;
       box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
     }

     .task-status {
       font-size: 1.25rem;
       min-width: 2rem;
     }

     .task-title {
       flex: 1;
       font-weight: 500;
       color: #1f2937;
     }

     .task-priority {
       padding: 0.25rem 0.75rem;
       border-radius: 9999px;
       font-size: 0.75rem;
       font-weight: 600;
       text-transform: uppercase;
     }

     .priority-low { background: #dcfce7; color: #166534; }
     .priority-medium { background: #fef3c7; color: #92400e; }
     .priority-high { background: #fed7d7; color: #c53030; }
     .priority-urgent { background: #fecaca; color: #991b1b; }

     .demo-actions {
       margin-top: 2rem;
       padding: 2rem;
       background: linear-gradient(135deg, #ede9fe 0%, #e0e7ff 100%);
       border-radius: 0.75rem;
       border-left: 4px solid #8b5cf6;
     }

     .demo-actions h4 {
       color: #5b21b6;
       margin-bottom: 1rem;
       font-size: 1.25rem;
     }

     .action-buttons {
       display: flex;
       gap: 1rem;
       margin-bottom: 1rem;
       flex-wrap: wrap;
     }

     .demo-button {
       padding: 0.75rem 1.5rem;
       background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
       color: white;
       border: none;
       border-radius: 0.5rem;
       font-weight: 600;
       cursor: pointer;
       transition: all 0.2s;
       min-width: 180px;
     }

     .demo-button:hover:not(:disabled) {
       transform: translateY(-2px);
       box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
     }

     .demo-button:disabled {
       opacity: 0.6;
       cursor: not-allowed;
       transform: none;
     }

     .demo-button.refresh {
       background: linear-gradient(135deg, #059669 0%, #047857 100%);
     }

     .demo-button.refresh:hover:not(:disabled) {
       box-shadow: 0 4px 12px rgba(5, 150, 105, 0.3);
     }

     .demo-note {
       font-size: 0.875rem;
       color: #6b21a8;
       font-style: italic;
       margin: 0;
     }

     /* Styles pour la gestion des tâches */
     .tasks-management {
       margin-top: 3rem;
       padding: 2rem;
       background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
       border-radius: 0.75rem;
       border-left: 4px solid #0ea5e9;
     }

     .section-header {
       display: flex;
       justify-content: space-between;
       align-items: center;
       margin-bottom: 2rem;
     }

     .section-header h4 {
       color: #0c4a6e;
       margin: 0;
       font-size: 1.5rem;
     }

     .new-task-btn {
       padding: 0.75rem 1.5rem;
       background: linear-gradient(135deg, #059669 0%, #047857 100%);
       color: white;
       border: none;
       border-radius: 0.5rem;
       font-weight: 600;
       cursor: pointer;
       transition: all 0.2s;
     }

     .new-task-btn:hover {
       transform: translateY(-2px);
       box-shadow: 0 4px 12px rgba(5, 150, 105, 0.3);
     }

     .tasks-grid {
       display: grid;
       grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
       gap: 1.5rem;
     }

     .task-card {
       background: white;
       border-radius: 0.75rem;
       padding: 1.5rem;
       box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
       border-top: 4px solid #e5e7eb;
       transition: all 0.2s;
     }

     .task-card:hover {
       transform: translateY(-2px);
       box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
     }

     .task-card.priority-low { border-top-color: #22c55e; }
     .task-card.priority-medium { border-top-color: #f59e0b; }
     .task-card.priority-high { border-top-color: #f97316; }
     .task-card.priority-urgent { border-top-color: #ef4444; }

     .task-header {
       display: flex;
       align-items: flex-start;
       gap: 1rem;
       margin-bottom: 1rem;
     }

     .task-status-icon {
       font-size: 1.5rem;
       flex-shrink: 0;
     }

     .task-title {
       flex: 1;
       margin: 0;
       font-size: 1.125rem;
       font-weight: 600;
       color: #1f2937;
       line-height: 1.4;
     }

     .task-actions {
       display: flex;
       gap: 0.5rem;
       flex-shrink: 0;
     }

     .edit-btn, .delete-btn {
       background: none;
       border: none;
       padding: 0.5rem;
       border-radius: 0.375rem;
       cursor: pointer;
       transition: background-color 0.2s;
       font-size: 1rem;
     }

     .edit-btn:hover {
       background: #f3f4f6;
     }

     .delete-btn:hover {
       background: #fee2e2;
     }

     .task-description {
       color: #6b7280;
       margin-bottom: 1rem;
       line-height: 1.5;
       font-size: 0.875rem;
     }

     .task-meta {
       display: flex;
       gap: 1rem;
       margin-bottom: 1rem;
       flex-wrap: wrap;
     }

     .task-priority, .task-due-date {
       padding: 0.25rem 0.75rem;
       border-radius: 9999px;
       font-size: 0.75rem;
       font-weight: 600;
       text-transform: uppercase;
     }

     .task-priority {
       background: #f3f4f6;
       color: #374151;
     }

     .task-due-date {
       background: #fef3c7;
       color: #92400e;
     }

     .task-tags {
       display: flex;
       gap: 0.5rem;
       flex-wrap: wrap;
     }

     .tag {
       padding: 0.25rem 0.5rem;
       background: #e0e7ff;
       color: #3730a3;
       border-radius: 0.375rem;
       font-size: 0.75rem;
       font-weight: 500;
     }

     .empty-state {
       text-align: center;
       padding: 3rem;
       color: #6b7280;

       &.filtered {
         padding: 2rem;
         background: #f8fafc;
         border: 2px dashed #cbd5e1;
         border-radius: 1rem;
         margin: 1rem 0;
       }
     }

     .empty-state p {
       font-size: 1.125rem;
       margin-bottom: 2rem;
     }

     .empty-state-subtitle {
       font-size: 0.875rem;
       color: #9ca3af;
       margin-bottom: 0;
     }

     /* Styles pour la modal */
     .modal-overlay {
       position: fixed;
       top: 0;
       left: 0;
       right: 0;
       bottom: 0;
       background: rgba(0, 0, 0, 0.5);
       display: flex;
       align-items: center;
       justify-content: center;
       z-index: 1000;
       padding: 1rem;
     }

     .modal-content {
       background: transparent;
       border-radius: 1rem;
       max-width: 90vw;
       max-height: 90vh;
       overflow: auto;
     }
    
    @media (max-width: 768px) {
      .dashboard-container {
        padding: 1rem;
      }
      
      .welcome-card {
        padding: 2rem;
      }
      
      .dashboard-header h1 {
        font-size: 2rem;
      }
      
      .features-grid {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class Dashboard implements OnInit {
  private supabaseService = inject(SupabaseService);
  private taskService = inject(TaskService);
  
  supabaseStatus = signal<'connecting' | 'connected' | 'error'>('connecting');
  statusMessage = signal('Connexion en cours...');

  // Accès aux signaux du TaskService
  tasks = this.taskService.tasks;
  loading = this.taskService.loading;
  taskError = this.taskService.error;

  // Signaux pour les filtres
  currentFilters = signal<FilterOptions>({
    status: '',
    priority: '',
    searchTerm: '',
    sortBy: 'created_at',
    sortOrder: 'desc'
  });

  // Tâches filtrées et triées (computed signal)
  filteredTasks = computed(() => {
    let filtered = this.tasks();
    const filters = this.currentFilters();

    // Filtrage par statut
    if (filters.status) {
      filtered = filtered.filter(task => task.status === filters.status);
    }

    // Filtrage par priorité
    if (filters.priority) {
      filtered = filtered.filter(task => task.priority === filters.priority);
    }

    // Filtrage par recherche textuelle
    if (filters.searchTerm) {
      const searchLower = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(task => 
        task.title.toLowerCase().includes(searchLower) ||
        task.description?.toLowerCase().includes(searchLower) ||
        task.tags?.some(tag => tag.toLowerCase().includes(searchLower))
      );
    }

    // Tri des résultats
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (filters.sortBy) {
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'priority':
          const priorityOrder = { 'urgent': 4, 'high': 3, 'medium': 2, 'low': 1 };
          comparison = (priorityOrder[a.priority as keyof typeof priorityOrder] || 0) - 
                      (priorityOrder[b.priority as keyof typeof priorityOrder] || 0);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'due_date':
          const dateA = a.due_date ? new Date(a.due_date).getTime() : 0;
          const dateB = b.due_date ? new Date(b.due_date).getTime() : 0;
          comparison = dateA - dateB;
          break;
        case 'created_at':
        default:
          const createdA = new Date(a.created_at || 0).getTime();
          const createdB = new Date(b.created_at || 0).getTime();
          comparison = createdA - createdB;
          break;
      }

      return filters.sortOrder === 'desc' ? -comparison : comparison;
    });

    return filtered;
  });

  // Signaux pour la modal de formulaire
  showTaskForm = signal(false);
  editingTask = signal<Task | null>(null);

  async ngOnInit() {
    await this.checkSupabaseConnection();
    
    // Charger les tâches dès que possible
    await this.loadTaskData();
  }

  private async checkSupabaseConnection() {
    try {
      console.log('🔍 Dashboard: Test de connexion Supabase...');
      const { data, error } = await this.supabaseService.healthCheck();
      
      if (error) {
        this.supabaseStatus.set('error');
        this.statusMessage.set(`Erreur: ${this.supabaseService.handleError(error)}`);
        console.warn('❌ Dashboard: Connexion échouée');
      } else {
        this.supabaseStatus.set('connected');
        this.statusMessage.set('Connecté et opérationnel');
        console.log('✅ Dashboard: Connexion réussie');
      }
    } catch (error) {
      this.supabaseStatus.set('error');
      this.statusMessage.set('Erreur de connexion');
      console.error('💥 Dashboard: Erreur inattendue', error);
    }
  }

  private async loadTaskData() {
    try {
      console.log('📊 Dashboard: Chargement des données des tâches...');
      console.log('📊 Dashboard: Tâches actuelles avant chargement:', this.tasks().length);
      
      await this.taskService.loadTasks();
      
      console.log('✅ Dashboard: Données des tâches chargées');
      console.log('📊 Dashboard: Tâches après chargement:', this.tasks().length);
      console.log('📊 Dashboard: Loading state:', this.loading());
      console.log('📊 Dashboard: Error state:', this.taskError());
    } catch (error) {
      console.error('❌ Dashboard: Erreur chargement tâches', error);
    }
  }

  // Méthode pour obtenir les statistiques des tâches
  getTaskStats() {
    return this.taskService.getStats();
  }

  getStatusIcon(): string {
    switch (this.supabaseStatus()) {
      case 'connecting': return '🔄';
      case 'connected': return '✅';
      case 'error': return '❌';
      default: return '❓';
    }
  }

  getStatusClass(): string {
    switch (this.supabaseStatus()) {
      case 'connecting': return 'status-connecting';
      case 'connected': return 'status-connected';
      case 'error': return 'status-error';
      default: return '';
    }
  }

  getTaskStatusIcon(status: string): string {
    switch (status) {
      case 'pending': return '⏳';
      case 'in_progress': return '🔄';
      case 'completed': return '✅';
      case 'cancelled': return '❌';
      default: return '❓';
    }
  }

  async createSampleData() {
    try {
      console.log('🧪 Dashboard: Création de données de test...');
      await this.taskService.createSampleTasks();
      console.log('✅ Dashboard: Données de test créées');
    } catch (error) {
      console.error('❌ Dashboard: Erreur création données test', error);
    }
  }

  async refreshData() {
    try {
      console.log('🔄 Dashboard: Actualisation des données...');
      await this.taskService.loadTasks();
      console.log('✅ Dashboard: Données actualisées');
    } catch (error) {
      console.error('❌ Dashboard: Erreur actualisation', error);
    }
  }

  async debugTasks() {
    try {
      console.log('🔍 Dashboard: Test de debug des tâches...');
      const result = await this.taskService.debugLoadTasks();
      console.log('🔍 Dashboard: Résultat debug:', result);
    } catch (error) {
      console.error('🔍 Dashboard: Erreur debug:', error);
    }
  }

  // CRUD des tâches depuis le dashboard
  openNewTaskForm() {
    this.editingTask.set(null);
    this.showTaskForm.set(true);
  }

  editTask(task: Task) {
    this.editingTask.set(task);
    this.showTaskForm.set(true);
  }

  async deleteTask(taskId: string) {
    if (confirm('Êtes-vous sûr de vouloir supprimer cette tâche ?')) {
      try {
        console.log('🗑️ Dashboard: Suppression tâche...');
        const success = await this.taskService.deleteTask(taskId);
        if (success) {
          console.log('✅ Dashboard: Tâche supprimée');
        }
      } catch (error) {
        console.error('❌ Dashboard: Erreur suppression', error);
      }
    }
  }

  closeTaskForm() {
    this.showTaskForm.set(false);
    this.editingTask.set(null);
  }

  handleTaskSave() {
    this.closeTaskForm();
    console.log('✅ Dashboard: Tâche sauvegardée');
  }

  // Méthode pour gérer les changements de filtres
  onFiltersChange(filters: FilterOptions) {
    console.log('🔍 Dashboard: Filtres mis à jour:', filters);
    this.currentFilters.set(filters);
  }
}
