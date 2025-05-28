// Configuration pour l'application Task Manager
const CONFIG = {
  // URL de l'API Redis (proxy local)
  API_BASE_URL: "http://localhost:3001/api",

  // Configuration Redis
  REDIS: {
    HOST: "localhost",
    PORT: 6379,
    DATABASE: 0,
  },

  // Clés Redis utilisées
  REDIS_KEYS: {
    TASKS_PREFIX: "tasks:",
    TASKS_INDEX: "tasks:index",
    TASKS_PATTERN: "tasks:*",
  },

  // Configuration de l'interface
  UI: {
    REFRESH_INTERVAL: 30000, // 30 secondes
    ANIMATION_DURATION: 300,
    ITEMS_PER_PAGE: 20,
  },

  // Couleurs pour les statuts
  STATUS_COLORS: {
    "À faire": "blue",
    "En cours": "yellow",
    Terminée: "green",
    "En attente": "gray",
    Annulée: "red",
  },

  // Couleurs pour les priorités
  PRIORITY_COLORS: {
    Haute: "red",
    Moyenne: "yellow",
    Basse: "green",
  },

  // Icônes pour les catégories
  CATEGORY_ICONS: {
    Frontend: "fas fa-desktop",
    Backend: "fas fa-server",
    Fullstack: "fas fa-layer-group",
    Testing: "fas fa-vial",
    OPS: "fas fa-cogs",
  },
};

// Export pour utilisation dans d'autres modules
if (typeof module !== "undefined" && module.exports) {
  module.exports = CONFIG;
}
