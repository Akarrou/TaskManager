// Module API pour la communication avec Redis
class RedisAPI {
  constructor() {
    this.baseURL = CONFIG.API_BASE_URL;
    this.isConnected = false;
  }

  // Test de connexion à l'API
  async testConnection() {
    try {
      const response = await fetch(`${this.baseURL}/health`);
      this.isConnected = response.ok;
      return this.isConnected;
    } catch (error) {
      console.error("Erreur de connexion API:", error);
      this.isConnected = false;
      return false;
    }
  }

  // Récupérer toutes les tâches
  async getAllTasks() {
    try {
      const response = await fetch(`${this.baseURL}/tasks`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Erreur lors de la récupération des tâches:", error);
      // Retourner des données de test si l'API n'est pas disponible
      return this.getMockTasks();
    }
  }

  // Récupérer une tâche spécifique
  async getTask(id) {
    try {
      const response = await fetch(`${this.baseURL}/tasks/${id}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`Erreur lors de la récupération de la tâche ${id}:`, error);
      return null;
    }
  }

  // Récupérer les statistiques
  async getTasksIndex() {
    try {
      const response = await fetch(`${this.baseURL}/tasks/index`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error("Erreur lors de la récupération de l'index:", error);
      return this.getMockIndex();
    }
  }

  // Mettre à jour le statut d'une tâche
  async updateTaskStatus(id, status) {
    try {
      const response = await fetch(`${this.baseURL}/tasks/${id}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error(
        `Erreur lors de la mise à jour du statut de la tâche ${id}:`,
        error
      );
      throw error;
    }
  }

  // Mettre à jour une tâche complète
  async updateTask(id, taskData) {
    try {
      const response = await fetch(`${this.baseURL}/tasks/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(taskData),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`Erreur lors de la mise à jour de la tâche ${id}:`, error);
      throw error;
    }
  }

  // Données de test pour le développement
  getMockTasks() {
    return [
      {
        id: 1,
        title: "Créer l'interface de login",
        status: "À faire",
        priority: "Haute",
        assignee: "Jerome",
        dueDate: "2024-12-31",
        description:
          "Développer l'interface utilisateur pour la page de connexion avec validation des champs",
        category: "Frontend",
        tags: ["angular", "authentication", "ui"],
        tasks: [
          "Créer le composant",
          "Ajouter la validation",
          "Intégrer avec l'API",
        ],
        created_at: "2024-12-20",
        updated_at: "2024-12-20",
        completed_at: null,
      },
      {
        id: 2,
        title: "API d'authentification JWT",
        status: "En cours",
        priority: "Haute",
        assignee: "Jerome",
        dueDate: "2024-12-25",
        description:
          "Développer l'API REST pour l'authentification avec tokens JWT",
        category: "Backend",
        tags: ["spring-boot", "jwt", "security"],
        tasks: [
          "Configurer Spring Security",
          "Créer les endpoints",
          "Tests unitaires",
        ],
        created_at: "2024-12-18",
        updated_at: "2024-12-20",
        completed_at: null,
      },
      {
        id: 3,
        title: "Base de données des utilisateurs",
        status: "Terminée",
        priority: "Moyenne",
        assignee: "Jerome",
        dueDate: "2024-12-20",
        description:
          "Créer les entités JPA et repositories pour la gestion des utilisateurs",
        category: "Backend",
        tags: ["jpa", "database", "entities"],
        tasks: ["Entités User", "Repository", "Migration Flyway"],
        created_at: "2024-12-15",
        updated_at: "2024-12-19",
        completed_at: "2024-12-19",
      },
    ];
  }

  getMockIndex() {
    return {
      total_tasks: 3,
      status_breakdown: {
        "À faire": 1,
        "En cours": 1,
        Terminée: 1,
        "En attente": 0,
        Annulée: 0,
      },
      priority_breakdown: {
        Haute: 2,
        Moyenne: 1,
        Basse: 0,
      },
      category_breakdown: {
        Frontend: 1,
        Backend: 2,
        Fullstack: 0,
        Testing: 0,
        OPS: 0,
      },
      last_updated: new Date().toISOString(),
    };
  }
}

// Instance globale de l'API
const api = new RedisAPI();
