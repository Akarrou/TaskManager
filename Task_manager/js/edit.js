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
      this.showError("Aucun ID de tâche spécifié");
      return;
    }

    await this.loadTask();
    this.setupEventListeners();
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
      saveBtn.innerHTML =
        '<i class="fas fa-spinner fa-spin mr-2"></i>Sauvegarde...';

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

      // Envoyer la mise à jour
      const updatedTask = await api.updateTask(this.taskId, taskData);

      // Mettre à jour les données originales
      this.originalTask = { ...updatedTask };
      this.currentTasks = [...(updatedTask.tasks || [])];

      // Mettre à jour l'affichage
      this.updateTaskInfo(updatedTask);

      this.showSuccessMessage("Tâche mise à jour avec succès");
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      this.showError("Erreur lors de la sauvegarde de la tâche");
    } finally {
      // Réactiver le bouton
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Sauvegarder';
    }
  }

  // Validation du formulaire
  validateForm(taskData) {
    if (!taskData.title) {
      this.showError("Le titre est obligatoire");
      document.getElementById("edit-title").focus();
      return false;
    }

    if (!taskData.description) {
      this.showError("La description est obligatoire");
      document.getElementById("edit-description").focus();
      return false;
    }

    if (!taskData.assignee) {
      this.showError("L'assigné est obligatoire");
      document.getElementById("edit-assignee").focus();
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
}

// Initialiser l'éditeur au chargement de la page
document.addEventListener("DOMContentLoaded", () => {
  window.taskEditor = new TaskEditor();
});
