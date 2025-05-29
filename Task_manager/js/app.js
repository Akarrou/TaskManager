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
    console.log("🚀 Initialisation Task Manager...");

    try {
      // Initialiser les notifications
      window.notifications = new NotificationSystem();

      // Optimisations de performance et accessibilité
      this.initPerformanceOptimizations();
      this.enhanceAccessibility();

      // Configuration des événements
    this.setupEventListeners();
    this.setupAutoRefresh();
    
    // Écouter les événements UX
    this.setupUXIntegration();
    
      // Charger les tâches
    await this.loadTasks();
    this.updateConnectionStatus();

      // Initialiser les filtres
      this.initializeFilters();

      // Initialiser les raccourcis clavier
      this.initializeKeyboardShortcuts();

      // Initialiser les boutons toggle
      this.initializeToggleButtons();

      console.log("✅ Task Manager initialisé avec succès!");
    } catch (error) {
      console.error("❌ Erreur lors de l'initialisation:", error);
      this.setAppState('error', 'Erreur lors du chargement de l\'application');
    }
  }

  // Configuration des événements
  setupEventListeners() {
    // Événements pour les filtres
    document.getElementById("search-input")?.addEventListener("input", (e) => {
      this.currentFilters.search = e.target.value;
      this.applyFilters();
    });

    document.getElementById("priority-filter")?.addEventListener("change", (e) => {
      this.currentFilters.priority = e.target.value;
      this.applyFilters();
    });

    document.getElementById("category-filter")?.addEventListener("change", (e) => {
      this.currentFilters.category = e.target.value;
      this.applyFilters();
    });

    // Boutons d'action
    document.getElementById("refresh-btn")?.addEventListener("click", () => {
      this.loadTasks();
    });

    document.getElementById("select-all-btn")?.addEventListener("click", () => {
      this.selectAllTasks();
    });

    document.getElementById("deselect-all-btn")?.addEventListener("click", () => {
      this.deselectAllTasks();
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

  // Configuration de l'auto-refresh
  setupAutoRefresh() {
    setInterval(() => {
      this.loadTasks();
    }, 30000); // Refresh toutes les 30 secondes
  }

  // Configuration UX
  setupUXIntegration() {
    // Intégration avec le système de notifications
    // et autres événements UX
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

  // Mise à jour du compteur de tâches filtrées
  updateFilteredCount() {
    const countElement = document.getElementById("filtered-count");
    if (countElement) {
      countElement.textContent = this.filteredTasks.length;
    }
  }

  // Optimisations de performance et accessibilité
  initPerformanceOptimizations() {
    // Gestion des animations réduites pour l'accessibilité
    this.handleReducedMotion();
    
    // Lazy loading des images (si présentes)
    this.initLazyLoading();
    
    // Throttling pour les events de scroll/resize
    this.initThrottledEvents();
    
    // Preload des ressources critiques
    this.preloadCriticalResources();
    
    // Optimisation du rendering avec RequestAnimationFrame
    this.initOptimizedRendering();
  }

  // Gestion des préférences d'animation
  handleReducedMotion() {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    
    const toggleAnimations = (e) => {
      if (e.matches) {
        document.documentElement.style.setProperty('--animation-duration', '0.01ms');
        document.documentElement.style.setProperty('--transition-duration', '0.01ms');
      } else {
        document.documentElement.style.removeProperty('--animation-duration');
        document.documentElement.style.removeProperty('--transition-duration');
      }
    };
    
    prefersReducedMotion.addEventListener('change', toggleAnimations);
    toggleAnimations(prefersReducedMotion);
  }

  // Lazy loading optimisé
  initLazyLoading() {
    if ('IntersectionObserver' in window) {
      const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            img.src = img.dataset.src;
            img.classList.remove('lazy');
            observer.unobserve(img);
          }
        });
      });

      document.querySelectorAll('img[data-src]').forEach(img => {
        imageObserver.observe(img);
      });
    }
  }

  // Throttling des événements performance-sensitive
  initThrottledEvents() {
    let ticking = false;
    
    const throttledScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          this.updateScrollIndicators();
          ticking = false;
        });
        ticking = true;
      }
    };
    
    const throttledResize = this.debounce(() => {
      this.handleViewportChange();
    }, 250);
    
    window.addEventListener('scroll', throttledScroll, { passive: true });
    window.addEventListener('resize', throttledResize, { passive: true });
  }

  // Debounce helper
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Preload des ressources critiques
  preloadCriticalResources() {
    // Preload des fonts si nécessaire
    const fontLink = document.createElement('link');
    fontLink.rel = 'preload';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
    fontLink.as = 'style';
    fontLink.crossOrigin = 'anonymous';
    document.head.appendChild(fontLink);
  }

  // Optimisation du rendering
  initOptimizedRendering() {
    // Virtual scrolling pour de grandes listes (si nécessaire)
    this.setupVirtualScrolling();
    
    // Batch des mises à jour DOM
    this.batchedUpdates = [];
    this.isUpdating = false;
  }

  // Virtual scrolling (basique)
  setupVirtualScrolling() {
    const taskContainer = document.querySelector('.task-list');
    if (!taskContainer) return;
    
    // Implémentation simplifiée - à étendre si beaucoup de tâches
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-viewport');
        } else {
          entry.target.classList.remove('in-viewport');
        }
      });
    }, {
      rootMargin: '50px'
    });
    
    // Observer toutes les tâches
    taskContainer.querySelectorAll('.task-item').forEach(task => {
      observer.observe(task);
    });
  }

  // Batch des mises à jour DOM
  batchDOMUpdates(updateFunction) {
    this.batchedUpdates.push(updateFunction);
    
    if (!this.isUpdating) {
      this.isUpdating = true;
      requestAnimationFrame(() => {
        this.batchedUpdates.forEach(update => update());
        this.batchedUpdates = [];
        this.isUpdating = false;
      });
    }
  }

  // Mise à jour des indicateurs de scroll
  updateScrollIndicators() {
    const scrolled = window.pageYOffset;
    const maxHeight = document.documentElement.scrollHeight - window.innerHeight;
    const scrollPercent = Math.min(scrolled / maxHeight, 1);
    
    // Mettre à jour la barre de progression si elle existe
    const progressBar = document.querySelector('.scroll-progress');
    if (progressBar) {
      progressBar.style.transform = `scaleX(${scrollPercent})`;
    }
  }

  // Gestion des changements de viewport
  handleViewportChange() {
    // Recalculer les dimensions pour la responsivité
    const isMobile = window.innerWidth < 768;
    document.documentElement.classList.toggle('mobile-view', isMobile);
    
    // Optimiser l'affichage selon la taille
    this.optimizeForViewport(isMobile);
  }

  // Optimisation selon le viewport
  optimizeForViewport(isMobile) {
    const taskItems = document.querySelectorAll('.task-item');
    
    if (isMobile) {
      // Désactiver certaines animations coûteuses sur mobile
      taskItems.forEach(item => {
        item.style.willChange = 'auto';
      });
    } else {
      // Réactiver les animations sur desktop
      taskItems.forEach(item => {
        item.style.willChange = 'transform';
      });
    }
  }

  // Améliorations d'accessibilité
  enhanceAccessibility() {
    // Gestion du focus avec skip links
    this.addSkipLinks();
    
    // ARIA live regions pour les mises à jour
    this.setupLiveRegions();
    
    // Gestion des raccourcis clavier
    this.enhanceKeyboardNavigation();
    
    // Améliorer les annonces screen reader
    this.improveScreenReaderAnnouncements();
  }

  // Ajouter des skip links
  addSkipLinks() {
    const skipLink = document.createElement('a');
    skipLink.href = '#main-content';
    skipLink.className = 'skip-link sr-only focus:not-sr-only';
    skipLink.textContent = 'Aller au contenu principal';
    skipLink.style.cssText = `
      position: absolute;
      top: -40px;
      left: 6px;
      background: var(--primary-color);
      color: white;
      padding: 8px;
      text-decoration: none;
      border-radius: 4px;
      z-index: 1000;
      transition: top 0.3s;
    `;
    
    skipLink.addEventListener('focus', () => {
      skipLink.style.top = '6px';
    });
    
    skipLink.addEventListener('blur', () => {
      skipLink.style.top = '-40px';
    });
    
    document.body.insertBefore(skipLink, document.body.firstChild);
  }

  // Configuration des live regions
  setupLiveRegions() {
    // Région pour les notifications
    let liveRegion = document.getElementById('live-region');
    if (!liveRegion) {
      liveRegion = document.createElement('div');
      liveRegion.id = 'live-region';
      liveRegion.setAttribute('aria-live', 'polite');
      liveRegion.setAttribute('aria-atomic', 'true');
      liveRegion.className = 'sr-only';
      document.body.appendChild(liveRegion);
    }
    
    // Région pour les status urgents
    let assertiveRegion = document.getElementById('assertive-region');
    if (!assertiveRegion) {
      assertiveRegion = document.createElement('div');
      assertiveRegion.id = 'assertive-region';
      assertiveRegion.setAttribute('aria-live', 'assertive');
      assertiveRegion.setAttribute('aria-atomic', 'true');
      assertiveRegion.className = 'sr-only';
      document.body.appendChild(assertiveRegion);
    }
  }

  // Améliorations navigation clavier
  enhanceKeyboardNavigation() {
    // Gestion des flèches pour naviguer dans les listes
    document.addEventListener('keydown', (e) => {
      if (e.target.closest('.task-list')) {
        this.handleTaskListNavigation(e);
      }
    });
  }

  // Navigation dans la liste des tâches
  handleTaskListNavigation(e) {
    const currentTask = e.target.closest('.task-item');
    if (!currentTask) return;
    
    const allTasks = Array.from(document.querySelectorAll('.task-item'));
    const currentIndex = allTasks.indexOf(currentTask);
    
    let nextTask = null;
    
    switch(e.key) {
      case 'ArrowDown':
        e.preventDefault();
        nextTask = allTasks[currentIndex + 1];
        break;
      case 'ArrowUp':
        e.preventDefault();
        nextTask = allTasks[currentIndex - 1];
        break;
      case 'Home':
        e.preventDefault();
        nextTask = allTasks[0];
        break;
      case 'End':
        e.preventDefault();
        nextTask = allTasks[allTasks.length - 1];
        break;
    }
    
    if (nextTask) {
      nextTask.focus();
      this.announceToScreenReader(`Tâche ${allTasks.indexOf(nextTask) + 1} de ${allTasks.length}`);
    }
  }

  // Améliorations pour les screen readers
  improveScreenReaderAnnouncements() {
    // Annoncer les changements de filtres
    const originalApplyFilters = this.applyFilters.bind(this);
    this.applyFilters = function(...args) {
      const result = originalApplyFilters.apply(this, args);
      
      const filteredCount = this.filteredTasks.length;
      const totalCount = this.tasks.length;
      
      this.announceToScreenReader(
        `Filtres appliqués. ${filteredCount} tâche(s) affichée(s) sur ${totalCount} au total.`
      );
      
      return result;
    };
  }

  // Annoncer aux screen readers
  announceToScreenReader(message, urgent = false) {
    const region = urgent ? 
      document.getElementById('assertive-region') : 
      document.getElementById('live-region');
    
    if (region) {
      region.textContent = message;
      
      // Nettoyer après annonce
      setTimeout(() => {
        region.textContent = '';
      }, 1000);
    }
  }
}

// Initialisation de l'application au chargement de la page
document.addEventListener("DOMContentLoaded", () => {
  window.taskManager = new TaskManager();
});
