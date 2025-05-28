// Application principale Task Manager
class TaskManager {
  constructor() {
    this.tasks = [];
    this.filteredTasks = [];
    this.currentFilters = {
      search: "",
      statusList: ["À faire", "En cours"], // Par défaut, afficher seulement "À faire" et "En cours"
      priority: "",
      category: "",
    };
    this.init();
  }

  // Initialisation de l'application
  async init() {
    this.setupEventListeners();
    this.setupAutoRefresh();
    await this.loadTasks();
    this.updateConnectionStatus();
  }

  // Configuration des événements
  setupEventListeners() {
    // Bouton actualiser
    document.getElementById("refresh-btn").addEventListener("click", () => {
      this.loadTasks();
    });

    // Filtres
    document.getElementById("search-input").addEventListener("input", (e) => {
      this.currentFilters.search = e.target.value;
      this.applyFilters();
    });

    // Filtres de statut par cases à cocher avec boutons toggle
    document.querySelectorAll(".status-checkbox").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        this.updateStatusFilter();
        this.updateToggleButtons();
        this.applyFilters();
      });
    });

    // Boutons d'action rapide
    document
      .getElementById("select-all-status")
      .addEventListener("click", () => {
        this.toggleAllStatus(true);
      });

    document
      .getElementById("deselect-all-status")
      .addEventListener("click", () => {
        this.toggleAllStatus(false);
      });

    // Gestion des clics sur les boutons toggle (labels)
    document.querySelectorAll('label[for^="status-"]').forEach((label) => {
      label.addEventListener("click", (e) => {
        // Le checkbox sera automatiquement changé par le label
        setTimeout(() => {
          this.updateStatusFilter();
          this.updateToggleButtons();
          this.applyFilters();
        }, 10);
      });
    });

    document
      .getElementById("priority-filter")
      .addEventListener("change", (e) => {
        this.currentFilters.priority = e.target.value;
        this.applyFilters();
      });

    document
      .getElementById("category-filter")
      .addEventListener("change", (e) => {
        this.currentFilters.category = e.target.value;
        this.applyFilters();
      });

    // Initialiser l'état des boutons toggle
    this.initializeToggleButtons();

    // Event listener pour le bouton nouvelle tâche
    document.getElementById("new-task-btn").addEventListener("click", () => {
      this.redirectToCreate();
    });
  }

  // Initialiser l'état des boutons toggle selon les valeurs par défaut
  initializeToggleButtons() {
    document.querySelectorAll(".status-checkbox").forEach((checkbox) => {
      if (this.currentFilters.statusList.includes(checkbox.value)) {
        checkbox.checked = true;
      }
    });
    this.updateToggleButtons();
  }

  // Mettre à jour l'apparence visuelle des boutons toggle
  updateToggleButtons() {
    document.querySelectorAll(".status-checkbox").forEach((checkbox) => {
      const toggleButton = checkbox.nextElementSibling;
      if (checkbox.checked) {
        toggleButton.classList.remove("inactive");
        toggleButton.classList.add("active");
      } else {
        toggleButton.classList.remove("active");
        toggleButton.classList.add("inactive");
      }
    });
  }

  // Mise à jour du filtre de statut basé sur les cases cochées
  updateStatusFilter() {
    const checkedStatuses = [];
    document
      .querySelectorAll(".status-checkbox:checked")
      .forEach((checkbox) => {
        checkedStatuses.push(checkbox.value);
      });
    this.currentFilters.statusList = checkedStatuses;
  }

  // Configuration du rafraîchissement automatique
  setupAutoRefresh() {
    setInterval(() => {
      this.loadTasks();
    }, CONFIG.UI.REFRESH_INTERVAL);
  }

  // Chargement des tâches
  async loadTasks() {
    this.showLoading(true);

    try {
      // Charger les tâches et les statistiques en parallèle
      const [tasks, index] = await Promise.all([
        api.getAllTasks(),
        api.getTasksIndex(),
      ]);

      this.tasks = tasks;
      this.updateStatistics(index);
      this.applyFilters();
      this.updateConnectionStatus();
    } catch (error) {
      console.error("Erreur lors du chargement des tâches:", error);
      this.showError("Erreur lors du chargement des tâches");
    } finally {
      this.showLoading(false);
    }
  }

  // Mise à jour des statistiques
  updateStatistics(index) {
    document.getElementById("total-tasks").textContent = index.total_tasks || 0;
    document.getElementById("todo-tasks").textContent =
      index.status_breakdown?.["À faire"] || 0;
    document.getElementById("progress-tasks").textContent =
      index.status_breakdown?.["En cours"] || 0;
    document.getElementById("completed-tasks").textContent =
      index.status_breakdown?.["Terminée"] || 0;
  }

  // Application des filtres
  applyFilters() {
    let filtered = [...this.tasks];

    // Filtrer par recherche textuelle
    if (this.currentFilters.search) {
      const search = this.currentFilters.search.toLowerCase();
      filtered = filtered.filter(
        (task) =>
          task.title.toLowerCase().includes(search) ||
          task.description.toLowerCase().includes(search) ||
          task.tags.some((tag) => tag.toLowerCase().includes(search))
      );
    }

    // Filtrer par statuts sélectionnés
    if (this.currentFilters.statusList.length > 0) {
      filtered = filtered.filter((task) =>
        this.currentFilters.statusList.includes(task.status)
      );
    }

    // Filtrer par priorité
    if (this.currentFilters.priority) {
      filtered = filtered.filter(
        (task) => task.priority === this.currentFilters.priority
      );
    }

    // Filtrer par catégorie
    if (this.currentFilters.category) {
      filtered = filtered.filter(
        (task) => task.category === this.currentFilters.category
      );
    }

    this.filteredTasks = filtered;
    this.renderTasks();
  }

  // Rendu des tâches
  renderTasks() {
    const container = document.getElementById("tasks-container");
    const noTasksDiv = document.getElementById("no-tasks");
    const filteredCount = document.getElementById("filtered-count");

    // Mettre à jour le compteur
    filteredCount.textContent = this.filteredTasks.length;

    if (this.filteredTasks.length === 0) {
      container.innerHTML = "";
      noTasksDiv.classList.remove("hidden");
      return;
    }

    noTasksDiv.classList.add("hidden");
    container.innerHTML = this.filteredTasks
      .map((task) => this.renderTaskCard(task))
      .join("");

    // Ajouter les événements aux cartes de tâches
    container.querySelectorAll(".task-card").forEach((card) => {
      card.addEventListener("click", () => {
        const taskId = parseInt(card.dataset.taskId);
        this.redirectToEdit(taskId);
      });
    });
  }

  // Rendu d'une carte de tâche
  renderTaskCard(task) {
    const statusColor = CONFIG.STATUS_COLORS[task.status] || "gray";
    const priorityColor = CONFIG.PRIORITY_COLORS[task.priority] || "gray";
    const categoryIcon = CONFIG.CATEGORY_ICONS[task.category] || "fas fa-tasks";

    const dueDateDisplay = task.dueDate
      ? `<span class="text-sm text-gray-500">
                <i class="fas fa-calendar-alt mr-1"></i>
                ${new Date(task.dueDate).toLocaleDateString("fr-FR")}
            </span>`
      : "";

    // Affichage des sous-tâches
    const tasksDisplay =
      task.tasks && task.tasks.length > 0
        ? `<div class="mt-3 pt-3 border-t border-gray-100">
           <div class="flex items-center mb-2">
             <i class="fas fa-list-ul text-blue-500 mr-2"></i>
             <span class="text-sm font-medium text-gray-700">Sous-tâches (${
               task.tasks.length
             })</span>
           </div>
           <div class="space-y-1 max-h-20 overflow-y-auto">
             ${task.tasks
               .slice(0, 3)
               .map(
                 (subtask) =>
                   `<div class="text-xs text-gray-600 flex items-start">
                 <i class="fas fa-chevron-right mr-2 mt-1 text-gray-400"></i>
                 <span class="line-clamp-1">${subtask}</span>
               </div>`
               )
               .join("")}
             ${
               task.tasks.length > 3
                 ? `<div class="text-xs text-gray-500 italic">... et ${
                     task.tasks.length - 3
                   } autres</div>`
                 : ""
             }
           </div>
         </div>`
        : "";

    // Affichage du problème/objectif
    const problemObjectiveDisplay =
      task.problem || task.objective
        ? `<div class="mt-2 pt-2 border-t border-gray-100">
           ${
             task.problem
               ? `<div class="text-xs text-red-600 mb-1">
               <i class="fas fa-exclamation-circle mr-1"></i>
               <span class="font-medium">Problème:</span> ${task.problem.substring(
                 0,
                 60
               )}${task.problem.length > 60 ? "..." : ""}
             </div>`
               : ""
           }
           ${
             task.objective
               ? `<div class="text-xs text-green-600">
               <i class="fas fa-target mr-1"></i>
               <span class="font-medium">Objectif:</span> ${task.objective.substring(
                 0,
                 60
               )}${task.objective.length > 60 ? "..." : ""}
             </div>`
               : ""
           }
         </div>`
        : "";

    return `
            <div class="task-card p-6 hover:bg-gray-50 cursor-pointer transition-colors" data-task-id="${
              task.id
            }">
                <div class="flex items-start justify-between">
                    <div class="flex-1">
                        <div class="flex items-center gap-3 mb-2">
                            <span class="px-2 py-1 text-xs font-semibold rounded-full bg-${statusColor}-100 text-${statusColor}-800">
                                ${task.status}
                            </span>
                            <span class="px-2 py-1 text-xs font-semibold rounded-full bg-${priorityColor}-100 text-${priorityColor}-800">
                                ${task.priority}
                            </span>
                            <span class="text-gray-500">
                                <i class="${categoryIcon}"></i> ${task.category}
                            </span>
                            ${
                              task.source_file
                                ? `<span class="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded">
                                <i class="fas fa-file-alt mr-1"></i>${task.source_file}
                              </span>`
                                : ""
                            }
                        </div>
                        <h3 class="text-lg font-semibold text-gray-800 mb-2">${
                          task.title
                        }</h3>
                        <p class="text-gray-600 text-sm mb-3 line-clamp-2">${
                          task.description
                        }</p>
                        <div class="flex items-center gap-4 text-sm text-gray-500">
                            <span>
                                <i class="fas fa-user mr-1"></i>
                                ${task.assignee}
                            </span>
                            ${dueDateDisplay}
                            <span>
                                <i class="fas fa-hashtag mr-1"></i>
                                ID: ${task.id}
                            </span>
                        </div>
                        ${
                          task.tags.length > 0
                            ? `
                            <div class="flex flex-wrap gap-1 mt-2">
                                ${task.tags
                                  .map(
                                    (tag) => `
                                    <span class="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">${tag}</span>
                                `
                                  )
                                  .join("")}
                            </div>
                        `
                            : ""
                        }
                        ${tasksDisplay}
                        ${problemObjectiveDisplay}
                    </div>
                    <div class="flex items-center text-gray-400">
                        <i class="fas fa-edit text-lg edit-icon mr-2"></i>
                        <i class="fas fa-chevron-right text-lg"></i>
                    </div>
                </div>
            </div>
        `;
  }

  // Redirection vers la page d'édition
  redirectToEdit(taskId) {
    window.location.href = `edit.html?id=${taskId}`;
  }

  // Mise à jour du statut de connexion
  async updateConnectionStatus() {
    const statusElement = document.getElementById("connection-status");
    const isConnected = await api.testConnection();

    if (isConnected) {
      statusElement.innerHTML =
        '<i class="fas fa-circle text-green-500"></i> Connecté à la base de données';
    } else {
      statusElement.innerHTML =
        '<i class="fas fa-circle text-red-500"></i> Déconnecté (Mode démo)';
    }
  }

  // Affichage du chargement
  showLoading(show) {
    const loading = document.getElementById("loading");
    const tasksContainer = document.getElementById("tasks-container");

    if (show) {
      loading.classList.remove("hidden");
      tasksContainer.classList.add("hidden");
    } else {
      loading.classList.add("hidden");
      tasksContainer.classList.remove("hidden");
    }
  }

  // Affichage des messages d'erreur
  showError(message) {
    this.showNotification(message, "error");
  }

  // Affichage des messages de succès
  showSuccessMessage(message) {
    this.showNotification(message, "success");
  }

  // Système de notifications
  showNotification(message, type = "info") {
    const notification = document.createElement("div");
    const bgColor =
      type === "error"
        ? "bg-red-500"
        : type === "success"
        ? "bg-green-500"
        : "bg-blue-500";

    notification.className = `fixed top-4 right-4 ${bgColor} text-white px-6 py-3 rounded-lg shadow-lg z-50 transition-opacity`;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.opacity = "0";
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 300);
    }, 3000);
  }

  // Méthode pour activer/désactiver tous les statuts
  toggleAllStatus(selectAll) {
    document.querySelectorAll(".status-checkbox").forEach((checkbox) => {
      checkbox.checked = selectAll;
    });
    this.updateStatusFilter();
    this.updateToggleButtons();
    this.applyFilters();
  }

  // Redirection vers la page de création
  redirectToCreate() {
    window.location.href = "edit.html";
  }
}

// Initialisation de l'application au chargement de la page
document.addEventListener("DOMContentLoaded", () => {
  window.taskManager = new TaskManager();
});
