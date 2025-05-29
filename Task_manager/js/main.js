// Application principale Task Manager avec système d'accordéon
class TaskManager {
  constructor() {
    this.tasks = [];
    this.filteredTasks = [];
    this.currentFilters = {
      search: "",
      statusList: ["À faire", "En cours"], // Par défaut, afficher seulement "À faire" et "En cours"
      priority: "",
      category: "",
      assignee: ""
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

      // Charger les tâches
      await this.loadTasks();
      this.updateConnectionStatus();

      // Initialiser les filtres
      this.initializeFilters();

      // Initialiser les raccourcis clavier
      this.initializeKeyboardShortcuts();

      // Rendre filterTasks disponible globalement
      window.filterTasks = () => this.applyFilters();

      console.log("✅ Task Manager initialisé avec succès!");
    } catch (error) {
      console.error("❌ Erreur lors de l'initialisation:", error);
      this.setAppState('error', 'Erreur lors du chargement de l\'application');
    }
  }

  // Configuration des événements
  setupEventListeners() {
    // Événements pour les filtres (champs de recherche synchronisés par l'accordéon)
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

    document.getElementById("assignee-filter")?.addEventListener("input", (e) => {
      this.currentFilters.assignee = e.target.value;
      this.applyFilters();
    });

    // Gestion des sélecteurs de tri
    document.getElementById("sort-select")?.addEventListener("change", (e) => {
      this.currentSort = e.target.value;
      this.applyFilters();
    });

    // Boutons d'action
    document.getElementById("refresh-btn")?.addEventListener("click", () => {
      this.loadTasks();
    });

    // Event listener pour le bouton nouvelle tâche
    document.getElementById("new-task-btn")?.addEventListener("click", () => {
      this.redirectToCreate();
    });

    // Event listener pour le bouton d'aide
    document.getElementById("help-btn")?.addEventListener("click", () => {
      this.showHelpModal();
    });

    // Event listeners pour le modal d'aide
    document.getElementById("close-help-btn")?.addEventListener("click", () => {
      this.hideHelpModal();
    });

    document.getElementById("close-help-modal-btn")?.addEventListener("click", () => {
      this.hideHelpModal();
    });

    // Fermer le modal d'aide avec Escape
    document.getElementById("help-modal")?.addEventListener("click", (e) => {
      if (e.target === e.currentTarget) {
        this.hideHelpModal();
      }
    });

    // Gestion des boutons de statut (nouveau système)
    document.querySelectorAll('.status-filter-btn').forEach((button) => {
      button.addEventListener("click", () => {
        this.updateStatusFilter();
        this.applyFilters();
      });
      
      // Gestion du clavier (Enter et Space)
      button.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          // Le toggle est géré par le script d'accordéon
        }
      });
    });

    // Gestion des raccourcis clavier globaux
    this.setupKeyboardShortcuts();
  }

  // Mettre à jour le filtre de statut basé sur les boutons
  updateStatusFilter() {
    const checkedStatuses = Array.from(document.querySelectorAll('.status-filter-btn.active'))
      .map(button => button.getAttribute('data-status'));
    this.currentFilters.statusList = checkedStatuses;
  }

  // Configuration de l'auto-refresh
  setupAutoRefresh() {
    setInterval(() => {
      this.loadTasks();
    }, 30000); // Refresh toutes les 30 secondes
  }

  // Charger les tâches depuis l'API
  async loadTasks() {
    this.setAppState('loading');
    
    try {
      const response = await fetch('/api/tasks');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      this.tasks = await response.json();
      this.applyFilters();
      this.setAppState('success');
      
    } catch (error) {
      console.error('Erreur lors du chargement des tâches:', error);
      this.setAppState('error', 'Impossible de charger les tâches');
    }
  }

  // Appliquer les filtres et le tri
  applyFilters() {
    let filtered = [...this.tasks];

    // Filtre de recherche
    if (this.currentFilters.search) {
      const searchLower = this.currentFilters.search.toLowerCase();
      filtered = filtered.filter(task => 
        task.title?.toLowerCase().includes(searchLower) ||
        task.description?.toLowerCase().includes(searchLower) ||
        (task.tags && task.tags.some(tag => tag.toLowerCase().includes(searchLower)))
      );
    }

    // Filtre de statut
    if (this.currentFilters.statusList.length > 0) {
      filtered = filtered.filter(task => 
        this.currentFilters.statusList.includes(task.status)
      );
    }

    // Filtre de priorité
    if (this.currentFilters.priority) {
      filtered = filtered.filter(task => task.priority === this.currentFilters.priority);
    }

    // Filtre de catégorie
    if (this.currentFilters.category) {
      filtered = filtered.filter(task => task.category === this.currentFilters.category);
    }

    // Filtre d'assigné
    if (this.currentFilters.assignee) {
      const assigneeLower = this.currentFilters.assignee.toLowerCase();
      filtered = filtered.filter(task => 
        task.assignee?.toLowerCase().includes(assigneeLower)
      );
    }

    // Tri
    if (this.currentSort) {
      filtered = this.sortTasks(filtered, this.currentSort);
    }

    this.filteredTasks = filtered;
    this.renderTasks();
    this.updateFilteredCount();
  }

  // Tri des tâches
  sortTasks(tasks, sortBy) {
    const [field, direction] = sortBy.split('-');
    
    return tasks.sort((a, b) => {
      let valueA = a[field];
      let valueB = b[field];

      // Gestion spéciale pour les dates
      if (field === 'createdAt' || field === 'dueDate') {
        valueA = new Date(valueA);
        valueB = new Date(valueB);
      }

      // Gestion spéciale pour la priorité
      if (field === 'priority') {
        const priorityOrder = { 'Haute': 3, 'Moyenne': 2, 'Basse': 1 };
        valueA = priorityOrder[valueA] || 0;
        valueB = priorityOrder[valueB] || 0;
      }

      // Tri
      if (valueA < valueB) {
        return direction === 'asc' ? -1 : 1;
      }
      if (valueA > valueB) {
        return direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }

  // Rendu des tâches
  renderTasks() {
    const container = document.getElementById('tasks-container');
    if (!container) return;

    if (this.filteredTasks.length === 0) {
      this.renderEmptyState();
      return;
    }

    container.innerHTML = this.filteredTasks.map(task => this.renderTaskCard(task)).join('');
  }

  // Rendu d'une carte de tâche
  renderTaskCard(task) {
    const statusColors = {
      'À faire': 'border-blue-200 bg-blue-50',
      'En cours': 'border-orange-200 bg-orange-50',
      'Terminée': 'border-green-200 bg-green-50',
      'En attente': 'border-purple-200 bg-purple-50',
      'Annulée': 'border-gray-200 bg-gray-50'
    };

    const priorityColors = {
      'Haute': 'text-red-600 bg-red-100',
      'Moyenne': 'text-orange-600 bg-orange-100',
      'Basse': 'text-green-600 bg-green-100'
    };

    const statusColor = statusColors[task.status] || 'border-gray-200 bg-gray-50';
    const priorityColor = priorityColors[task.priority] || 'text-gray-600 bg-gray-100';

    return `
      <div class="task-card bg-white border-2 ${statusColor} rounded-xl p-6 hover:shadow-lg transition-all duration-200 cursor-pointer shadow-sm"
           onclick="window.location.href='/edit.html?id=${task._id}'"
           data-task-id="${task._id}">
        <div class="flex justify-between items-start mb-4">
          <h3 class="text-lg font-semibold text-gray-900 line-clamp-2">${task.title || 'Titre non défini'}</h3>
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${priorityColor}">
            ${task.priority || 'Non définie'}
          </span>
        </div>
        
        <p class="text-gray-600 mb-4 line-clamp-3">${task.description || 'Aucune description'}</p>
        
        <div class="flex justify-between items-center">
          <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">
            ${task.status || 'Non défini'}
          </span>
          <span class="text-sm text-gray-500">
            ${task.category || 'Non catégorisé'}
          </span>
        </div>
        
        ${task.assignee ? `
          <div class="mt-3 text-sm text-gray-500">
            Assigné à: ${task.assignee}
          </div>
        ` : ''}
        
        ${task.dueDate ? `
          <div class="mt-2 text-sm text-gray-500">
            Échéance: ${new Date(task.dueDate).toLocaleDateString('fr-FR')}
          </div>
        ` : ''}
      </div>
    `;
  }

  // État vide
  renderEmptyState() {
    const container = document.getElementById('tasks-container');
    if (!container) return;

    container.innerHTML = `
      <div class="text-center py-8">
        <i class="fas fa-inbox text-6xl text-gray-300 mb-4"></i>
        <h3 class="text-xl font-semibold text-gray-500 mb-2">Aucune tâche trouvée</h3>
        <p class="text-gray-400 mb-6">Aucune tâche ne correspond aux critères de recherche.</p>
        <button onclick="document.getElementById('clear-filters-btn').click()" 
                class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          Effacer les filtres
        </button>
      </div>
    `;
  }

  // Mettre à jour le compteur de résultats filtrés
  updateFilteredCount() {
    const countElement = document.getElementById('filter-count');
    if (countElement) {
      const total = this.tasks.length;
      const filtered = this.filteredTasks.length;
      countElement.textContent = `${filtered} sur ${total} tâche(s)`;
    }
  }

  // Redirection vers la création
  redirectToCreate() {
    window.location.href = '/edit.html';
  }

  // Initialiser les filtres
  initializeFilters() {
    // Les boutons sont initialisés dans le script d'accordéon
    this.updateStatusFilter();
    this.applyFilters();
  }

  // États de l'application
  appStates = {
    loading: 'Chargement des tâches...',
    success: '',
    error: 'Une erreur est survenue',
    empty: 'Aucune tâche disponible'
  };

  setAppState(state, errorMessage = '') {
    const loadingEl = document.getElementById('loading');
    const tasksContainerEl = document.getElementById('tasks-container');
    const noTasksEl = document.getElementById('no-tasks');

    // Cacher tous les éléments
    [loadingEl, noTasksEl].forEach(el => {
      if (el) el.classList.add('hidden');
    });

    switch (state) {
      case 'loading':
        if (loadingEl) loadingEl.classList.remove('hidden');
        break;
      case 'success':
        if (tasksContainerEl) {
          // Afficher le conteneur de tâches
          tasksContainerEl.style.display = 'block';
        }
        break;
      case 'error':
        if (noTasksEl) {
          noTasksEl.classList.remove('hidden');
          // Modifier le contenu pour afficher l'erreur
          noTasksEl.innerHTML = `
            <div class="flex flex-col items-center space-y-4">
              <div class="w-20 h-20 bg-gradient-to-br from-red-200 to-red-300 rounded-2xl flex items-center justify-center">
                <i class="fas fa-exclamation-triangle text-3xl text-red-500"></i>
              </div>
              <p class="text-xl font-semibold text-red-600">Erreur</p>
              <p class="text-secondary">${errorMessage || this.appStates.error}</p>
              <button
                onclick="window.taskManager.loadTasks()"
                class="btn-modern btn-primary px-6 py-3 mt-4"
              >
                <i class="fas fa-sync-alt mr-2"></i>Réessayer
              </button>
            </div>
          `;
        }
        break;
      case 'empty':
        if (noTasksEl) {
          noTasksEl.classList.remove('hidden');
          // Remettre le contenu original pour l'état vide
          noTasksEl.innerHTML = `
            <div class="flex flex-col items-center space-y-4">
              <div class="w-20 h-20 bg-gradient-to-br from-gray-200 to-gray-300 rounded-2xl flex items-center justify-center">
                <i class="fas fa-inbox text-3xl text-gray-400"></i>
              </div>
              <p class="text-xl font-semibold text-primary">Aucune tâche trouvée</p>
              <p class="text-secondary">Ajustez vos filtres ou créez une nouvelle tâche</p>
              <button
                onclick="document.getElementById('new-task-btn').click()"
                class="btn-modern btn-primary px-6 py-3 mt-4"
              >
                <i class="fas fa-plus mr-2"></i>Créer une tâche
              </button>
            </div>
          `;
        }
        break;
    }
  }

  // Placeholder pour les autres méthodes requises
  async updateConnectionStatus() {
    // Logique de vérification de connexion
  }

  initPerformanceOptimizations() {
    // Optimisations de performance
  }

  enhanceAccessibility() {
    // Améliorations d'accessibilité
  }

  initializeKeyboardShortcuts() {
    // Méthode appelée pour initialiser les raccourcis clavier
    this.setupKeyboardShortcuts();
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Vérifier si on n'est pas dans un champ de saisie
      const isInputField = e.target.tagName === 'INPUT' || 
                          e.target.tagName === 'TEXTAREA' || 
                          e.target.isContentEditable;

      // Ctrl+N : Nouvelle tâche
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        this.redirectToCreate();
      }

      // Ctrl+R : Actualiser
      if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        this.loadTasks();
      }

      // F1 : Aide
      if (e.key === 'F1') {
        e.preventDefault();
        this.showHelpModal();
      }

      // Escape : Fermer les modals
      if (e.key === 'Escape') {
        const helpModal = document.getElementById('help-modal');
        if (helpModal && !helpModal.classList.contains('hidden')) {
          this.hideHelpModal();
        }
      }

      // / : Focus sur la recherche (seulement si pas dans un champ)
      if (e.key === '/' && !isInputField) {
        e.preventDefault();
        const searchField = document.getElementById('search-compact') || 
                           document.getElementById('search-input');
        if (searchField) {
          searchField.focus();
        }
      }

      // Escape : Effacer la recherche si dans un champ de recherche
      if (e.key === 'Escape' && isInputField) {
        if (e.target.id === 'search-compact' || e.target.id === 'search-input') {
          e.target.value = '';
          e.target.blur();
          this.currentFilters.search = '';
          this.applyFilters();
        }
      }
    });
  }

  showHelpModal() {
    const modal = document.getElementById('help-modal');
    if (modal) {
      modal.classList.remove('hidden');
      // Focus sur le modal pour l'accessibilité
      modal.focus();
      // Trap focus dans le modal
      this.trapFocusInModal(modal);
    }
  }

  hideHelpModal() {
    const modal = document.getElementById('help-modal');
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  // Fonction pour capturer le focus dans le modal
  trapFocusInModal(modal) {
    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    // Focus sur le premier élément
    if (firstElement) {
      firstElement.focus();
    }

    // Gérer la navigation par tabulation
    modal.addEventListener('keydown', function(e) {
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          // Shift + Tab (navigation vers l'arrière)
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab (navigation vers l'avant)
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
      
      // Fermer avec Escape
      if (e.key === 'Escape') {
        e.preventDefault();
        window.taskManager.hideHelpModal();
      }
    });
  }
}

// Initialiser l'application quand le DOM est prêt
document.addEventListener('DOMContentLoaded', () => {
  window.taskManager = new TaskManager();
});