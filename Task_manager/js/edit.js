// Application d'édition de tâches
class TaskEditor {
  constructor() {
    this.taskId = this.getTaskIdFromUrl();
    this.originalTask = null;
    this.currentTasks = []; // Pour gérer les sous-tâches
    this.init();
  }

  // Récupérer l'ID de la tâche depuis l'URL
  getTaskIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get("id");
  }

  // Initialisation
  async init() {
    if (!this.taskId) {
      // Mode création : pas d'ID fourni
      this.setupNewTaskMode();
    } else {
      // Mode édition : ID fourni
      await this.loadTask();
    }
    
    this.setupEventListeners();
  }

  // Configuration pour la création d'une nouvelle tâche
  setupNewTaskMode() {
    // Définir un objet tâche vide avec des valeurs par défaut
    const today = new Date().toISOString().split('T')[0];
    this.originalTask = {
      title: "",
      description: "",
      status: "À faire",
      priority: "Moyenne", 
      category: "Fullstack",
      assignee: "",
      dueDate: today,
      tags: [],
      tasks: [],
      problem: "",
      objective: "",
      source_file: "web-interface.mdc"
    };
    
    this.currentTasks = [];
    this.populateForm(this.originalTask);
    this.showEditForm();
    this.showLoading(false); // Arrêter le spinner de chargement
    
    // Mettre à jour le titre de la page pour indiquer qu'on crée une nouvelle tâche
    document.title = window.PROJECT_NAME + " - Créer une nouvelle tâche";
    const pageTitle = document.querySelector('h1');
    if (pageTitle) {
      pageTitle.innerHTML = '<i class="fas fa-plus text-blue-600 mr-2"></i>Créer une nouvelle tâche';
    }
    
    // Masquer les informations système puisqu'il n'y en a pas encore
    const taskInfo = document.getElementById("task-info");
    if (taskInfo) {
      taskInfo.style.display = "none";
    }
  }

  // Chargement de la tâche
  async loadTask() {
    try {
      this.showLoading(true);

      const task = await api.getTask(this.taskId);
      if (!task) {
        this.showError("Tâche introuvable");
        return;
      }

      this.originalTask = { ...task };
      this.currentTasks = [...(task.tasks || [])];
      this.populateForm(task);
      this.showEditForm();
      
      // Afficher le bouton de suppression en mode édition
      const deleteBtn = document.getElementById("delete-btn");
      if (deleteBtn) {
        deleteBtn.classList.remove("hidden");
      }
    } catch (error) {
      console.error("Erreur lors du chargement de la tâche:", error);
      this.showError("Erreur lors du chargement de la tâche");
    } finally {
      this.showLoading(false);
    }
  }

  // Remplir le formulaire avec les données de la tâche
  populateForm(task) {
    // Remplir les champs de base
    document.getElementById("edit-title").value = task.title;
    document.getElementById("edit-description").value = task.description;
    document.getElementById("edit-status").value = task.status;
    document.getElementById("edit-priority").value = task.priority;
    document.getElementById("edit-category").value = task.category;
    document.getElementById("edit-assignee").value = task.assignee;
    document.getElementById("edit-dueDate").value = task.dueDate || "";
    document.getElementById("edit-tags").value = task.tags.join(", ");

    // Remplir les nouveaux champs
    document.getElementById("edit-problem").value = task.problem || "";
    document.getElementById("edit-objective").value = task.objective || "";
    document.getElementById("edit-source-file").value = task.source_file || "";

    // Mettre à jour le badge de statut
    this.updateStatusBadge(task.status);

    // Mettre à jour les informations système
    this.updateTaskInfo(task);

    // Afficher les sous-tâches
    this.renderTasks();
  }

  // Afficher les sous-tâches
  renderTasks() {
    const container = document.getElementById("tasks-container");

    if (this.currentTasks.length === 0) {
      container.innerHTML =
        '<p class="text-gray-500 italic">Aucune sous-tâche définie</p>';
      return;
    }

    container.innerHTML = this.currentTasks
      .map(
        (task, index) => `
        <div class="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
          <span class="flex-1 text-sm">${task}</span>
          <button type="button" 
                  onclick="window.taskEditor.removeTask(${index})"
                  class="px-2 py-1 text-red-500 hover:bg-red-100 rounded transition-colors">
            <i class="fas fa-trash text-xs"></i>
          </button>
        </div>
      `
      )
      .join("");
  }

  // Ajouter une sous-tâche
  addTask() {
    const input = document.getElementById("new-task-input");
    const taskText = input.value.trim();

    if (!taskText) return;

    this.currentTasks.push(taskText);
    input.value = "";
    this.renderTasks();
  }

  // Supprimer une sous-tâche
  removeTask(index) {
    this.currentTasks.splice(index, 1);
    this.renderTasks();
  }

  // Mettre à jour le badge de statut
  updateStatusBadge(status) {
    const badge = document.getElementById("task-status-badge");
    const statusColor = CONFIG.STATUS_COLORS[status] || "gray";

    badge.className = `status-badge bg-${statusColor}-100 text-${statusColor}-800`;
    badge.innerHTML = `<i class="fas fa-circle mr-2"></i>${status}`;
  }

  // Mettre à jour les informations système
  updateTaskInfo(task) {
    const taskInfo = document.getElementById("task-info");
    taskInfo.innerHTML = `
      <div>
        <span class="font-medium">Créée le:</span><br>
        ${new Date(task.created_at).toLocaleDateString("fr-FR")} à ${new Date(
      task.created_at
    ).toLocaleTimeString("fr-FR")}
      </div>
      <div>
        <span class="font-medium">Modifiée le:</span><br>
        ${new Date(task.updated_at).toLocaleDateString("fr-FR")} à ${new Date(
      task.updated_at
    ).toLocaleTimeString("fr-FR")}
      </div>
      <div>
        <span class="font-medium">ID:</span> ${task.id}
      </div>
    `;
  }

  // Configuration des événements
  setupEventListeners() {
    // Soumission du formulaire
    const form = document.getElementById("task-edit-form");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.handleSave();
    });

    // Bouton de réinitialisation
    document.getElementById("reset-btn").addEventListener("click", () => {
      this.resetForm();
    });

    // Bouton de suppression
    document.getElementById("delete-btn").addEventListener("click", () => {
      this.showDeleteConfirmation();
    });

    // Modal de confirmation de suppression
    document.getElementById("cancel-delete-btn").addEventListener("click", () => {
      this.hideDeleteConfirmation();
    });

    document.getElementById("confirm-delete-btn").addEventListener("click", () => {
      this.handleDelete();
    });

    // Fermer le modal en cliquant en dehors
    document.getElementById("delete-confirmation-modal").addEventListener("click", (e) => {
      if (e.target.id === "delete-confirmation-modal") {
        this.hideDeleteConfirmation();
      }
    });

    // Gestion du clavier pour le modal de confirmation
    document.addEventListener("keydown", (e) => {
      const modal = document.getElementById("delete-confirmation-modal");
      if (!modal.classList.contains("hidden")) {
        if (e.key === "Escape") {
          this.hideDeleteConfirmation();
        }
      }
    });

    // Mise à jour du badge lors du changement de statut
    document.getElementById("edit-status").addEventListener("change", (e) => {
      this.updateStatusBadge(e.target.value);
    });

    // Gestion des sous-tâches
    document.getElementById("add-task-btn").addEventListener("click", () => {
      this.addTask();
    });

    document
      .getElementById("new-task-input")
      .addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.addTask();
        }
      });
  }

  // Réinitialiser le formulaire avec les valeurs originales
  resetForm() {
    if (this.originalTask) {
      this.currentTasks = [...(this.originalTask.tasks || [])];
      this.populateForm(this.originalTask);
      this.showSuccessMessage("Formulaire réinitialisé");
    }
  }

  // Gestion de la sauvegarde
  async handleSave() {
    const saveBtn = document.getElementById("save-btn");

    try {
      // Désactiver le bouton pendant la sauvegarde
      saveBtn.disabled = true;
      const isCreating = !this.taskId;
      saveBtn.innerHTML = isCreating
        ? '<i class="fas fa-spinner fa-spin mr-2"></i>Création...'
        : '<i class="fas fa-spinner fa-spin mr-2"></i>Sauvegarde...';

      // Récupérer les données du formulaire
      const form = document.getElementById("task-edit-form");
      const formData = new FormData(form);

      const taskData = {
        title: formData.get("title").trim(),
        description: formData.get("description").trim(),
        status: formData.get("status"),
        priority: formData.get("priority"),
        category: formData.get("category"),
        assignee: formData.get("assignee").trim(),
        dueDate: formData.get("dueDate") || null,
        tags: formData.get("tags")
          ? formData
              .get("tags")
              .split(",")
              .map((tag) => tag.trim())
              .filter((tag) => tag)
          : [],
        // Nouveaux champs
        tasks: [...this.currentTasks],
        problem: formData.get("problem").trim(),
        objective: formData.get("objective").trim(),
        source_file: formData.get("source_file").trim(),
      };

      // Validation
      if (!this.validateForm(taskData)) {
        return;
      }

      let result;
      if (isCreating) {
        // Créer une nouvelle tâche
        result = await api.createTask(taskData);
        this.taskId = result.id; // Mettre à jour l'ID pour les futures opérations
        
        // Mettre à jour l'URL pour inclure l'ID
        const newUrl = new URL(window.location);
        newUrl.searchParams.set('id', result.id);
        window.history.replaceState({}, '', newUrl);
        
        // Mettre à jour le titre de la page
        document.title = window.PROJECT_NAME + " - Éditer la tâche #" + result.id;
        const pageTitle = document.querySelector('h1');
        if (pageTitle) {
          pageTitle.innerHTML = '<i class="fas fa-edit text-blue-600 mr-2"></i>Éditer la tâche #' + result.id;
        }
        
        // Afficher les informations système maintenant qu'on a une tâche
        const taskInfo = document.getElementById("task-info");
        if (taskInfo) {
          taskInfo.style.display = "block";
        }
        
        this.showSuccessMessage("Tâche créée avec succès !");
      } else {
        // Mettre à jour une tâche existante
        result = await api.updateTask(this.taskId, taskData);
        this.showSuccessMessage("Tâche mise à jour avec succès");
      }

      // Mettre à jour les données originales
      this.originalTask = { ...result };
      this.currentTasks = [...(result.tasks || [])];

      // Mettre à jour l'affichage
      this.updateTaskInfo(result);

    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      this.showError("Erreur lors de la sauvegarde de la tâche");
    } finally {
      // Réactiver le bouton
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Sauvegarder';
    }
  }

  // Gestion de la suppression avec confirmation
  async handleDelete() {
    if (!this.taskId) {
      this.showError("Impossible de supprimer une tâche non créée");
      return;
    }

    const deleteBtn = document.getElementById("delete-btn");
    const confirmBtn = document.getElementById("confirm-delete-btn");
    const originalText = confirmBtn.innerHTML;

    try {
      // Masquer le modal de confirmation
      this.hideDeleteConfirmation();

      // Désactiver les boutons pendant la suppression
      deleteBtn.disabled = true;
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Suppression...';

      // Supprimer la tâche via l'API
      const taskTitle = this.originalTask?.title || "cette tâche";
      await api.deleteTask(this.taskId);

      // Afficher un message de succès
      this.showSuccessMessage(`Tâche "${taskTitle}" supprimée avec succès !`);

      // Rediriger vers la liste des tâches après un court délai
      setTimeout(() => {
        window.location.href = "/";
      }, 1500);

    } catch (error) {
      console.error("Erreur lors de la suppression de la tâche:", error);
      this.showError(`Erreur lors de la suppression : ${error.message}`);
      
      // Réactiver les boutons
      deleteBtn.disabled = false;
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = originalText;
    }
  }

  // Validation du formulaire
  validateForm(taskData) {
    if (!taskData.title) {
      this.showError("Le titre est obligatoire");
      document.getElementById("edit-title").focus();
      return false;
    }

    return true;
  }

  // Affichage/masquage des éléments
  showLoading(show) {
    const loading = document.getElementById("loading");
    loading.style.display = show ? "block" : "none";
  }

  showEditForm() {
    document.getElementById("edit-container").classList.remove("hidden");
  }

  showError(message) {
    const errorDiv = document.getElementById("error-message");
    const errorText = document.getElementById("error-text");

    errorText.textContent = message;
    errorDiv.classList.remove("hidden");

    // Masquer après 5 secondes
    setTimeout(() => {
      errorDiv.classList.add("hidden");
    }, 5000);
  }

  showSuccessMessage(message) {
    // Créer une notification de succès
    const notification = document.createElement("div");
    notification.className =
      "fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 transition-opacity";
    notification.innerHTML = `
      <div class="flex items-center">
        <i class="fas fa-check-circle mr-2"></i>
        ${message}
      </div>
    `;

    document.body.appendChild(notification);

    // Masquer après 3 secondes
    setTimeout(() => {
      notification.style.opacity = "0";
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 300);
    }, 3000);
  }

  showDeleteConfirmation() {
    // Personnaliser le message de confirmation
    const taskTitle = this.originalTask?.title || "cette tâche";
    const messageElement = document.getElementById("delete-confirmation-message");
    
    messageElement.innerHTML = `
      Êtes-vous sûr de vouloir supprimer la tâche <strong>"${taskTitle}"</strong> ?
      <br><br>
      <span class="text-red-600 font-medium">Cette action est irréversible !</span>
    `;
    
    // Afficher le modal de confirmation
    document.getElementById("delete-confirmation-modal").classList.remove("hidden");
  }

  hideDeleteConfirmation() {
    // Masquer le modal de confirmation
    document.getElementById("delete-confirmation-modal").classList.add("hidden");
  }
}

// Initialiser l'éditeur au chargement de la page
document.addEventListener("DOMContentLoaded", () => {
  window.taskEditor = new TaskEditor();
});
