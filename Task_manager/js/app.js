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
    
    // Écouter les événements UX
    this.setupUXIntegration();
    
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

    // Filtres de statut avec nouveaux boutons accessibles
    document.querySelectorAll(".toggle-button[data-value]").forEach((button) => {
      // Gestion des clics
      button.addEventListener("click", () => {
        this.toggleStatusButton(button);
      });

      // Gestion du clavier (Enter et Space)
      button.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.toggleStatusButton(button);
        }
        // Navigation entre les boutons avec les flèches
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          this.navigateBetweenToggles(button, e.key === "ArrowRight");
        }
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

    // Event listener pour le bouton d'aide
    document.getElementById("help-btn").addEventListener("click", () => {
      this.showHelpModal();
    });

    // Event listeners pour le modal d'aide
    document.getElementById("close-help-btn").addEventListener("click", () => {
      this.hideHelpModal();
    });

    document.getElementById("close-help-modal-btn").addEventListener("click", () => {
      this.hideHelpModal();
    });

    // Fermer le modal d'aide avec Escape
    document.getElementById("help-modal").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) {
        this.hideHelpModal();
      }
    });

    // Gestion des raccourcis clavier globaux
    this.setupKeyboardShortcuts();
  }

  // Nouvelle méthode pour gérer le toggle des boutons de statut
  toggleStatusButton(button) {
    const isPressed = button.getAttribute("aria-pressed") === "true";
    const newState = !isPressed;
    
    // Mettre à jour l'état aria-pressed
    button.setAttribute("aria-pressed", newState.toString());
    
    // Mettre à jour les classes visuelles
    if (newState) {
      button.classList.remove("inactive");
      button.classList.add("active");
    } else {
      button.classList.remove("active");
      button.classList.add("inactive");
    }
    
    // Mettre à jour les filtres
    this.updateStatusFilter();
    this.applyFilters();
  }

  // Initialiser l'état des boutons toggle selon les valeurs par défaut
  initializeToggleButtons() {
    document.querySelectorAll(".toggle-button[data-value]").forEach((button) => {
      const value = button.getAttribute("data-value");
      const isActive = this.currentFilters.statusList.includes(value);
      
      button.setAttribute("aria-pressed", isActive.toString());
      
      if (isActive) {
        button.classList.remove("inactive");
        button.classList.add("active");
      } else {
        button.classList.remove("active");
        button.classList.add("inactive");
      }
    });
  }

  // Mise à jour du filtre de statut basé sur les boutons pressés
  updateStatusFilter() {
    const checkedStatuses = [];
    document
      .querySelectorAll(".toggle-button[data-value][aria-pressed='true']")
      .forEach((button) => {
        checkedStatuses.push(button.getAttribute("data-value"));
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
    this.setAppState('loading');

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

      // Afficher notification de succès
      window.notifications?.success(
        'Synchronisation réussie',
        `${tasks.length} tâche(s) chargée(s)`
      );

      this.setAppState('success');
    } catch (error) {
      console.error("Erreur lors du chargement des tâches:", error);
      this.setAppState('error', error.message);
      
      // Afficher notification d'erreur
      window.notifications?.error(
        'Erreur de chargement',
        'Impossible de charger les tâches du serveur'
      );
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
    let filtered = this.tasks;

    // Filtrage par recherche
    if (this.currentFilters.search) {
      const searchTerm = this.currentFilters.search.toLowerCase();
      filtered = filtered.filter(
        (task) =>
          task.title.toLowerCase().includes(searchTerm) ||
          task.description.toLowerCase().includes(searchTerm) ||
          task.assignee.toLowerCase().includes(searchTerm) ||
          task.tags.some((tag) => tag.toLowerCase().includes(searchTerm))
      );
    }

    // Filtrage par statut
    if (this.currentFilters.statusList.length > 0) {
      filtered = filtered.filter((task) =>
        this.currentFilters.statusList.includes(task.status)
      );
    }

    // Filtrage par priorité
    if (this.currentFilters.priority) {
      filtered = filtered.filter(
        (task) => task.priority === this.currentFilters.priority
      );
    }

    // Filtrage par catégorie
    if (this.currentFilters.category) {
      filtered = filtered.filter(
        (task) => task.category === this.currentFilters.category
      );
    }

    this.filteredTasks = filtered;
    this.renderTasks();
    this.updateFilteredCount();
  }

  // Rendu des tâches avec nouvelle gestion d'état
  renderTasks() {
    const container = document.getElementById("tasks-container");
    
    // Si aucune tâche après filtrage
    if (this.filteredTasks.length === 0) {
      if (this.tasks.length === 0) {
        // Aucune tâche du tout - état vide initial
        this.setAppState('empty');
        this.renderEmptyState();
      } else {
        // Tâches existent mais filtrées - état de filtrage vide
        container.innerHTML = `
          <div class="p-12 text-center">
            <div class="flex flex-col items-center space-y-4">
              <div class="w-16 h-16 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl flex items-center justify-center">
                <i class="fas fa-search text-2xl text-gray-400"></i>
              </div>
              <div class="space-y-2">
                <h3 class="text-lg font-semibold text-gray-700">Aucun résultat</h3>
                <p class="text-gray-500">Aucune tâche ne correspond à vos critères de recherche.</p>
              </div>
              <button
                onclick="taskManager.clearAllFilters()"
                class="btn-modern bg-blue-500 hover:bg-blue-600 text-white px-6 py-3"
              >
                <i class="fas fa-filter mr-2"></i>Effacer les filtres
              </button>
            </div>
          </div>
        `;
        document.getElementById('no-tasks').classList.add('hidden');
      }
      return;
    }

    // Masquer les états d'erreur/vide
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('no-tasks').classList.add('hidden');

    // Rendu des tâches
    container.innerHTML = this.filteredTasks.map(task => this.renderTaskCard(task)).join('');

    // Ajouter les événements de clic
    container.querySelectorAll(".task-card").forEach((card) => {
      card.addEventListener("click", () => {
        const taskId = card.getAttribute("data-task-id");
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
    try {
      const response = await fetch('/api/health');
      if (response.ok) {
        // La connexion est OK, le UX enhancer s'en occupe
        return;
      }
    } catch (error) {
      // Laisser le UX enhancer gérer les erreurs de connexion
      console.log('Connexion check handled by UX enhancer');
    }
  }

  // États possibles de l'application
  appStates = {
    LOADING: 'loading',
    SUCCESS: 'success',
    ERROR: 'error',
    EMPTY: 'empty'
  };

  // Gestion centralisée des états
  setAppState(state, errorMessage = '') {
    // Cacher tous les états
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('no-tasks').classList.add('hidden');
    
    // Supprimer les anciens états d'erreur s'ils existent
    const existingError = document.getElementById('error-state');
    if (existingError) {
      existingError.remove();
    }

    // Appliquer le nouvel état
    switch (state) {
      case this.appStates.LOADING:
        document.getElementById('loading').classList.remove('hidden');
        document.getElementById('tasks-container').innerHTML = '';
        break;
        
      case this.appStates.SUCCESS:
        // État géré par renderTasks()
        break;
        
      case this.appStates.ERROR:
        this.showErrorState(errorMessage);
        break;
        
      case this.appStates.EMPTY:
        document.getElementById('no-tasks').classList.remove('hidden');
        document.getElementById('tasks-container').innerHTML = '';
        break;
    }
  }

  // Nouvel état d'erreur professionnel
  showErrorState(message) {
    const tasksContainer = document.getElementById('tasks-container');
    tasksContainer.innerHTML = `
      <div id="error-state" class="p-12 text-center">
        <div class="flex flex-col items-center space-y-6">
          <div class="w-20 h-20 bg-gradient-to-br from-red-100 to-red-200 rounded-2xl flex items-center justify-center">
            <i class="fas fa-exclamation-triangle text-3xl text-red-500"></i>
          </div>
          <div class="space-y-2">
            <h3 class="text-xl font-semibold text-gray-800">Problème de connexion</h3>
            <p class="text-gray-600 max-w-md">${message || 'Une erreur est survenue lors du chargement des données.'}</p>
          </div>
          <div class="flex flex-col sm:flex-row gap-3">
            <button
              onclick="taskManager.loadTasks()"
              class="btn-modern btn-primary px-6 py-3"
            >
              <i class="fas fa-redo mr-2"></i>Réessayer
            </button>
            <button
              onclick="taskManager.showOfflineHelp()"
              class="btn-modern bg-gray-500 hover:bg-gray-600 text-white px-6 py-3"
            >
              <i class="fas fa-info-circle mr-2"></i>Aide
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // Aide hors ligne
  showOfflineHelp() {
    window.notifications?.info(
      'Mode hors ligne',
      'Vérifiez votre connexion internet et réessayez. Les données seront synchronisées dès que la connexion sera rétablie.'
    );
  }

  // ===== CORRECTION CRITIQUE : ÉTAT VIDE PROFESSIONNEL =====
  
  // Amélioration de l'état vide dans le HTML (remplace "Aucune tâche trouvée")
  renderEmptyState() {
    document.getElementById('no-tasks').innerHTML = `
      <div class="p-12 text-center">
        <div class="flex flex-col items-center space-y-6">
          <div class="w-24 h-24 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-3xl flex items-center justify-center">
            <i class="fas fa-clipboard-check text-4xl text-indigo-500"></i>
          </div>
          <div class="space-y-2">
            <h3 class="text-2xl font-bold text-gray-800">Prêt à organiser vos tâches ?</h3>
            <p class="text-gray-600 max-w-md">Commencez par créer votre première tâche et boostez votre productivité.</p>
          </div>
          <div class="flex flex-col sm:flex-row gap-3">
            <button
              onclick="taskManager.redirectToCreate()"
              class="btn-modern btn-primary px-8 py-4 text-lg"
            >
              <i class="fas fa-plus mr-3"></i>Créer ma première tâche
            </button>
            <button
              onclick="taskManager.showQuickTips()"
              class="btn-modern bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-4"
            >
              <i class="fas fa-lightbulb mr-2"></i>Astuces rapides
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // Astuces rapides pour nouveaux utilisateurs
  showQuickTips() {
    window.notifications?.info(
      'Astuces productivité',
      '💡 Utilisez les raccourcis clavier (? pour voir la liste) et organisez vos tâches par priorité et catégorie.'
    );
  }

  // Méthode pour activer/désactiver tous les statuts
  toggleAllStatus(selectAll) {
    document.querySelectorAll(".toggle-button[data-value]").forEach((button) => {
      button.setAttribute("aria-pressed", selectAll.toString());
      
      if (selectAll) {
        button.classList.remove("inactive");
        button.classList.add("active");
      } else {
        button.classList.remove("active");
        button.classList.add("inactive");
      }
    });
    this.updateStatusFilter();
    this.applyFilters();
  }

  // Redirection vers la page de création
  redirectToCreate() {
    window.location.href = "edit.html";
  }

  // Navigation entre les boutons toggle avec les flèches
  navigateBetweenToggles(currentButton, goNext) {
    const allToggles = Array.from(document.querySelectorAll(".toggle-button[data-value]"));
    const currentIndex = allToggles.indexOf(currentButton);
    
    let nextIndex;
    if (goNext) {
      nextIndex = currentIndex + 1 >= allToggles.length ? 0 : currentIndex + 1;
    } else {
      nextIndex = currentIndex - 1 < 0 ? allToggles.length - 1 : currentIndex - 1;
    }
    
    allToggles[nextIndex].focus();
  }

  // Raccourcis clavier globaux
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Raccourci Ctrl/Cmd + N pour nouvelle tâche
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        this.redirectToCreate();
      }
      
      // Raccourci Ctrl/Cmd + R pour actualiser
      if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault();
        this.loadTasks();
      }
      
      // Raccourci '/' pour focus sur la recherche
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        const searchInput = document.getElementById('search-input');
        if (document.activeElement !== searchInput) {
          e.preventDefault();
          searchInput.focus();
        }
      }
      
      // Échap pour clear la recherche
      if (e.key === 'Escape') {
        const searchInput = document.getElementById('search-input');
        if (document.activeElement === searchInput && searchInput.value) {
          searchInput.value = '';
          this.currentFilters.search = '';
          this.applyFilters();
        } else {
          // Fermer le modal d'aide si ouvert
          const helpModal = document.getElementById('help-modal');
          if (!helpModal.classList.contains('hidden')) {
            this.hideHelpModal();
          }
        }
      }
      
      // F1 ou ? pour afficher l'aide
      if (e.key === 'F1' || (e.key === '?' && !e.ctrlKey && !e.metaKey)) {
        e.preventDefault();
        this.showHelpModal();
      }
    });
  }

  // Afficher le modal d'aide
  showHelpModal() {
    const modal = document.getElementById('help-modal');
    const closeBtn = document.getElementById('close-help-btn');
    
    modal.classList.remove('hidden');
    closeBtn.focus(); // Focus sur le bouton fermer pour l'accessibilité
    
    // Piéger le focus dans le modal
    this.trapFocusInModal(modal);
  }

  // Masquer le modal d'aide
  hideHelpModal() {
    const modal = document.getElementById('help-modal');
    const helpBtn = document.getElementById('help-btn');
    
    modal.classList.add('hidden');
    helpBtn.focus(); // Retourner le focus au bouton d'aide
  }

  // Piéger le focus dans un modal (trap focus)
  trapFocusInModal(modal) {
    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          // Shift + Tab
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    });
  }

  // ===== NOUVELLES MÉTHODES UX =====
  
  // Intégration avec les systèmes UX
  setupUXIntegration() {
    // Écouter l'événement refresh demandé par l'UX enhancer
    window.addEventListener('refresh-requested', () => {
      this.loadTasks();
    });

    // Notification de bienvenue après le chargement initial
    window.addEventListener('load', () => {
      setTimeout(() => {
        if (window.notifications && this.tasks.length === 0) {
          window.notifications.info(
            'Bienvenue !',
            'Créez votre première tâche pour commencer',
            {
              onClick: () => this.redirectToCreate(),
              actions: [
                {
                  label: 'Créer une tâche',
                  handler: () => this.redirectToCreate(),
                  className: 'bg-emerald-500 hover:bg-emerald-600 text-white'
                }
              ]
            }
          );
        }
      }, 2000);
    });
  }

  // Nouvelle méthode pour effacer tous les filtres
  clearAllFilters() {
    // Réinitialiser les filtres
    this.currentFilters = {
      search: "",
      statusList: ["À faire", "En cours"], // Valeurs par défaut
      priority: "",
      category: "",
    };

    // Réinitialiser les champs du formulaire
    document.getElementById("search-input").value = "";
    document.getElementById("priority-filter").value = "";
    document.getElementById("category-filter").value = "";

    // Réinitialiser les boutons toggle
    this.initializeToggleButtons();

    // Réappliquer les filtres
    this.applyFilters();

    // Notification
    window.notifications?.info(
      'Filtres effacés',
      'Tous les filtres ont été réinitialisés.'
    );
  }

  // Mise à jour du compteur de tâches filtrées
  updateFilteredCount() {
    const countElement = document.getElementById("filtered-count");
    if (countElement) {
      countElement.textContent = this.filteredTasks.length;
    }
  }
}

// Initialisation de l'application au chargement de la page
document.addEventListener("DOMContentLoaded", () => {
  window.taskManager = new TaskManager();
});
