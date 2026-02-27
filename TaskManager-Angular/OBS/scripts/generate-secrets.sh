#!/bin/bash

# ===================================================================
# Kōdo Task Manager — Script de configuration
# ===================================================================
# Génère tous les fichiers de configuration de manière interactive :
#   - .env.local ou .env.production (secrets + config)
#   - Caddyfile (reverse proxy, généré en production)
#
# Usage :
#   ./generate-secrets.sh              # Développement local (non-interactif)
#   ./generate-secrets.sh --production # Production (configuration interactive)
# ===================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OBS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ===================================================================
# Fonctions utilitaires
# ===================================================================

generate_secret() {
    openssl rand -base64 32 | tr -d "=+/" | cut -c1-32
}

generate_long_secret() {
    openssl rand -hex 64 | cut -c1-88
}

generate_uuid() {
    if command -v uuidgen &> /dev/null; then
        uuidgen | tr '[:upper:]' '[:lower:]'
    else
        cat /proc/sys/kernel/random/uuid 2>/dev/null || python3 -c "import uuid; print(uuid.uuid4())"
    fi
}

# Prompt avec valeur par défaut : ask "Question" "défaut"
ask() {
    local prompt="$1"
    local default="$2"
    local result

    if [ -n "$default" ]; then
        read -p "  $prompt [$default]: " result
        echo "${result:-$default}"
    else
        read -p "  $prompt: " result
        echo "$result"
    fi
}

# Prompt Oui/Non : ask_yn "Question" "y" => retourne 0 (oui) ou 1 (non)
ask_yn() {
    local prompt="$1"
    local default="${2:-n}"
    local hint="o/N"
    [ "$default" = "y" ] && hint="O/n"

    read -p "  $prompt ($hint): " -n 1 -r
    echo
    if [ "$default" = "y" ]; then
        [[ ! $REPLY =~ ^[Nn]$ ]]
    else
        [[ $REPLY =~ ^[OoYy]$ ]]
    fi
}

# ===================================================================
# Détection du mode
# ===================================================================

if [ "$1" == "--production" ]; then
    IS_PRODUCTION=true
    ENV_FILE="$OBS_DIR/.env.production"
else
    IS_PRODUCTION=false
    ENV_FILE="$OBS_DIR/.env.local"
fi

# Vérifier si le fichier existe déjà
if [ -f "$ENV_FILE" ]; then
    echo ""
    echo "Attention : $(basename "$ENV_FILE") existe déjà !"
    if ! ask_yn "Écraser le fichier ?"; then
        echo "Annulé."
        exit 1
    fi
    echo ""
fi

# ===================================================================
# DÉVELOPPEMENT LOCAL (non-interactif)
# ===================================================================

if [ "$IS_PRODUCTION" = false ]; then
    echo ""
    echo "=== Kōdo Task Manager — Configuration locale ==="
    echo ""

    VPS_HOST="localhost"
    SUPABASE_URL="http://localhost:8000"
    SITE_URL="http://localhost:4010"
    EMAIL_AUTOCONFIRM="true"

    # Valeurs par défaut pour le local
    SMTP_HOST=""
    SMTP_PORT="587"
    SMTP_USER=""
    SMTP_PASS=""
    SMTP_ADMIN_EMAIL="admin@example.com"
    GOOGLE_CLIENT_ID=""
    GOOGLE_CLIENT_SECRET=""
    GOOGLE_REDIRECT_URI=""
    APP_DOMAIN="kodo.example.com"
    API_DOMAIN="api.example.com"
    STUDIO_DOMAIN="supabase.example.com"
    MCP_DOMAIN="mcp.example.com"
    SEED_EMAIL="admin@example.com"
    SEED_PASSWORD="changeme123"
    SEED_NAME="Admin User"
    DEPLOY_USER="ubuntu"
    DEPLOY_PATH="~/taskmanager"

    echo "Génération des secrets..."
fi

# ===================================================================
# PRODUCTION (interactif)
# ===================================================================

if [ "$IS_PRODUCTION" = true ]; then
    echo ""
    echo "=========================================="
    echo "  Kōdo Task Manager — Configuration production"
    echo "=========================================="
    echo ""
    echo "Ce script va générer votre fichier d'environnement"
    echo "de production avec tous les secrets et la configuration."
    echo ""

    # --- Serveur ---
    echo "--- Serveur ---"
    VPS_HOST="${2:-${DEPLOY_VPS_HOST:-}}"
    if [ -z "$VPS_HOST" ]; then
        VPS_HOST=$(ask "Adresse IP du VPS (pour le déploiement SSH)" "")
        if [ -z "$VPS_HOST" ]; then
            echo "ERREUR : L'adresse IP du VPS est obligatoire."
            exit 1
        fi
    else
        echo "  VPS : $VPS_HOST"
    fi
    DEPLOY_USER=$(ask "Utilisateur SSH" "ubuntu")
    DEPLOY_PATH="~/taskmanager"
    echo ""

    # --- Domaines (SSL) ---
    echo "--- Domaines (HTTPS via Caddy + Let's Encrypt) ---"
    APP_DOMAIN=$(ask "Domaine principal (ex: kodo.monsite.com)" "")

    if [ -z "$APP_DOMAIN" ]; then
        echo "ERREUR : Le domaine est obligatoire (HTTPS requis pour le fonctionnement de l'app)."
        exit 1
    fi

    # Dériver automatiquement les sous-domaines
    BASE_DOMAIN="${APP_DOMAIN#*.}"
    API_DOMAIN="api.$BASE_DOMAIN"
    STUDIO_DOMAIN="supabase.$BASE_DOMAIN"
    MCP_DOMAIN="mcp.$BASE_DOMAIN"

    SUPABASE_URL="https://$API_DOMAIN"
    SITE_URL="https://$APP_DOMAIN"

    echo ""
    echo "  Sous-domaines dérivés :"
    echo "    API:    $API_DOMAIN"
    echo "    Studio: $STUDIO_DOMAIN"
    echo "    MCP:    $MCP_DOMAIN"
    echo ""
    echo "  (Modifiable dans le .env après génération si besoin)"
    echo ""

    # --- SMTP ---
    echo "--- Email (SMTP) ---"
    if ask_yn "Configurer le SMTP pour la vérification par email ?"; then
        SMTP_HOST=$(ask "Serveur SMTP" "smtp.gmail.com")
        SMTP_PORT=$(ask "Port SMTP" "587")
        SMTP_USER=$(ask "Utilisateur SMTP (email)" "")
        SMTP_PASS=$(ask "Mot de passe SMTP" "")
        SMTP_ADMIN_EMAIL=$(ask "Email administrateur" "$SMTP_USER")
        EMAIL_AUTOCONFIRM="false"
    else
        SMTP_HOST=""
        SMTP_PORT="587"
        SMTP_USER=""
        SMTP_PASS=""
        SMTP_ADMIN_EMAIL="admin@example.com"
        EMAIL_AUTOCONFIRM="true"
        echo "  Auto-confirmation activée (pas de vérification email)."
    fi
    echo ""

    # --- Google Calendar ---
    echo "--- Intégration Google Calendar ---"
    if ask_yn "Configurer la synchronisation Google Calendar ?"; then
        GOOGLE_CLIENT_ID=$(ask "Google Client ID" "")
        GOOGLE_CLIENT_SECRET=$(ask "Google Client Secret" "")
        GOOGLE_REDIRECT_URI="$SITE_URL/profile/google-callback"
        echo "  URI de redirection : $GOOGLE_REDIRECT_URI"
    else
        GOOGLE_CLIENT_ID=""
        GOOGLE_CLIENT_SECRET=""
        GOOGLE_REDIRECT_URI=""
    fi
    echo ""

    # --- Utilisateur initial ---
    echo "--- Utilisateur initial ---"
    SEED_EMAIL=$(ask "Email" "admin@example.com")
    SEED_PASSWORD=$(ask "Mot de passe" "changeme123")
    SEED_NAME=$(ask "Nom affiché" "Admin User")
    echo ""

    echo "Génération des secrets..."
fi

# ===================================================================
# Génération des secrets cryptographiques
# ===================================================================

JWT_SECRET=$(generate_long_secret)
POSTGRES_PASSWORD=$(generate_long_secret)
SECRET_KEY_BASE=$(generate_long_secret)
VAULT_ENC_KEY=$(openssl rand -base64 32 | cut -c1-32)
PG_META_CRYPTO_KEY=$(generate_long_secret)
LOGFLARE_PUBLIC=$(generate_long_secret)
LOGFLARE_PRIVATE=$(generate_long_secret)
POOLER_TENANT_ID=$(generate_uuid)
DASHBOARD_PASSWORD=$(generate_secret)
TOKEN_ENCRYPTION_KEY=$(openssl rand -hex 32)
MCP_AUTH_PASSWORD=$(generate_secret)

# Génération des tokens JWT
generate_jwt() {
    local role=$1
    local secret=$2
    local iat=$(date +%s)
    local exp=$((iat + 315360000))  # 10 ans

    local header='{"alg":"HS256","typ":"JWT"}'
    local header_b64=$(echo -n "$header" | openssl base64 -e -A | tr '+/' '-_' | tr -d '=')

    local payload="{\"role\":\"$role\",\"iss\":\"supabase\",\"iat\":$iat,\"exp\":$exp}"
    local payload_b64=$(echo -n "$payload" | openssl base64 -e -A | tr '+/' '-_' | tr -d '=')

    local signature=$(echo -n "$header_b64.$payload_b64" | openssl dgst -sha256 -hmac "$secret" -binary | openssl base64 -e -A | tr '+/' '-_' | tr -d '=')

    echo "$header_b64.$payload_b64.$signature"
}

ANON_KEY=$(generate_jwt "anon" "$JWT_SECRET")
SERVICE_ROLE_KEY=$(generate_jwt "service_role" "$JWT_SECRET")

# ===================================================================
# Écriture du fichier .env
# ===================================================================

cat > "$ENV_FILE" << EOF
# ===================================================================
# Kōdo Task Manager - Configuration d'environnement
# Généré automatiquement le $(date)
# ===================================================================

# ===================================================================
# CONFIGURATION APPLICATION
# ===================================================================

BUILD_ENV=production
PRODUCTION=true
PROJECT_NAME=Kōdo Task Manager

# ===================================================================
# RÉSEAU & PORTS
# ===================================================================

APP_PORT=4010
KONG_HTTP_PORT=8000
KONG_HTTPS_PORT=8443
STUDIO_PORT=3000

# ===================================================================
# URLS PUBLIQUES
# ===================================================================

SUPABASE_PUBLIC_URL=$SUPABASE_URL
API_EXTERNAL_URL=$SUPABASE_URL
SITE_URL=$SITE_URL
ADDITIONAL_REDIRECT_URLS=$SITE_URL/*

# ===================================================================
# SÉCURITÉ & SECRETS
# ===================================================================

POSTGRES_PASSWORD=$POSTGRES_PASSWORD
JWT_SECRET=$JWT_SECRET
JWT_EXPIRY=3600
ANON_KEY=$ANON_KEY
SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=$DASHBOARD_PASSWORD
SECRET_KEY_BASE=$SECRET_KEY_BASE
VAULT_ENC_KEY=$VAULT_ENC_KEY
PG_META_CRYPTO_KEY=$PG_META_CRYPTO_KEY

# ===================================================================
# BASE DE DONNÉES
# ===================================================================

POSTGRES_HOST=db
POSTGRES_DB=postgres
POSTGRES_PORT=5432
PGRST_DB_SCHEMAS=public,storage,graphql_public

# ===================================================================
# POOLER BASE DE DONNÉES
# ===================================================================

POOLER_PROXY_PORT_TRANSACTION=6543
POOLER_DEFAULT_POOL_SIZE=20
POOLER_MAX_CLIENT_CONN=100
POOLER_TENANT_ID=$POOLER_TENANT_ID
POOLER_DB_POOL_SIZE=5

# ===================================================================
# PARAMÈTRES D'AUTHENTIFICATION
# ===================================================================

DISABLE_SIGNUP=false
ENABLE_EMAIL_SIGNUP=true
ENABLE_ANONYMOUS_USERS=false
ENABLE_EMAIL_AUTOCONFIRM=$EMAIL_AUTOCONFIRM
ENABLE_PHONE_SIGNUP=false
ENABLE_PHONE_AUTOCONFIRM=false

# ===================================================================
# CONFIGURATION EMAIL (SMTP)
# ===================================================================

SMTP_ADMIN_EMAIL=$SMTP_ADMIN_EMAIL
SMTP_HOST=$SMTP_HOST
SMTP_PORT=$SMTP_PORT
SMTP_USER=$SMTP_USER
SMTP_PASS=$SMTP_PASS
SMTP_SENDER_NAME=Kodo
MAILER_URLPATHS_INVITE=/auth/v1/verify
MAILER_URLPATHS_CONFIRMATION=/auth/v1/verify
MAILER_URLPATHS_RECOVERY=/auth/v1/verify
MAILER_URLPATHS_EMAIL_CHANGE=/auth/v1/verify

# ===================================================================
# STOCKAGE
# ===================================================================

STORAGE_BACKEND=file
IMGPROXY_ENABLE_WEBP_DETECTION=true

# ===================================================================
# EDGE FUNCTIONS
# ===================================================================

FUNCTIONS_VERIFY_JWT=true

# ===================================================================
# INTÉGRATION GOOGLE CALENDAR (Optionnel)
# ===================================================================

GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI=$GOOGLE_REDIRECT_URI
TOKEN_ENCRYPTION_KEY=$TOKEN_ENCRYPTION_KEY
ALLOWED_ORIGIN=$SITE_URL

# ===================================================================
# SERVEUR MCP (Optionnel — Intégration Claude AI)
# ===================================================================

MCP_HTTP_PORT=3100
MCP_AUTH_ENABLED=true
MCP_AUTH_USERNAME=admin
MCP_AUTH_PASSWORD=$MCP_AUTH_PASSWORD
MCP_APP_URL=$SITE_URL

# ===================================================================
# UTILISATEUR INITIAL (Optionnel — premier lancement)
# ===================================================================

SEED_USER_EMAIL=$SEED_EMAIL
SEED_USER_PASSWORD=$SEED_PASSWORD
SEED_USER_NAME=$SEED_NAME

# ===================================================================
# ANALYTICS (Logflare)
# ===================================================================

LOGFLARE_PUBLIC_ACCESS_TOKEN=$LOGFLARE_PUBLIC
LOGFLARE_PRIVATE_ACCESS_TOKEN=$LOGFLARE_PRIVATE

# ===================================================================
# SUPABASE STUDIO
# ===================================================================

STUDIO_DEFAULT_ORGANIZATION=Default Organization
STUDIO_DEFAULT_PROJECT=TaskManager
OPENAI_API_KEY=

# ===================================================================
# CONFIGURATION DOCKER
# ===================================================================

DOCKER_SOCKET_LOCATION=/var/run/docker.sock

# ===================================================================
# DOMAINES (Production avec SSL via Caddy)
# ===================================================================

APP_DOMAIN=$APP_DOMAIN
API_DOMAIN=$API_DOMAIN
STUDIO_DOMAIN=$STUDIO_DOMAIN
MCP_DOMAIN=$MCP_DOMAIN
CADDY_BASIC_AUTH_USERNAME=admin
CADDY_BASIC_AUTH_HASH=

# ===================================================================
# DÉPLOIEMENT
# ===================================================================

DEPLOY_VPS_USER=$DEPLOY_USER
DEPLOY_VPS_HOST=$VPS_HOST
DEPLOY_VPS_PATH=$DEPLOY_PATH
EOF

# ===================================================================
# Génération du Caddyfile (production uniquement)
# ===================================================================

if [ "$IS_PRODUCTION" = true ] && [ -f "$SCRIPT_DIR/generate-caddyfile.sh" ]; then
    echo ""
    "$SCRIPT_DIR/generate-caddyfile.sh"
fi

# ===================================================================
# Résumé
# ===================================================================

echo ""
echo "=========================================="
echo "  Configuration terminée !"
echo "=========================================="
echo ""
echo "  Fichier généré : $(basename "$ENV_FILE")"
echo ""
echo "  Secrets générés :"
echo "    - Mot de passe PostgreSQL"
echo "    - JWT secret + ANON_KEY + SERVICE_ROLE_KEY"
echo "    - Mot de passe dashboard : $DASHBOARD_PASSWORD"
echo "    - Toutes les clés de chiffrement"
echo ""
echo "  Utilisateur initial : $SEED_EMAIL / $SEED_PASSWORD"
echo ""

if [ "$IS_PRODUCTION" = true ]; then
    echo "  Prochaines étapes :"
    echo "    1. Vérifier $(basename "$ENV_FILE") si nécessaire"
    echo "    2. Démarrer la stack :"
    echo "       docker compose --env-file .env.production --profile production up -d"
    echo "    3. Créer l'utilisateur initial :"
    echo "       ./scripts/seed-user.sh"
    echo ""
else
    echo "  Prochaines étapes :"
    echo "    1. Démarrer la stack :"
    echo "       docker compose --profile local up -d"
    echo "    2. Créer l'utilisateur initial :"
    echo "       ./scripts/seed-user.sh"
    echo "    3. Ouvrir http://localhost:4010"
    echo ""
fi
