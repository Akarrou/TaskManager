import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { SupabaseService } from './supabase';
import { ISubtask } from '../../features/tasks/subtask.model';
import { Store } from '@ngrx/store';
import { AppState } from '../../app.state';
import { selectSelectedProjectId } from '../../features/projects/store/project.selectors';
import { switchMap, from, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

export type { ISubtask };

export interface Task {
  id?: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'review' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to?: string;
  created_by?: string;  // Sera ajouté automatiquement lors de la création
  due_date?: string;
  created_at?: string;
  updated_at?: string;
  completed_at?: string;
  tags?: string[];
  slug: string;
  prd_slug: string;
  estimated_hours?: number;
  actual_hours?: number;
  task_number?: number;
  subtasks?: ISubtask[];
  environment: string[];
  guideline_refs: string[];
  type: 'epic' | 'feature' | 'task';
  parent_task_id?: string | null;
  project_id: string;
  epic_id?: string;
  feature_id?: string;
}

// Nouvelle interface pour les commentaires
export interface TaskComment {
  id?: string;
  task_id: string;
  user_id: string;
  comment: string;
  created_at?: string;
  updated_at?: string;
  users?: { // Correspond au nom de la table 'users' de auth
    email?: string;
    // Ajoutez d'autres champs si nécessaire, comme un raw_user_meta_data->>name
  } | null;
}

@Injectable({
  providedIn: 'root'
})
export class TaskService {
  private supabaseService = inject(SupabaseService);
  private store = inject(Store<AppState>);

  // Signaux Angular pour state management moderne
  private tasksSignal = signal<Task[]>([]);
  private loadingSignal = signal<boolean>(false);
  private errorSignal = signal<string | null>(null);

  // Computed signals pour les statistiques
  readonly tasks = this.tasksSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  readonly totalTasks = computed(() => this.tasksSignal().length);
  readonly completedTasks = computed(() =>
    this.tasksSignal().filter(task => task.status === 'completed').length
  );
  readonly pendingTasks = computed(() =>
    this.tasksSignal().filter(task => task.status === 'pending').length
  );
  readonly inProgressTasks = computed(() =>
    this.tasksSignal().filter(task => task.status === 'in_progress').length
  );

  constructor() {
    // Effet qui écoute les changements de projet et recharge les tâches
    effect(() => {
      const selectedProjectId = this.store.selectSignal(selectSelectedProjectId);
      const projectId = selectedProjectId(); // On récupère la valeur du signal
      if (projectId) {
        this.loadTasksForProject(projectId);
      } else {
        this.tasksSignal.set([]); // Pas de projet, pas de tâches
      }
    });
  }

  // Méthode simple pour charger les tâches d'un projet spécifique
  private async loadTasksForProject(projectId: string): Promise<void> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const { data, error } = await this.supabaseService.tasks
        .select('*')
        .eq('project_id', projectId) // Le filtrage crucial
        .order('created_at', { ascending: false });

      if (error) {
        const errorMessage = this.supabaseService.handleError(error);
        this.errorSignal.set(errorMessage);
        this.tasksSignal.set([]);
      } else {
        this.tasksSignal.set(data || []);
      }
    } catch (error) {
      const errorMessage = 'Erreur inattendue lors du chargement';
      this.errorSignal.set(errorMessage);
      this.tasksSignal.set([]);
    } finally {
      this.loadingSignal.set(false);
    }
  }

  // L'ancienne méthode loadTasks n'est plus directement utilisée,
  // mais on peut la garder pour des cas sans projet ou la supprimer.
  // Pour l'instant, je la laisse pour ne pas casser d'autres dépendances.
  async loadTasks(): Promise<void> {
    // Optionnel: charger les tâches du projet actif si on veut garder cette méthode
    const projectId = this.store.selectSignal(selectSelectedProjectId)();
    if (projectId) {
      await this.loadTasksForProject(projectId);
    }
  }

  // Méthode pour obtenir les statistiques
  getStats() {
    return {
      total: this.totalTasks(),
      completed: this.completedTasks(),
      pending: this.pendingTasks(),
      inProgress: this.inProgressTasks(),
      completionRate: this.totalTasks() > 0
        ? Math.round((this.completedTasks() / this.totalTasks()) * 100)
        : 0
    };
  }

  // ÉTAPE 3: Méthode pour créer des données de test
  async createSampleTasks(): Promise<void> {
    this.loadingSignal.set(true);

    const sampleTasks: Omit<Task, 'id' | 'created_at' | 'updated_at'>[] = [
      {
        title: '🌱 Plantation de tomates',
        description: 'Planter les plants de tomates dans la serre principale',
        status: 'completed',
        priority: 'high',
        assigned_to: 'farmer_1',
        created_by: 'system',
        due_date: '2024-01-15',
        tags: ['tomates', 'serre', 'urgent'],
        environment: ['frontend'],
        slug: '',
        prd_slug: '',
        estimated_hours: 2,
        actual_hours: 2,
        type: 'task',
        guideline_refs: [],
        parent_task_id: null,
        project_id: '',
        epic_id: '',
        feature_id: ''
      },
      {
        title: '💧 Vérification du système d\'irrigation',
        description: 'Contrôler le bon fonctionnement des arroseurs automatiques',
        status: 'in_progress',
        priority: 'medium',
        assigned_to: 'farmer_2',
        created_by: 'system',
        due_date: '2024-01-20',
        tags: ['irrigation', 'maintenance'],
        environment: ['backend'],
        slug: '',
        prd_slug: '',
        estimated_hours: 1,
        actual_hours: 0.5,
        type: 'task',
        guideline_refs: [],
        parent_task_id: null,
        project_id: '',
        epic_id: '',
        feature_id: ''
      },
      {
        title: '🚜 Entretien tracteur',
        description: 'Révision complète du tracteur John Deere',
        status: 'pending',
        priority: 'high',
        assigned_to: 'mechanic_1',
        created_by: 'system',
        due_date: '2024-01-25',
        tags: ['tracteur', 'mécanique'],
        environment: ['frontend'],
        slug: '',
        prd_slug: '',
        estimated_hours: 3,
        actual_hours: 2,
        type: 'task',
        guideline_refs: [],
        parent_task_id: null,
        project_id: '',
        epic_id: '',
        feature_id: ''
      },
      {
        title: '📊 Rapport mensuel',
        description: 'Préparer le rapport de production du mois',
        status: 'pending',
        priority: 'medium',
        assigned_to: 'manager_1',
        created_by: 'system',
        due_date: '2024-01-30',
        tags: ['rapport', 'production'],
        environment: ['backend'],
        slug: '',
        prd_slug: '',
        estimated_hours: 4,
        actual_hours: 3,
        type: 'task',
        guideline_refs: [],
        parent_task_id: null,
        project_id: '',
        epic_id: '',
        feature_id: ''
      },
      {
        title: 'Inspection qualité récolte',
        description: 'Vérifier la qualité des légumes récoltés',
        status: 'completed',
        priority: 'high',
        assigned_to: 'quality_manager',
        created_by: 'system',
        due_date: '2024-01-10',
        tags: ['inspection', 'qualité', 'récolte'],
        environment: ['frontend'],
        slug: '',
        prd_slug: '',
        estimated_hours: 1,
        actual_hours: 1,
        type: 'task',
        guideline_refs: [],
        parent_task_id: null,
        project_id: '',
        epic_id: '',
        feature_id: ''
      }
    ];

    try {
      const { data, error } = await this.supabaseService.tasks
        .insert(sampleTasks)
        .select();

      if (error) {
        const errorMessage = this.supabaseService.handleError(error);
        this.errorSignal.set(errorMessage);
      } else {
        await this.loadTasks();
      }
    } catch (error) {
      const errorMessage = 'Erreur inattendue lors de la création des données test';
      this.errorSignal.set(errorMessage);
    } finally {
      this.loadingSignal.set(false);
    }
  }

  // ÉTAPE 4: CRUD complet des tâches
  async createTask(task: Omit<Task, 'id' | 'created_at' | 'updated_at'>): Promise<string | null> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);
    // On retire task_number et subtasks si présents
    // On s'assure que les champs array sont bien formatés
    const { task_number, subtasks, ...taskWithoutNumber } = task;

    // Nettoyage du payload : suppression des clés undefined
    const cleanedPayload: Record<string, any> = {};
    Object.entries(taskWithoutNumber).forEach(([key, value]) => {
      if (value !== undefined) {
        cleanedPayload[key] = value;
      }
    });

    // Vérification obligatoire pour type
    if (!cleanedPayload['type']) {
      this.errorSignal.set('Le champ "type" est obligatoire et doit être défini (epic, feature ou task)');
      this.loadingSignal.set(false);
      return null;
    }
    // Vérification obligatoire pour parent_task_id (doit exister, même si null)
    if (!('parent_task_id' in cleanedPayload)) {
      cleanedPayload['parent_task_id'] = null;
    }

    // Log du payload nettoyé

    try {
      const { data, error } = await this.supabaseService.tasks
        .insert([cleanedPayload])
        .select()
        .single();

      if (error) {
        const errorMessage = this.supabaseService.handleError(error);
        this.errorSignal.set(errorMessage);
        return null;
      } else {
        await this.loadTasks();
        return data.id;
      }
    } catch (error) {
      const errorMessage = 'Erreur inattendue lors de la création';
      this.errorSignal.set(errorMessage);
      return null;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<boolean> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const { data, error } = await this.supabaseService.tasks
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        const errorMessage = this.supabaseService.handleError(error);
        this.errorSignal.set(errorMessage);
        console.error('updateTask - error:', error); // DEBUG
        return false;
      } else {
        await this.loadTasks();
        return true;
      }
    } catch (error) {
      const errorMessage = 'Erreur inattendue lors de la mise à jour';
      this.errorSignal.set(errorMessage);
      console.error('updateTask - catch error:', error); // DEBUG
      return false;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async deleteTask(id: string): Promise<boolean> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const { error } = await this.supabaseService.tasks
        .delete()
        .eq('id', id);

      if (error) {
        const errorMessage = this.supabaseService.handleError(error);
        this.errorSignal.set(errorMessage);
        return false;
      } else {
        await this.loadTasks();
        return true;
      }
    } catch (error) {
      const errorMessage = 'Erreur inattendue lors de la suppression';
      this.errorSignal.set(errorMessage);
      return false;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  // Méthode pour obtenir une tâche par ID
  getTaskById(id: string): Task | undefined {
    return this.tasksSignal().find(task => task.id === id);
  }

  // Méthode pour filtrer les tâches
  getTasksByStatus(status: Task['status']): Task[] {
    return this.tasksSignal().filter(task => task.status === status);
  }

  // Méthode pour filtrer par priorité
  getTasksByPriority(priority: Task['priority']): Task[] {
    return this.tasksSignal().filter(task => task.priority === priority);
  }

  // Méthode de debug pour tester la connexion directe
  async debugLoadTasks(): Promise<any> {
    try {
      const result = await this.supabaseService.tasks
        .select('*')
        .order('created_at', { ascending: false });

      return result;
    } catch (error) {
      return { error };
    }
  }

  /**
   * Get all subtasks for a given task
   */
  async getSubtasksForTask(taskId: string): Promise<ISubtask[]> {
    const { data, error } = await this.supabaseService.client
      .from('subtasks')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });
    if (error) {
      return [];
    }
    return data as ISubtask[];
  }

  /**
   * Create a new subtask
   */
  async createSubtask(subtask: Omit<ISubtask, 'id' | 'created_at' | 'updated_at'>): Promise<ISubtask | null> {
    const { data, error } = await this.supabaseService.client
      .from('subtasks')
      .insert([subtask])
      .select()
      .single();
    if (error) {
      return null;
    }
    return data as ISubtask;
  }

  /**
   * Update a subtask
   */
  async updateSubtask(id: string, updates: Partial<ISubtask>): Promise<boolean> {
    const { error } = await this.supabaseService.client
      .from('subtasks')
      .update(updates)
      .eq('id', id);
    if (error) {
      return false;
    }
    return true;
  }

  /**
   * Delete a subtask
   */
  async deleteSubtask(id: string): Promise<boolean> {
    const { error } = await this.supabaseService.client
      .from('subtasks')
      .delete()
      .eq('id', id);
    if (error) {
      return false;
    }
    return true;
  }

  /**
   * Fetch a task by id, including its subtasks
   */
  async fetchTaskById(id: string): Promise<Task | null> {
    const { data, error } = await this.supabaseService.tasks
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching task by ID:', error.message);
      return null;
    }
    return data;
  }

  async getTasksForFeature(featureId: string): Promise<Task[]> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const { data, error } = await this.supabaseService.tasks
        .select('*')
        .eq('parent_task_id', featureId);

      if (error) {
        throw error;
      }
      return data || [];
    } catch (error: any) {
      this.errorSignal.set(this.supabaseService.handleError(error));
      return [];
    } finally {
      this.loadingSignal.set(false);
    }
  }

  // Nouvelle méthode pour récupérer les commentaires d'une tâche
  async getCommentsForTask(taskId: string): Promise<TaskComment[] | null> {
    if (!taskId) {
      this.errorSignal.set('Task ID is required');
      return null;
    }

    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      // 1. Récupérer les commentaires sans join
      const { data: comments, error } = await this.supabaseService.taskComments
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });

      if (error) {
        const errorMessage = this.supabaseService.handleError(error);
        this.errorSignal.set(errorMessage);
        return null;
      }
      if (!comments || comments.length === 0) {
        return [];
      }
      // 2. Récupérer les emails des utilisateurs distincts
      const userIds = [...new Set(comments.map((c: any) => c.user_id).filter(Boolean))];
      let usersMap: Record<string, { email: string }> = {};
      if (userIds.length > 0) {
        const { data: users, error: userError } = await this.supabaseService.client
          .from('public_users')
          .select('id, email')
          .in('id', userIds);
        if (!userError && users) {
          usersMap = Object.fromEntries(users.map((u: any) => [u.id, { email: u.email }]));
        }
      }
      // 3. Associer les emails aux commentaires
      const commentsWithEmail = comments.map((c: any) => ({
        ...c,
        users: usersMap[c.user_id] ? { email: usersMap[c.user_id].email } : null
      }));
      return commentsWithEmail;
    } catch (error) {
      const errorMessage = 'Erreur inattendue lors de la récupération des commentaires';
      this.errorSignal.set(errorMessage);
      return null;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  // Nouvelle méthode pour ajouter un commentaire à une tâche
  async addCommentToTask(commentData: Omit<TaskComment, 'id' | 'created_at' | 'updated_at'>): Promise<TaskComment | null> {
    try {
      const { data, error } = await this.supabaseService.taskComments
        .insert([commentData])
        .select()
        .single(); // Pour retourner le commentaire créé

      if (error) {
        const errorMessage = this.supabaseService.handleError(error);
        return null;
      }
      return data as TaskComment;
    } catch (error) {
      return null;
    }
  }
}
