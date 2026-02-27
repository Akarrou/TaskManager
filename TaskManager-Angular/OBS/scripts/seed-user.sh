#!/bin/bash

# ===================================================================
# Kōdo Task Manager — Création de l'utilisateur initial
# ===================================================================
# Crée l'utilisateur par défaut après le démarrage complet de Supabase.
# Idempotent : ne fait rien si l'utilisateur existe déjà.
# Usage : ./seed-user.sh
# ===================================================================

set -e

echo "Kōdo — Création de l'utilisateur initial"
echo "=========================================="
echo ""

# Configuration
DB_CONTAINER="supabase-db"
DEFAULT_EMAIL="${SEED_USER_EMAIL:-admin@example.com}"
DEFAULT_PASSWORD="${SEED_USER_PASSWORD:-changeme123}"
DEFAULT_NAME="${SEED_USER_NAME:-Admin User}"

# Vérifier que le conteneur tourne
echo "Vérification du conteneur de base de données..."
if ! docker ps | grep -q "$DB_CONTAINER"; then
    echo "ERREUR : Le conteneur '$DB_CONTAINER' ne tourne pas."
    echo "  Démarrez la stack d'abord : docker compose up -d"
    exit 1
fi

# Attendre que le schéma auth soit prêt
echo "Attente du schéma auth..."
MAX_ATTEMPTS=30
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if docker exec $DB_CONTAINER psql -U postgres -t -c "SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users';" 2>/dev/null | grep -q "1"; then
        echo "Schéma auth prêt."
        break
    fi
    ATTEMPT=$((ATTEMPT + 1))
    echo "  Tentative $ATTEMPT/$MAX_ATTEMPTS — attente..."
    sleep 2
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
    echo "ERREUR : Schéma auth non disponible après $MAX_ATTEMPTS tentatives."
    exit 1
fi

# Vérifier si l'utilisateur existe déjà
echo "Vérification de l'existence de l'utilisateur..."
USER_EXISTS=$(docker exec $DB_CONTAINER psql -U postgres -t -c "SELECT COUNT(*) FROM auth.users WHERE email = '$DEFAULT_EMAIL';" | tr -d ' ')

if [ "$USER_EXISTS" -gt "0" ]; then
    echo "L'utilisateur '$DEFAULT_EMAIL' existe déjà."
    exit 0
fi

# Créer l'utilisateur avec son identité (requis par GoTrue)
echo "Création de l'utilisateur..."
docker exec $DB_CONTAINER psql -U postgres -c "
DO \$\$
DECLARE
  new_user_id uuid := gen_random_uuid();
BEGIN
  -- Créer l'utilisateur
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    aud, role,
    confirmation_token, recovery_token,
    email_change_token_new, email_change_token_current,
    email_change, phone, phone_change,
    phone_change_token, reauthentication_token,
    email_change_confirm_status, is_sso_user, is_anonymous
  ) VALUES (
    new_user_id,
    '00000000-0000-0000-0000-000000000000',
    '$DEFAULT_EMAIL',
    crypt('$DEFAULT_PASSWORD', gen_salt('bf')),
    NOW(), NOW(), NOW(),
    '{\"provider\": \"email\", \"providers\": [\"email\"]}',
    '{\"full_name\": \"$DEFAULT_NAME\"}',
    'authenticated', 'authenticated',
    '', '', '', '', '', NULL, '', '', '',
    0, false, false
  );

  -- Créer l'identité associée (obligatoire pour GoTrue)
  INSERT INTO auth.identities (
    id, user_id, provider_id, provider,
    identity_data, last_sign_in_at, created_at, updated_at
  ) VALUES (
    new_user_id,
    new_user_id,
    '$DEFAULT_EMAIL',
    'email',
    jsonb_build_object(
      'sub', new_user_id::text,
      'email', '$DEFAULT_EMAIL',
      'email_verified', true
    ),
    NOW(), NOW(), NOW()
  );
END
\$\$;
"

echo ""
echo "Utilisateur créé avec succès !"
echo ""
echo "  Email : $DEFAULT_EMAIL"
echo "  Nom :   $DEFAULT_NAME"
echo ""
