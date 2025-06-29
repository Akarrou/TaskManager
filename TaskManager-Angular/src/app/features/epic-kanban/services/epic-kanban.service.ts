import { Injectable, inject } from '@angular/core';
import { TaskService, Task } from '../../../core/services/task';
import { EpicBoard, EpicMetrics, VelocityMetrics, BurndownData, BoardSettings } from '../models/epic-board.model';
import { DEFAULT_KANBAN_COLUMNS, DEFAULT_BOARD_SETTINGS } from '../models/kanban-constants';

@Injectable({
  providedIn: 'root'
})
export class EpicKanbanService {
  private taskService = inject(TaskService);

  /**
   * Charge le board complet pour un epic donné
   */
  async loadEpicBoard(epicId: string): Promise<EpicBoard> {
    try {
      // Charger toutes les tâches
      await this.taskService.loadTasks();
      const allTasks = this.taskService.tasks();

      // Trouver l'epic
      const epic = allTasks.find(task => task.id === epicId && task.type === 'epic');
      if (!epic) {
        throw new Error(`Epic avec l'ID ${epicId} non trouvé`);
      }

      // Récupérer les features et tasks liées à cet epic
      const features = this.getFeaturesByEpic(allTasks, epicId);
      const tasks = this.getTasksByEpic(allTasks, epicId);

      // Calculer les métriques
      const metrics = this.calculateEpicMetrics(epic, features, tasks);

      // Charger les settings (localStorage pour l'instant)
      const settings = this.loadBoardSettings(epicId);

      return {
        epic,
        columns: DEFAULT_KANBAN_COLUMNS,
        features,
        tasks,
        metrics,
        settings,
        lastUpdated: new Date().toISOString(),
        isLoading: false
      };

    } catch (error) {
      console.error('Erreur lors du chargement de l\'epic board:', error);
      throw error;
    }
  }

  /**
   * Met à jour le statut d'une feature
   */
  async updateFeatureStatus(featureId: string, newStatus: Task['status']): Promise<boolean> {
    return await this.taskService.updateTask(featureId, { status: newStatus });
  }

  /**
   * Met à jour le statut d'une task
   */
  async updateTaskStatus(taskId: string, newStatus: Task['status']): Promise<boolean> {
    return await this.taskService.updateTask(taskId, { status: newStatus });
  }

  /**
   * Récupère les features d'un epic
   */
  private getFeaturesByEpic(allTasks: Task[], epicId: string): Task[] {
    return allTasks.filter(task => 
      task.parent_task_id === epicId && task.type === 'feature'
    );
  }

  /**
   * Récupère toutes les tasks d'un epic (directes + via features)
   */
  private getTasksByEpic(allTasks: Task[], epicId: string): Task[] {
    const features = this.getFeaturesByEpic(allTasks, epicId);
    const featureIds = features.map(f => f.id).filter(id => id !== undefined);
    
    // Tasks directement attachées à l'epic
    const directTasks = allTasks.filter(task => 
      task.parent_task_id === epicId && task.type === 'task'
    );

    // Tasks attachées aux features de l'epic
    const featureTasks = allTasks.filter(task => 
      featureIds.includes(task.parent_task_id || '') && task.type === 'task'
    );

    return [...directTasks, ...featureTasks];
  }

  /**
   * Calcule les métriques d'un epic
   */
  private calculateEpicMetrics(epic: Task, features: Task[], tasks: Task[]): EpicMetrics {
    const allItems = [...features, ...tasks];
    const totalTasks = allItems.length;
    const completedTasks = allItems.filter(item => item.status === 'completed').length;
    const progressPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const blockedTasks = allItems.filter(item => 
      item.status === 'pending' && item.due_date && new Date(item.due_date) < new Date()
    );

    return {
      totalTasks,
      completedTasks,
      inProgressTasks: allItems.filter(item => item.status === 'in_progress').length,
      pendingTasks: allItems.filter(item => item.status === 'pending').length,
      cancelledTasks: allItems.filter(item => item.status === 'cancelled').length,
      progressPercentage,
      velocity: {
        currentSprint: 0,
        previousSprint: 0,
        averageVelocity: 0,
        trend: 'stable',
        sprintHistory: []
      },
      burndown: {
        points: [],
        idealLine: [],
        isOnTrack: true
      },
      cycleTime: {
        averageCycleTime: 0,
        medianCycleTime: 0,
        fastest: 0,
        slowest: 0,
        distribution: []
      },
      blockedTasks,
      teamLoad: [],
      estimatedHours: 0,
      actualHours: 0,
      remainingHours: 0,
      highPriorityTasks: allItems.filter(item => item.priority === 'high').length,
      mediumPriorityTasks: allItems.filter(item => item.priority === 'medium').length,
      lowPriorityTasks: allItems.filter(item => item.priority === 'low').length
    };
  }

  /**
   * Charge les settings du board depuis localStorage
   */
  private loadBoardSettings(epicId: string): BoardSettings {
    const savedSettings = localStorage.getItem(`epic-kanban-settings-${epicId}`);
    if (savedSettings) {
      try {
        return { ...DEFAULT_BOARD_SETTINGS, ...JSON.parse(savedSettings) };
      } catch (error) {
        console.warn('Erreur lors du chargement des settings:', error);
      }
    }
    return { ...DEFAULT_BOARD_SETTINGS };
  }

  /**
   * Sauvegarde les settings du board dans localStorage
   */
  saveBoardSettings(epicId: string, settings: Partial<BoardSettings>): void {
    const currentSettings = this.loadBoardSettings(epicId);
    const newSettings = { ...currentSettings, ...settings };
    localStorage.setItem(`epic-kanban-settings-${epicId}`, JSON.stringify(newSettings));
  }

  /**
   * Filtre les features par statut pour les colonnes Kanban
   */
  getFeaturesByStatus(status: string, features: Task[]): Task[] {
    return features.filter(feature => feature.status === status);
  }
} 