#!/bin/bash

# Script de build pour Task Manager avec nom de projet configurable
# Usage: ./build.sh [PROJECT_NAME]

set -e

# Configuration par défaut
DEFAULT_PROJECT_NAME="AgroFlow"
PROJECT_NAME=${1:-${PROJECT_NAME:-$DEFAULT_PROJECT_NAME}}

echo "🏗️  Building Task Manager for project: $PROJECT_NAME"

# Exporter la variable d'environnement
export PROJECT_NAME

# Nettoyer les conteneurs existants
echo "🧹 Cleaning existing containers..."
docker-compose -f docker-compose.task-manager.yml down --remove-orphans 2>/dev/null || true

# Supprimer les images existantes
echo "🗑️  Removing old images..."
docker rmi ${PROJECT_NAME,,}-task-manager 2>/dev/null || true

# Construire l'image Docker
echo "🐳 Building Docker image..."
docker build \
  -t ${PROJECT_NAME,,}-task-manager \
  -f task-manager.Dockerfile \
  --build-arg PROJECT_NAME="$PROJECT_NAME" \
  ..

# Démarrer les services
echo "🚀 Starting services..."
docker-compose -f docker-compose.task-manager.yml up -d

echo "✅ Build completed successfully!"
echo "🌐 Application available at: http://localhost:3001"
echo "📊 Redis Insight available at: http://localhost:8002"
echo "🔧 Project Name: $PROJECT_NAME" 