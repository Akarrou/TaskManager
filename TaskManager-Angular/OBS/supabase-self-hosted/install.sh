#!/bin/bash
set -e

echo "========================================================================="
echo "🚀 Installation Supabase Self-Hosted - Version Simplifiée"
echo "========================================================================="
echo ""

cd "$(dirname "$0")"

# Générer JWT_SECRET
echo "1️⃣  Génération JWT_SECRET..."
JWT_SECRET=$(openssl rand -hex 32)
echo "✓ JWT_SECRET généré"

# Générer password PostgreSQL
echo "2️⃣  Génération mot de passe PostgreSQL..."
POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
echo "✓ Password PostgreSQL généré"

# Pour ANON_KEY et SERVICE_ROLE_KEY, on va utiliser les clés par défaut de Supabase
# et vous pourrez les régénérer plus tard si nécessaire
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"

echo "3️⃣  Configuration du fichier .env..."

# Copier template
cp .env.example .env

# Remplacer les valeurs (compatible macOS)
sed -i '' "s|your-super-secret-jwt-token-with-at-least-32-characters-long|$JWT_SECRET|g" .env
sed -i '' "s|your-super-secret-and-long-postgres-password|$POSTGRES_PASSWORD|g" .env

echo "✓ Fichier .env configuré"
echo ""

# Sauvegarder les credentials
cat > credentials.txt << EOF
========================================
Supabase Self-Hosted - Credentials
========================================

PostgreSQL Password: $POSTGRES_PASSWORD
JWT Secret: $JWT_SECRET

ANON_KEY (à utiliser dans Angular):
$ANON_KEY

SERVICE_ROLE_KEY:
$SERVICE_ROLE_KEY

URLs:
- Studio: http://localhost:3000
- API: http://localhost:8000

Configuration Angular (environment.ts):
  supabaseUrl: 'http://localhost:8000',
  supabaseAnonKey: '$ANON_KEY',

========================================
EOF

echo "4️⃣  Démarrage de Supabase..."
echo ""

docker compose pull
docker compose up -d

echo ""
echo "5️⃣  Attente du démarrage complet (2-3 minutes)..."
echo ""

# Attendre PostgreSQL
max_attempts=60
attempt=0

while [ $attempt -lt $max_attempts ]; do
    if docker compose exec -T db pg_isready -U postgres &> /dev/null; then
        echo "✓ PostgreSQL prêt !"
        break
    fi
    echo -n "."
    sleep 2
    attempt=$((attempt + 1))
done

if [ $attempt -eq $max_attempts ]; then
    echo ""
    echo "❌ Timeout: PostgreSQL n'a pas démarré"
    echo "Vérifiez les logs: docker compose logs db"
    exit 1
fi

# Attendre les autres services
sleep 15

echo ""
echo "========================================================================="
echo "🎉 Installation Terminée !"
echo "========================================================================="
echo ""
echo "✅ Supabase est opérationnel !"
echo ""
echo "📊 Supabase Studio: http://localhost:3000"
echo "🔌 API Supabase: http://localhost:8000"
echo ""
echo "🔑 Vos credentials sont dans: credentials.txt"
echo ""
echo "📝 Configuration Angular:"
echo "   supabaseUrl: 'http://localhost:8000'"
echo "   supabaseAnonKey: '$ANON_KEY'"
echo ""
echo "Commandes utiles:"
echo "  docker compose ps       # État des services"
echo "  docker compose logs -f  # Voir les logs"
echo "  docker compose stop     # Arrêter"
echo ""
echo "========================================================================="
