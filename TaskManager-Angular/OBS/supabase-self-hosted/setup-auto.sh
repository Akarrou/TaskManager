#!/bin/bash
#===============================================================================
# Version non-interactive du script d'installation
#===============================================================================

set -e

cd "$(dirname "$0")"

echo "========================================================================="
echo "🚀 Installation Automatique Supabase Self-Hosted"
echo "========================================================================="
echo ""

# 1. Vérifier Docker
echo "✓ Vérification de Docker..."
if ! command -v docker &> /dev/null; then
    echo "❌ Docker n'est pas installé !"
    echo "Installez Docker depuis: https://docs.docker.com/get-docker/"
    exit 1
fi
echo "  Docker: $(docker --version)"

# 2. Vérifier Docker Compose
echo "✓ Vérification de Docker Compose..."
if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose n'est pas installé !"
    exit 1
fi
echo "  Docker Compose: $(docker compose version)"

# 3. Vérifier Node.js
echo "✓ Vérification de Node.js..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js n'est pas installé !"
    exit 1
fi
echo "  Node.js: $(node --version)"

echo ""
echo "========================================================================="
echo "Génération des Clés de Sécurité"
echo "========================================================================="
echo ""

# 4. Générer les clés
cd scripts
if [ ! -d "node_modules" ]; then
    echo "Installation de jsonwebtoken..."
    npm install --silent jsonwebtoken
fi

echo "Génération des clés JWT..."
node generate-keys.js > ../keys.txt
cd ..

# 5. Extraire les valeurs
JWT_SECRET=$(grep -A 1 "JWT_SECRET" keys.txt | tail -n 1)
ANON_KEY=$(grep -A 1 "ANON_KEY" keys.txt | tail -n 1)
SERVICE_ROLE_KEY=$(grep -A 1 "SERVICE_ROLE_KEY" keys.txt | tail -n 1)
POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)

echo "✓ Clés générées avec succès"
echo ""

echo "========================================================================="
echo "Configuration du Fichier .env"
echo "========================================================================="
echo ""

# 6. Configurer .env
cp .env.example .env

# Utiliser sed compatible macOS
sed -i '' "s|your-super-secret-jwt-token-with-at-least-32-characters-long|$JWT_SECRET|g" .env
sed -i '' "s|your-super-secret-and-long-postgres-password|$POSTGRES_PASSWORD|g" .env
sed -i '' "s|eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0|$ANON_KEY|g" .env
sed -i '' "s|eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU|$SERVICE_ROLE_KEY|g" .env

echo "✓ Fichier .env configuré"
echo ""

echo "========================================================================="
echo "Démarrage des Services Supabase"
echo "========================================================================="
echo ""

# 7. Démarrer Docker Compose
echo "Téléchargement des images Docker..."
docker compose pull

echo ""
echo "Démarrage de la stack Supabase..."
docker compose up -d

echo ""
echo "✓ Services lancés"
echo ""

echo "========================================================================="
echo "Attente du Démarrage Complet"
echo "========================================================================="
echo ""

# 8. Attendre PostgreSQL
echo "Attente que PostgreSQL soit prêt..."
max_attempts=60
attempt=0

while [ $attempt -lt $max_attempts ]; do
    if docker compose exec -T db pg_isready -U postgres &> /dev/null; then
        echo "✓ PostgreSQL est prêt"
        break
    fi
    echo -n "."
    sleep 2
    attempt=$((attempt + 1))
done

if [ $attempt -eq $max_attempts ]; then
    echo "❌ Timeout: PostgreSQL n'a pas démarré"
    echo "Vérifiez les logs: docker compose logs db"
    exit 1
fi

# Attendre encore un peu
echo "Attente des autres services..."
sleep 15

echo ""
echo "========================================================================="
echo "État des Services"
echo "========================================================================="
echo ""

docker compose ps

echo ""
echo "========================================================================="
echo "🎉 Installation Terminée avec Succès !"
echo "========================================================================="
echo ""
echo "✅ Supabase Self-Hosted est maintenant opérationnel !"
echo ""
echo "📊 Supabase Studio (Interface Admin):"
echo "   URL: http://localhost:3000"
echo ""
echo "🔌 API Gateway (Kong):"
echo "   URL: http://localhost:8000"
echo ""
echo "🗄️  PostgreSQL:"
echo "   Host: localhost"
echo "   Port: 5432"
echo "   User: postgres"
echo "   Password: $POSTGRES_PASSWORD"
echo ""
echo "🔑 ANON_KEY (à utiliser dans Angular):"
echo "   $ANON_KEY"
echo ""
echo "========================================================================="
echo "Prochaines Étapes"
echo "========================================================================="
echo ""
echo "1. Ouvrez Supabase Studio: http://localhost:3000"
echo ""
echo "2. Mettez à jour votre Angular environment.ts:"
echo "   supabaseUrl: 'http://localhost:8000'"
echo "   supabaseAnonKey: '$ANON_KEY'"
echo ""
echo "3. Les clés sont sauvegardées dans keys.txt"
echo ""
echo "Commandes utiles:"
echo "  docker compose ps              # État des services"
echo "  docker compose logs -f         # Voir les logs"
echo "  docker compose stop            # Arrêter"
echo "  docker compose start           # Redémarrer"
echo "  docker compose down            # Tout arrêter"
echo ""
echo "========================================================================="
