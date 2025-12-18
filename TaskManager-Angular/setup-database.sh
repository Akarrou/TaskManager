#!/bin/bash

# =====================================================================
# Script d'Installation Automatique - Base de Données
# =====================================================================
# Ce script exécute automatiquement le SQL sur Supabase via le CLI
# =====================================================================

echo "🚀 Installation du système de base de données..."
echo ""

# Vérifier si Supabase CLI est installé
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI n'est pas installé."
    echo ""
    echo "📦 Installation de Supabase CLI..."
    echo ""
    echo "Pour macOS:"
    echo "  brew install supabase/tap/supabase"
    echo ""
    echo "Pour Linux/Windows WSL:"
    echo "  npm install -g supabase"
    echo ""
    exit 1
fi

echo "✅ Supabase CLI détecté"
echo ""

# Demander les credentials
echo "📝 Configuration de la connexion..."
echo ""
echo "Allez sur: https://supabase.com/dashboard/project/eoejjfztgdpdciqlvnte/settings/api"
echo ""
read -p "Entrez votre Project URL (ex: https://xxx.supabase.co): " PROJECT_URL
read -sp "Entrez votre Service Role Key (secret): " SERVICE_KEY
echo ""
echo ""

# Vérifier que les variables sont renseignées
if [ -z "$PROJECT_URL" ] || [ -z "$SERVICE_KEY" ]; then
    echo "❌ URL ou Key manquante. Abandon."
    exit 1
fi

# Exporter les variables d'environnement
export SUPABASE_URL="$PROJECT_URL"
export SUPABASE_KEY="$SERVICE_KEY"

# Exécuter le script SQL
echo "⚙️  Exécution du script SQL..."
echo ""

# Utiliser psql si disponible, sinon utiliser l'API REST
if command -v psql &> /dev/null; then
    # Méthode 1: Via psql direct
    DB_URL=$(echo "$PROJECT_URL" | sed 's/https:\/\///')
    psql "postgresql://postgres:[password]@db.$DB_URL:5432/postgres" -f SIMPLE_SETUP.sql
else
    # Méthode 2: Via API Supabase
    echo "📡 Utilisation de l'API Supabase..."

    SQL_CONTENT=$(cat SIMPLE_SETUP.sql)

    curl -X POST "$PROJECT_URL/rest/v1/rpc/exec_sql" \
        -H "apikey: $SERVICE_KEY" \
        -H "Authorization: Bearer $SERVICE_KEY" \
        -H "Content-Type: application/json" \
        -d "{\"sql\": $(echo "$SQL_CONTENT" | jq -Rs .)}"
fi

echo ""
echo "✅ Installation terminée !"
echo ""
echo "🧪 Vérification..."

# Vérifier que la table existe
curl -X GET "$PROJECT_URL/rest/v1/document_databases?select=count" \
    -H "apikey: $SERVICE_KEY" \
    -H "Authorization: Bearer $SERVICE_KEY" \
    2>/dev/null | grep -q "count" && echo "✅ Table document_databases créée" || echo "❌ Erreur: table non créée"

echo ""
echo "📍 Prochaine étape:"
echo "   1. Retournez dans l'application (http://localhost:4200)"
echo "   2. Rechargez la page (F5)"
echo "   3. Tapez '/' puis 'Base de données'"
echo ""
