// Gestionnaire d'améliorations UX
class UXEnhancer {
  constructor() {
    this.connectionStatus = 'offline';
    this.breadcrumbs = [];
    this.fabState = 'closed';
    this.connectionRetryCount = 0;
    this.maxRetries = 5;
    this.initialized = false;
  }

  init() {
    if (this.initialized) {
      console.log('🔄 UXEnhancer déjà initialisé, skip...');
      return;
    }
    
    console.log('🚀 Initialisation UXEnhancer...');
    
    this.initializeConnectionMonitor();
    this.initializeFAB();
    this.initializeBreadcrumbs();
    this.initializeQuickActions();
    this.initializeTooltips();
    this.initializePerformanceMonitoring();
    
    // Démarrer le monitoring
    this.startConnectionMonitoring();
    
    this.initialized = true;
    console.log('✅ UXEnhancer initialisé avec succès!');
  }

  // ===== GESTION DE LA CONNEXION =====
  
  initializeConnectionMonitor() {
    this.connectionIndicator = document.getElementById('connection-indicator');
    this.connectionDot = document.getElementById('connection-dot');
    this.connectionText = document.getElementById('connection-text');
    this.headerConnectionStatus = document.getElementById('connection-status');
    
    // Loguer les éléments trouvés pour debug
    console.log('🔍 Éléments de connexion trouvés:', {
      indicator: !!this.connectionIndicator,
      dot: !!this.connectionDot,
      text: !!this.connectionText,
      header: !!this.headerConnectionStatus
    });
    
    // Test initial de connexion seulement si on a au moins un élément
    if (this.headerConnectionStatus || this.connectionIndicator) {
      this.checkConnection();
    } else {
      console.warn('⚠️ Aucun élément de statut de connexion trouvé');
    }
  }

  async checkConnection() {
    try {
      this.setConnectionStatus('loading', 'Test de connexion...');
      
      const response = await fetch('/api/health', {
        method: 'GET',
        timeout: 5000
      });
      
      if (response.ok) {
        this.setConnectionStatus('online', 'Connecté');
        this.connectionRetryCount = 0;
        
        // Notification de reconnexion si on était déconnecté
        if (this.connectionStatus === 'offline') {
          window.notifications?.success(
            'Connexion rétablie',
            'La connexion au serveur a été rétablie avec succès'
          );
        }
      } else {
        throw new Error('Server response not ok');
      }
    } catch (error) {
      this.setConnectionStatus('offline', 'Déconnecté');
      this.handleConnectionError(error);
    }
  }

  setConnectionStatus(status, message) {
    this.connectionStatus = status;
    
    // Mettre à jour l'indicateur de connexion seulement s'il existe
    if (this.connectionIndicator) {
      this.connectionIndicator.className = `fixed bottom-4 left-4 z-40 connection-${status}`;
    }
    
    // Mettre à jour le texte de connexion seulement s'il existe
    if (this.connectionText) {
      this.connectionText.textContent = message;
    }
    
    // Mettre à jour le header (celui-ci existe)
    if (this.headerConnectionStatus) {
      const iconClass = status === 'online' ? 'text-green-500' : 
                      status === 'loading' ? 'text-yellow-500' : 'text-red-500';
      this.headerConnectionStatus.innerHTML = `<i class="fas fa-circle ${iconClass}"></i> ${message}`;
    }
  }

  handleConnectionError(error) {
    this.connectionRetryCount++;
    
    if (this.connectionRetryCount <= this.maxRetries) {
      // Retry automatique avec backoff exponentiel
      const retryDelay = Math.pow(2, this.connectionRetryCount) * 1000;
      setTimeout(() => this.checkConnection(), retryDelay);
      
      this.setConnectionStatus('offline', `Reconnexion... (${this.connectionRetryCount}/${this.maxRetries})`);
    } else {
      this.setConnectionStatus('offline', 'Connexion impossible');
      
      // Notification d'erreur persistante
      window.notifications?.error(
        'Problème de connexion',
        'Impossible de se connecter au serveur. Vérifiez votre connexion internet.',
        {
          persistent: true,
          actions: [
            {
              label: 'Réessayer',
              handler: () => {
                this.connectionRetryCount = 0;
                this.checkConnection();
              },
              className: 'bg-blue-500 hover:bg-blue-600 text-white'
            }
          ]
        }
      );
    }
  }

  startConnectionMonitoring() {
    // Vérifier la connexion toutes les 30 secondes
    setInterval(() => {
      this.checkConnection();
    }, 30000);

    // Écouter les événements de réseau
    window.addEventListener('online', () => {
      this.checkConnection();
    });

    window.addEventListener('offline', () => {
      this.setConnectionStatus('offline', 'Hors ligne');
    });
  }

  // ===== FLOATING ACTION BUTTON =====
  
  initializeFAB() {
    this.fabMain = document.getElementById('fab-main');
    this.fabMenu = document.getElementById('fab-menu');
    this.fabNewTask = document.getElementById('fab-new-task');
    this.fabRefresh = document.getElementById('fab-refresh');
    this.fabSearch = document.getElementById('fab-search');

    // Vérifier que les éléments FAB existent
    if (!this.fabMain || !this.fabMenu) {
      console.log('ℹ️ Éléments FAB non trouvés, skip initialisation FAB');
      return;
    }

    console.log('🎯 Initialisation FAB...');

    // Gestionnaires d'événements
    this.fabMain.addEventListener('click', () => this.toggleFAB());
    
    if (this.fabNewTask) {
      this.fabNewTask.addEventListener('click', () => {
        this.closeFAB();
        document.getElementById('new-task-btn')?.click();
      });
    }
    
    if (this.fabRefresh) {
      this.fabRefresh.addEventListener('click', () => {
        this.closeFAB();
        this.performRefresh();
      });
    }
    
    if (this.fabSearch) {
      this.fabSearch.addEventListener('click', () => {
        this.closeFAB();
        this.focusSearch();
      });
    }

    // Fermer FAB en cliquant ailleurs
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#quick-actions-fab')) {
        this.closeFAB();
      }
    });

    // Animation d'apparition staggered
    this.staggerFABButtons();
  }

  toggleFAB() {
    if (this.fabState === 'closed') {
      this.openFAB();
    } else {
      this.closeFAB();
    }
  }

  openFAB() {
    this.fabState = 'open';
    this.fabMenu.style.opacity = '1';
    this.fabMenu.style.visibility = 'visible';
    this.fabMenu.style.transform = 'scale(1)';
    
    // Animation staggered des boutons
    const buttons = this.fabMenu.children;
    Array.from(buttons).forEach((button, index) => {
      setTimeout(() => {
        button.style.transform = 'scale(1) translateY(0)';
        button.style.opacity = '1';
      }, index * 50);
    });
  }

  closeFAB() {
    this.fabState = 'closed';
    this.fabMenu.style.opacity = '0';
    this.fabMenu.style.visibility = 'hidden';
    this.fabMenu.style.transform = 'scale(0.9)';
  }

  staggerFABButtons() {
    const buttons = this.fabMenu.children;
    Array.from(buttons).forEach((button, index) => {
      button.style.transform = 'scale(0.8) translateY(10px)';
      button.style.opacity = '0';
      button.style.transition = `all 0.3s ease-out ${index * 50}ms`;
    });
  }

  // ===== BREADCRUMBS =====
  
  initializeBreadcrumbs() {
    this.breadcrumbContainer = document.getElementById('breadcrumb-container');
    this.breadcrumbCurrent = document.getElementById('breadcrumb-current-text');
    
    this.updateBreadcrumbs([
      { label: 'Dashboard', url: '/', current: true }
    ]);
  }

  updateBreadcrumbs(items) {
    this.breadcrumbs = items;
    if (items.length > 1) {
      this.breadcrumbContainer.classList.add('show');
      const current = items.find(item => item.current);
      if (current) {
        this.breadcrumbCurrent.textContent = current.label;
      }
    } else {
      this.breadcrumbContainer.classList.remove('show');
    }
  }

  // ===== ACTIONS RAPIDES =====
  
  initializeQuickActions() {
    // Refresh amélioré avec feedback
    this.performRefresh = () => {
      const loadingId = window.notifications?.loading(
        'Actualisation',
        'Rechargement des données en cours...'
      );

      // Simuler l'appel API
      setTimeout(() => {
        window.notifications?.dismiss(loadingId);
        window.notifications?.success(
          'Données actualisées',
          'Les tâches ont été mises à jour avec succès'
        );
        
        // Trigger refresh event
        window.dispatchEvent(new CustomEvent('refresh-requested'));
      }, 1500);
    };

    // Focus sur la recherche
    this.focusSearch = () => {
      const searchInput = document.getElementById('search-input');
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
        
        // Animation de mise en évidence
        searchInput.parentElement.style.transform = 'scale(1.02)';
        setTimeout(() => {
          searchInput.parentElement.style.transform = 'scale(1)';
        }, 200);
      }
    };
  }

  // ===== TOOLTIPS AVANCÉS =====
  
  initializeTooltips() {
    this.createAdvancedTooltips();
    this.initializeKeyboardTooltips();
  }

  createAdvancedTooltips() {
    // Sélectionner tous les éléments avec title
    const elementsWithTooltips = document.querySelectorAll('[title]');
    
    elementsWithTooltips.forEach(element => {
      const title = element.getAttribute('title');
      element.removeAttribute('title'); // Supprimer le tooltip natif
      
      // Créer tooltip personnalisé
      element.classList.add('tooltip');
      
      const tooltipText = document.createElement('span');
      tooltipText.className = 'tooltip-text';
      tooltipText.textContent = title;
      element.appendChild(tooltipText);
    });
  }

  initializeKeyboardTooltips() {
    // Ajouter des tooltips pour les raccourcis clavier
    const keyboardShortcuts = {
      'new-task-btn': 'Ctrl+N',
      'refresh-btn': 'Ctrl+R',
      'search-input': 'Raccourci: /',
      'help-btn': 'F1 ou ?'
    };

    Object.entries(keyboardShortcuts).forEach(([id, shortcut]) => {
      const element = document.getElementById(id);
      if (element) {
        const existingTitle = element.getAttribute('title') || '';
        element.setAttribute('title', `${existingTitle} (${shortcut})`);
      }
    });
  }

  // ===== MONITORING PERFORMANCE =====
  
  initializePerformanceMonitoring() {
    this.performanceMetrics = {
      pageLoadTime: 0,
      apiResponseTimes: [],
      renderTimes: []
    };

    // Mesurer le temps de chargement de la page
    window.addEventListener('load', () => {
      this.performanceMetrics.pageLoadTime = performance.now();
      
      if (this.performanceMetrics.pageLoadTime > 3000) {
        window.notifications?.warning(
          'Performance',
          'Le chargement de la page semble lent. Vérifiez votre connexion.'
        );
      }
    });
  }

  // ===== UTILITAIRES UX =====
  
  // Smooth scroll vers un élément
  smoothScrollTo(elementId, offset = 0) {
    const element = document.getElementById(elementId);
    if (element) {
      const elementPosition = element.offsetTop - offset;
      window.scrollTo({
        top: elementPosition,
        behavior: 'smooth'
      });
    }
  }

  // Shake animation pour les erreurs
  shakeElement(element) {
    if (typeof element === 'string') {
      element = document.getElementById(element);
    }
    
    if (element) {
      element.style.animation = 'shake 0.5s ease-in-out';
      setTimeout(() => {
        element.style.animation = '';
      }, 500);
    }
  }

  // Highlight temporaire d'un élément
  highlightElement(element, duration = 2000) {
    if (typeof element === 'string') {
      element = document.getElementById(element);
    }
    
    if (element) {
      element.style.boxShadow = '0 0 20px rgba(34, 197, 94, 0.5)';
      element.style.transform = 'scale(1.02)';
      
      setTimeout(() => {
        element.style.boxShadow = '';
        element.style.transform = '';
      }, duration);
    }
  }

  // Gestion de l'état de chargement global
  setGlobalLoading(loading) {
    const body = document.body;
    if (loading) {
      body.classList.add('loading');
      body.style.cursor = 'wait';
    } else {
      body.classList.remove('loading');
      body.style.cursor = '';
    }
  }

  // Notification d'action avec feedback
  showActionFeedback(action, success = true) {
    if (success) {
      window.notifications?.success(
        'Action réussie',
        `${action} a été effectuée avec succès`
      );
    } else {
      window.notifications?.error(
        'Erreur',
        `Impossible d'effectuer l'action: ${action}`
      );
    }
  }
}

// CSS pour l'animation shake
const shakeCSS = `
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); }
  20%, 40%, 60%, 80% { transform: translateX(2px); }
}
`;

// Injecter le CSS
const style = document.createElement('style');
style.textContent = shakeCSS;
document.head.appendChild(style);

// Instance globale
window.uxEnhancer = new UXEnhancer();

// Initialiser quand le DOM est prêt
document.addEventListener('DOMContentLoaded', () => {
  window.uxEnhancer.init();
});

// Export pour modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UXEnhancer;
} 