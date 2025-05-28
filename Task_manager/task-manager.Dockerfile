# Multi-stage build pour l'application Task Manager
FROM node:20-alpine AS base

# Arguments de build
ARG PROJECT_NAME=MyProject

# Métadonnées de l'image
LABEL maintainer="${PROJECT_NAME} Team <admin@example.com>"
LABEL version="1.0"
LABEL description="${PROJECT_NAME} Task Manager - Interface de gestion des tâches Redis JSON"

# Installer des utilitaires nécessaires
RUN apk add --no-cache curl

# Créer le répertoire de travail
WORKDIR /app

# Copier les fichiers de configuration
COPY Task_manager/package.json Task_manager/package-lock.json* ./

# Installer les dépendances
RUN npm ci --only=production && npm cache clean --force

# Copier le code de l'application
COPY Task_manager/ ./

# Créer un utilisateur non-root pour la sécurité
RUN addgroup -g 1001 -S nodejs && \
    adduser -S taskmanager -u 1001

# Changer la propriété des fichiers
RUN chown -R taskmanager:nodejs /app
USER taskmanager

# Variables d'environnement
ENV NODE_ENV=production
ENV PORT=3001
ENV PROJECT_NAME=${PROJECT_NAME}
ENV REDIS_HOST=redis
ENV REDIS_PORT=6379

# Exposition du port
EXPOSE 3001

# Healthcheck pour vérifier que l'application fonctionne
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

# Commande de démarrage
CMD ["npm", "start"] 