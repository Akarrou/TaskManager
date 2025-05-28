// Système de notifications modernisé
class NotificationSystem {
  constructor() {
    this.container = document.getElementById('notification-container');
    this.template = document.getElementById('notification-template');
    this.notifications = new Map();
    this.defaultDuration = 5000;
    this.maxNotifications = 5;
    
    this.init();
  }

  init() {
    // Configuration des types de notifications
    this.types = {
      success: {
        icon: 'fas fa-check',
        iconClass: 'notification-success',
        sound: null // Optionnel : ajout de sons
      },
      error: {
        icon: 'fas fa-exclamation-triangle',
        iconClass: 'notification-error',
        sound: null
      },
      warning: {
        icon: 'fas fa-exclamation',
        iconClass: 'notification-warning',
        sound: null
      },
      info: {
        icon: 'fas fa-info',
        iconClass: 'notification-info',
        sound: null
      },
      loading: {
        icon: 'fas fa-spinner fa-spin',
        iconClass: 'notification-info',
        sound: null
      }
    };
  }

  // Créer une notification
  show(type, title, message, options = {}) {
    const id = this.generateId();
    const config = {
      id,
      type,
      title,
      message,
      duration: options.duration || this.defaultDuration,
      persistent: options.persistent || false,
      actions: options.actions || [],
      onClick: options.onClick || null,
      ...options
    };

    // Limiter le nombre de notifications affichées
    this.enforceMaxNotifications();

    const notificationEl = this.createNotificationElement(config);
    this.container.appendChild(notificationEl);
    
    // Stocker la référence
    this.notifications.set(id, {
      element: notificationEl,
      config,
      timer: null
    });

    // Animation d'entrée
    setTimeout(() => {
      notificationEl.querySelector('.notification-toast').classList.add('show');
    }, 10);

    // Auto-dismiss si pas persistant
    if (!config.persistent && config.duration > 0) {
      this.scheduleRemoval(id, config.duration);
    }

    return id;
  }

  // Créer l'élément DOM de la notification
  createNotificationElement(config) {
    const clone = this.template.content.cloneNode(true);
    const toast = clone.querySelector('.notification-toast');
    const typeConfig = this.types[config.type] || this.types.info;

    // Configuration de base
    toast.setAttribute('data-notification-id', config.id);
    toast.querySelector('.card-modern').classList.add(typeConfig.iconClass);
    
    // Icône
    const iconEl = toast.querySelector('.notification-icon-class');
    iconEl.className = `${typeConfig.icon} text-white text-sm`;
    
    // Contenu
    toast.querySelector('.notification-title').textContent = config.title;
    toast.querySelector('.notification-message').textContent = config.message;
    
    // Progress bar pour auto-dismiss
    if (!config.persistent && config.duration > 0) {
      const progressBar = toast.querySelector('.notification-progress');
      progressBar.style.animationDuration = `${config.duration}ms`;
    } else {
      toast.querySelector('.notification-progress').style.display = 'none';
    }

    // Actions
    if (config.actions && config.actions.length > 0) {
      const actionsContainer = toast.querySelector('.notification-actions');
      actionsContainer.classList.remove('hidden');
      
      config.actions.forEach(action => {
        const actionBtn = document.createElement('button');
        actionBtn.className = `px-3 py-1 text-xs font-medium rounded-md transition-colors ${action.className || 'bg-white/20 hover:bg-white/30 text-white'}`;
        actionBtn.textContent = action.label;
        actionBtn.onclick = () => {
          if (action.handler) action.handler();
          if (action.dismissOnClick !== false) this.dismiss(config.id);
        };
        actionsContainer.appendChild(actionBtn);
      });
    }

    // Gestionnaire de fermeture
    const closeBtn = toast.querySelector('.notification-close');
    closeBtn.onclick = () => this.dismiss(config.id);

    // Gestionnaire de clic sur la notification
    if (config.onClick) {
      toast.style.cursor = 'pointer';
      toast.onclick = (e) => {
        if (!e.target.closest('.notification-close') && !e.target.closest('.notification-actions')) {
          config.onClick();
          if (config.dismissOnClick !== false) this.dismiss(config.id);
        }
      };
    }

    // Pause au hover
    toast.addEventListener('mouseenter', () => {
      if (this.notifications.has(config.id)) {
        this.pauseTimer(config.id);
      }
    });

    toast.addEventListener('mouseleave', () => {
      if (this.notifications.has(config.id) && !config.persistent) {
        const notification = this.notifications.get(config.id);
        const remaining = this.getRemainingTime(notification.element);
        if (remaining > 0) {
          this.scheduleRemoval(config.id, remaining);
        }
      }
    });

    return clone;
  }

  // Méthodes de raccourci pour chaque type
  success(title, message, options = {}) {
    return this.show('success', title, message, options);
  }

  error(title, message, options = {}) {
    return this.show('error', title, message, { ...options, duration: options.duration || 7000 });
  }

  warning(title, message, options = {}) {
    return this.show('warning', title, message, options);
  }

  info(title, message, options = {}) {
    return this.show('info', title, message, options);
  }

  loading(title, message, options = {}) {
    return this.show('loading', title, message, { ...options, persistent: true });
  }

  // Fermer une notification
  dismiss(id) {
    if (!this.notifications.has(id)) return;

    const notification = this.notifications.get(id);
    const toast = notification.element.querySelector('.notification-toast');
    
    // Clear timer
    if (notification.timer) {
      clearTimeout(notification.timer);
    }

    // Animation de sortie
    toast.classList.remove('show');
    toast.classList.add('hide');

    // Supprimer après animation
    setTimeout(() => {
      if (notification.element.parentNode) {
        notification.element.parentNode.removeChild(notification.element);
      }
      this.notifications.delete(id);
    }, 300);
  }

  // Fermer toutes les notifications
  dismissAll() {
    this.notifications.forEach((_, id) => {
      this.dismiss(id);
    });
  }

  // Fermer toutes les notifications d'un type
  dismissByType(type) {
    this.notifications.forEach((notification, id) => {
      if (notification.config.type === type) {
        this.dismiss(id);
      }
    });
  }

  // Planifier la suppression automatique
  scheduleRemoval(id, duration) {
    if (!this.notifications.has(id)) return;

    const notification = this.notifications.get(id);
    
    // Clear timer existant
    if (notification.timer) {
      clearTimeout(notification.timer);
    }

    notification.timer = setTimeout(() => {
      this.dismiss(id);
    }, duration);
  }

  // Pause le timer
  pauseTimer(id) {
    if (!this.notifications.has(id)) return;
    
    const notification = this.notifications.get(id);
    if (notification.timer) {
      clearTimeout(notification.timer);
      notification.timer = null;
    }
  }

  // Calculer le temps restant
  getRemainingTime(element) {
    const progressBar = element.querySelector('.notification-progress');
    if (!progressBar) return 0;
    
    const computedStyle = window.getComputedStyle(progressBar);
    const animationDuration = parseFloat(computedStyle.animationDuration) * 1000;
    const transform = computedStyle.transform;
    
    if (transform && transform !== 'none') {
      const matrix = new DOMMatrix(transform);
      const scaleX = matrix.a;
      return animationDuration * scaleX;
    }
    
    return animationDuration;
  }

  // Appliquer la limite de notifications
  enforceMaxNotifications() {
    const notificationElements = this.container.children;
    while (notificationElements.length >= this.maxNotifications) {
      const oldest = notificationElements[0];
      const oldestId = oldest.querySelector('.notification-toast').getAttribute('data-notification-id');
      this.dismiss(oldestId);
    }
  }

  // Générer un ID unique
  generateId() {
    return 'notification_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // Notification avec progress bar custom
  showWithProgress(type, title, message, progressCallback, options = {}) {
    const id = this.show(type, title, message, { ...options, persistent: true });
    const notification = this.notifications.get(id);
    const progressBar = notification.element.querySelector('.notification-progress');
    
    // Désactiver l'animation par défaut
    progressBar.style.animation = 'none';
    progressBar.style.transformOrigin = 'left';
    progressBar.style.transform = 'scaleX(0)';
    
    // Fonction pour mettre à jour le progress
    const updateProgress = (progress) => {
      const clampedProgress = Math.max(0, Math.min(1, progress));
      progressBar.style.transform = `scaleX(${clampedProgress})`;
      
      if (clampedProgress >= 1) {
        setTimeout(() => this.dismiss(id), 1000);
      }
    };

    if (progressCallback) {
      progressCallback(updateProgress);
    }

    return { id, updateProgress };
  }

  // Notification d'action avec undo
  showActionNotification(title, message, undoAction, options = {}) {
    return this.show('info', title, message, {
      ...options,
      duration: 10000,
      actions: [
        {
          label: 'Annuler',
          handler: undoAction,
          className: 'bg-blue-500 hover:bg-blue-600 text-white'
        }
      ]
    });
  }
}

// Instance globale
window.notifications = new NotificationSystem();

// Export pour modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = NotificationSystem;
} 