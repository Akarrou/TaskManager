import { Injectable, inject, signal, computed } from '@angular/core';
import { SupabaseService } from './supabase';

export interface Task {
  id?: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to?: string;
  created_by?: string;  // Sera ajouté automatiquement lors de la création
  due_date?: string;
  created_at?: string;
  updated_at?: string;
  completed_at?: string;
  tags?: string[];
  estimated_hours?: number;
  actual_hours?: number;
  task_number?: number;
}

@Injectable({
  providedIn: 'root'
})
export class TaskService {
  private supabaseService = inject(SupabaseService);

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
    console.log('🔧 TaskService initialisé');
  }

  // ÉTAPE 2: Méthode simple pour charger les tâches
  async loadTasks(): Promise<void> {
    console.log('📋 TaskService: Démarrage chargement des tâches...');
    console.log('🔌 SupabaseService disponible:', !!this.supabaseService);
    console.log('📊 Tasks table accessible:', !!this.supabaseService.tasks);
    
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      console.log('🔍 TaskService: Exécution de la requête Supabase...');
      const { data, error } = await this.supabaseService.tasks
        .select('*')
        .order('created_at', { ascending: false });

      console.log('📊 TaskService: Réponse Supabase reçue');
      console.log('📊 TaskService: Error:', error);
      console.log('📊 TaskService: Data:', data);
      console.log('📊 TaskService: Data length:', data?.length);

      if (error) {
        const errorMessage = this.supabaseService.handleError(error);
        console.error('❌ TaskService: Erreur chargement tâches:', errorMessage);
        console.error('❌ TaskService: Détails erreur:', error);
        this.errorSignal.set(errorMessage);
        this.tasksSignal.set([]); // Reset en cas d'erreur
      } else {
        console.log('✅ TaskService: Tâches chargées depuis Supabase:', data?.length || 0);
        console.log('📋 TaskService: Première tâche:', data?.[0]);
        console.log('📋 TaskService: Toutes les tâches:', data);
        
        // Mise à jour du signal avec les données
        this.tasksSignal.set(data || []);
        console.log('📋 TaskService: Signal mis à jour, nouvelles tâches:', this.tasksSignal().length);
      }
    } catch (error) {
      const errorMessage = 'Erreur inattendue lors du chargement';
      console.error('💥 Erreur inattendue:', error);
      this.errorSignal.set(errorMessage);
      this.tasksSignal.set([]);
    } finally {
      this.loadingSignal.set(false);
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
    console.log('🧪 Création de données de test...');
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
        tags: ['tomates', 'serre', 'urgent']
      },
      {
        title: '💧 Vérification du système d\'irrigation',
        description: 'Contrôler le bon fonctionnement des arroseurs automatiques',
        status: 'in_progress',
        priority: 'medium',
        assigned_to: 'farmer_2',
        created_by: 'system',
        due_date: '2024-01-20',
        tags: ['irrigation', 'maintenance']
      },
      {
        title: '🚜 Entretien tracteur',
        description: 'Révision complète du tracteur John Deere',
        status: 'pending',
        priority: 'high',
        assigned_to: 'mechanic_1',
        created_by: 'system',
        due_date: '2024-01-25',
        tags: ['tracteur', 'mécanique']
      },
      {
        title: '📊 Rapport mensuel',
        description: 'Préparer le rapport de production du mois',
        status: 'pending',
        priority: 'medium',
        assigned_to: 'manager_1',
        created_by: 'system',
        due_date: '2024-01-30',
        tags: ['rapport', 'production']
      },
      {
        title: '🔍 Inspection qualité récolte',
        description: 'Vérifier la qualité des légumes récoltés',
        status: 'completed',
        priority: 'high',
        assigned_to: 'quality_manager',
        created_by: 'system',
        due_date: '2024-01-10',
        tags: ['inspection', 'qualité', 'récolte']
      }
    ];

    try {
      const { data, error } = await this.supabaseService.tasks
        .insert(sampleTasks)
        .select();

      if (error) {
        const errorMessage = this.supabaseService.handleError(error);
        console.error('❌ Erreur création données test:', errorMessage);
        this.errorSignal.set(errorMessage);
      } else {
        console.log('✅ Données de test créées:', data?.length || 0, 'tâches');
        // Recharger les tâches après création
        await this.loadTasks();
      }
    } catch (error) {
      const errorMessage = 'Erreur inattendue lors de la création des données test';
      console.error('💥 Erreur inattendue:', error);
      this.errorSignal.set(errorMessage);
         } finally {
       this.loadingSignal.set(false);
     }
   }

  // ÉTAPE 4: CRUD complet des tâches
  async createTask(task: Omit<Task, 'id' | 'created_at' | 'updated_at'>): Promise<boolean> {
    console.log('➕ Création nouvelle tâche:', task.title);
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const { data, error } = await this.supabaseService.tasks
        .insert([task])
        .select()
        .single();

      if (error) {
        const errorMessage = this.supabaseService.handleError(error);
        console.error('❌ Erreur création tâche:', errorMessage);
        this.errorSignal.set(errorMessage);
        return false;
      } else {
        console.log('✅ Tâche créée:', data.id);
        // Recharger les tâches pour mettre à jour l'affichage
        await this.loadTasks();
        return true;
      }
    } catch (error) {
      const errorMessage = 'Erreur inattendue lors de la création';
      console.error('💥 Erreur inattendue:', error);
      this.errorSignal.set(errorMessage);
      return false;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<boolean> {
    console.log('📝 Mise à jour tâche:', id);
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
        console.error('❌ Erreur mise à jour tâche:', errorMessage);
        this.errorSignal.set(errorMessage);
        return false;
      } else {
        console.log('✅ Tâche mise à jour:', data.id);
        await this.loadTasks();
        return true;
      }
    } catch (error) {
      const errorMessage = 'Erreur inattendue lors de la mise à jour';
      console.error('💥 Erreur inattendue:', error);
      this.errorSignal.set(errorMessage);
      return false;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async deleteTask(id: string): Promise<boolean> {
    console.log('🗑️ Suppression tâche:', id);
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const { error } = await this.supabaseService.tasks
        .delete()
        .eq('id', id);

      if (error) {
        const errorMessage = this.supabaseService.handleError(error);
        console.error('❌ Erreur suppression tâche:', errorMessage);
        this.errorSignal.set(errorMessage);
        return false;
      } else {
        console.log('✅ Tâche supprimée:', id);
        await this.loadTasks();
        return true;
      }
    } catch (error) {
      const errorMessage = 'Erreur inattendue lors de la suppression';
      console.error('💥 Erreur inattendue:', error);
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
    console.log('🔍 DEBUG: Test direct de chargement des tâches...');
    try {
      const result = await this.supabaseService.tasks
        .select('*')
        .order('created_at', { ascending: false });
      
      console.log('🔍 DEBUG: Résultat brut Supabase:', result);
      return result;
    } catch (error) {
      console.error('🔍 DEBUG: Erreur:', error);
      return { error };
    }
  }
}
