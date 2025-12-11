#!/bin/bash
set -e

echo "========================================================================="
echo "🔄 Migration des Données - Supabase Cloud → Supabase Local"
echo "========================================================================="
echo ""

# Configuration Supabase Cloud
CLOUD_URL="https://eoejjfztgdpdciqlvnte.supabase.co"
CLOUD_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvZWpqZnp0Z2RwZGNpcWx2bnRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyODI4OTIsImV4cCI6MjA4MDg1ODg5Mn0.D3dlen6PvIRep2wZuoVlZtkyhNMqmhgRda4fILZ7lS4"

# Configuration Supabase Local
LOCAL_URL="http://localhost:8000"
LOCAL_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzY1NDA0NTc4LCJleHAiOjIwODA5ODA1Nzh9.uxmGgPIWxA4EjqomO-rNLt4T62qMoLQn4Kz2alLhP8w"
SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NjU0MDQ1NzgsImV4cCI6MjA4MDk4MDU3OH0._KJYrE2oqGRxzT9ePjNZSTsIT29dNopcLsMhGByoOK0"

POSTGRES_PASSWORD="V2xMj8N9pQrT6sKfH3nB4cYdL9vA"

# Dossier de travail
BACKUP_DIR="./backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "📁 Dossier de backup: $BACKUP_DIR"
echo ""

# Tables à exporter (dans l'ordre des dépendances)
TABLES=(
  "projects"
  "tasks"
  "subtasks"
  "task_comments"
  "task_attachments"
  "documents"
  "document_task_relations"
  "document_databases"
)

echo "========================================================================="
echo "📤 Étape 1: Export depuis Supabase Cloud"
echo "========================================================================="
echo ""

for table in "${TABLES[@]}"; do
  echo "Exportation de la table: $table"

  # Export via API REST Supabase
  curl -s -X GET "$CLOUD_URL/rest/v1/$table?select=*" \
    -H "apikey: $CLOUD_ANON_KEY" \
    -H "Authorization: Bearer $CLOUD_ANON_KEY" \
    > "$BACKUP_DIR/$table.json"

  # Vérifier si des données ont été exportées
  count=$(cat "$BACKUP_DIR/$table.json" | grep -o '{' | wc -l)
  echo "  ✓ $count enregistrements exportés"
done

echo ""
echo "========================================================================="
echo "📥 Étape 2: Import dans Supabase Local"
echo "========================================================================="
echo ""

# Désactiver temporairement les triggers et contraintes pour accélérer l'import
echo "Préparation de la base de données locale..."
docker exec -i supabase-db psql -U postgres -d postgres <<EOF
-- Désactiver les triggers temporairement
SET session_replication_role = 'replica';
EOF

for table in "${TABLES[@]}"; do
  echo "Importation de la table: $table"

  # Lire le JSON et le convertir en requêtes INSERT
  data=$(cat "$BACKUP_DIR/$table.json")

  # Si le tableau est vide, sauter
  if [ "$data" = "[]" ]; then
    echo "  ⊘ Table vide, ignorée"
    continue
  fi

  # Import via API REST Supabase Local (avec SERVICE_ROLE_KEY pour bypass RLS)
  response=$(curl -s -X POST "$LOCAL_URL/rest/v1/$table" \
    -H "apikey: $SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: resolution=merge-duplicates" \
    -d "$data")

  # Compter les enregistrements
  count=$(echo "$data" | grep -o '{' | wc -l)
  echo "  ✓ $count enregistrements importés"
done

echo ""
echo "Réactivation des triggers..."
docker exec -i supabase-db psql -U postgres -d postgres <<EOF
-- Réactiver les triggers
SET session_replication_role = 'origin';

-- Mettre à jour les séquences (auto-increment IDs)
SELECT setval(pg_get_serial_sequence('projects', 'id'), COALESCE(MAX(id), 1)) FROM projects;
SELECT setval(pg_get_serial_sequence('tasks', 'id'), COALESCE(MAX(id), 1)) FROM tasks;
SELECT setval(pg_get_serial_sequence('subtasks', 'id'), COALESCE(MAX(id), 1)) FROM subtasks;
SELECT setval(pg_get_serial_sequence('task_comments', 'id'), COALESCE(MAX(id), 1)) FROM task_comments;
SELECT setval(pg_get_serial_sequence('task_attachments', 'id'), COALESCE(MAX(id), 1)) FROM task_attachments;
SELECT setval(pg_get_serial_sequence('documents', 'id'), COALESCE(MAX(id), 1)) FROM documents;
EOF

echo ""
echo "========================================================================="
echo "👥 Étape 3: Migration des Utilisateurs"
echo "========================================================================="
echo ""

echo "⚠️  IMPORTANT: Les utilisateurs doivent être migrés manuellement via Supabase Studio"
echo ""
echo "1. Ouvrez Supabase Cloud Studio: https://supabase.com/dashboard/project/eoejjfztgdpdciqlvnte"
echo "2. Allez dans Authentication > Users"
echo "3. Exportez la liste des utilisateurs (email + métadonnées)"
echo "4. Ouvrez Supabase Local Studio: http://localhost:3000"
echo "5. Allez dans Authentication > Users"
echo "6. Créez manuellement chaque utilisateur avec le même email"
echo ""
echo "Note: Les utilisateurs devront réinitialiser leur mot de passe"

echo ""
echo "========================================================================="
echo "📊 Étape 4: Vérification des Données"
echo "========================================================================="
echo ""

for table in "${TABLES[@]}"; do
  count=$(docker exec supabase-db psql -U postgres -d postgres -t -c "SELECT COUNT(*) FROM $table;")
  echo "$table: $count enregistrements"
done

echo ""
echo "========================================================================="
echo "✅ Migration Terminée !"
echo "========================================================================="
echo ""
echo "Backup sauvegardé dans: $BACKUP_DIR"
echo ""
echo "Prochaines étapes:"
echo "1. Vérifiez les données dans Supabase Studio: http://localhost:3000"
echo "2. Créez les comptes utilisateurs dans Authentication > Users"
echo "3. Testez votre application Angular: ng serve"
echo ""
