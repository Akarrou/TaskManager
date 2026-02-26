#!/bin/bash

# ===================================================================
# TaskManager - Secret Generation Script
# ===================================================================
# Generates cryptographically secure secrets for Supabase
# Usage:
#   ./generate-secrets.sh              # Generate .env.local
#   ./generate-secrets.sh --production # Generate .env.production
# ===================================================================

set -e

# Determine output file based on argument
if [ "$1" == "--production" ]; then
    ENV_FILE=".env.production"
    EMAIL_AUTOCONFIRM="false"

    # Get VPS host: from argument, env var, or interactive prompt
    VPS_HOST="${2:-${DEPLOY_VPS_HOST:-}}"
    if [ -z "$VPS_HOST" ]; then
        read -p "Enter your VPS IP or hostname: " VPS_HOST
        if [ -z "$VPS_HOST" ]; then
            echo "ERROR: VPS host is required for production."
            exit 1
        fi
    fi

    SUPABASE_URL="http://$VPS_HOST:8000"
    SITE_URL="http://$VPS_HOST:4010"
    echo "Generating PRODUCTION environment file for $VPS_HOST..."
else
    ENV_FILE=".env.local"
    VPS_HOST="localhost"
    SUPABASE_URL="http://localhost:8000"
    SITE_URL="http://localhost:4010"
    EMAIL_AUTOCONFIRM="true"
    echo "Generating LOCAL DEVELOPMENT environment file..."
fi

# Check if output file already exists
if [ -f "$ENV_FILE" ]; then
    echo "⚠️  Warning: $ENV_FILE already exists!"
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Aborted. Existing file not modified."
        exit 1
    fi
fi

echo "🔐 Generating cryptographic secrets..."

# Helper functions
generate_secret() {
    openssl rand -base64 32 | tr -d "=+/" | cut -c1-32
}

generate_long_secret() {
    # Use hex encoding for URL-safe secrets (no special characters like / + =)
    openssl rand -hex 64 | cut -c1-88
}

generate_uuid() {
    if command -v uuidgen &> /dev/null; then
        uuidgen | tr '[:upper:]' '[:lower:]'
    else
        cat /proc/sys/kernel/random/uuid 2>/dev/null || python3 -c "import uuid; print(uuid.uuid4())"
    fi
}

# Generate JWT Secret (base64, 64 chars minimum)
JWT_SECRET=$(generate_long_secret)

# Generate other secrets
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

echo "🔑 Generating JWT tokens..."

# Function to generate Supabase JWT token
generate_jwt() {
    local role=$1
    local secret=$2
    local iat=$(date +%s)
    local exp=$((iat + 315360000))  # 10 years from now

    # Header (HS256)
    local header='{"alg":"HS256","typ":"JWT"}'
    local header_b64=$(echo -n "$header" | openssl base64 -e -A | tr '+/' '-_' | tr -d '=')

    # Payload
    local payload="{\"role\":\"$role\",\"iss\":\"supabase\",\"iat\":$iat,\"exp\":$exp}"
    local payload_b64=$(echo -n "$payload" | openssl base64 -e -A | tr '+/' '-_' | tr -d '=')

    # Signature
    local signature=$(echo -n "$header_b64.$payload_b64" | openssl dgst -sha256 -hmac "$secret" -binary | openssl base64 -e -A | tr '+/' '-_' | tr -d '=')

    echo "$header_b64.$payload_b64.$signature"
}

# Generate ANON_KEY and SERVICE_ROLE_KEY
ANON_KEY=$(generate_jwt "anon" "$JWT_SECRET")
SERVICE_ROLE_KEY=$(generate_jwt "service_role" "$JWT_SECRET")

echo "📝 Writing secrets to $ENV_FILE..."

# Create the .env file
cat > "$ENV_FILE" << EOF
# ===================================================================
# TaskManager - Environment Configuration
# Auto-generated on $(date)
# ===================================================================

# ===================================================================
# APPLICATION CONFIGURATION
# ===================================================================

BUILD_ENV=production
PRODUCTION=true
PROJECT_NAME=Kōdo Task Manager

# ===================================================================
# NETWORK & PORTS
# ===================================================================

APP_PORT=4010
KONG_HTTP_PORT=8000
KONG_HTTPS_PORT=8443
STUDIO_PORT=3000

# ===================================================================
# PUBLIC URLS
# ===================================================================

SUPABASE_PUBLIC_URL=$SUPABASE_URL
API_EXTERNAL_URL=$SUPABASE_URL
SITE_URL=$SITE_URL
ADDITIONAL_REDIRECT_URLS=$SITE_URL/*

# ===================================================================
# SECURITY & SECRETS
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
# DATABASE CONFIGURATION
# ===================================================================

POSTGRES_HOST=db
POSTGRES_DB=postgres
POSTGRES_PORT=5432
PGRST_DB_SCHEMAS=public,storage,graphql_public

# ===================================================================
# DATABASE POOLER
# ===================================================================

POOLER_PROXY_PORT_TRANSACTION=6543
POOLER_DEFAULT_POOL_SIZE=20
POOLER_MAX_CLIENT_CONN=100
POOLER_TENANT_ID=$POOLER_TENANT_ID
POOLER_DB_POOL_SIZE=5

# ===================================================================
# AUTHENTICATION SETTINGS
# ===================================================================

DISABLE_SIGNUP=false
ENABLE_EMAIL_SIGNUP=true
ENABLE_ANONYMOUS_USERS=false
ENABLE_EMAIL_AUTOCONFIRM=$EMAIL_AUTOCONFIRM
ENABLE_PHONE_SIGNUP=false
ENABLE_PHONE_AUTOCONFIRM=false

# ===================================================================
# EMAIL CONFIGURATION (SMTP)
# ===================================================================

SMTP_ADMIN_EMAIL=admin@example.com
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_SENDER_NAME=TaskManager
MAILER_URLPATHS_INVITE=/auth/v1/verify
MAILER_URLPATHS_CONFIRMATION=/auth/v1/verify
MAILER_URLPATHS_RECOVERY=/auth/v1/verify
MAILER_URLPATHS_EMAIL_CHANGE=/auth/v1/verify

# ===================================================================
# STORAGE CONFIGURATION
# ===================================================================

STORAGE_BACKEND=file
IMGPROXY_ENABLE_WEBP_DETECTION=true

# ===================================================================
# EDGE FUNCTIONS
# ===================================================================

FUNCTIONS_VERIFY_JWT=true

# ===================================================================
# GOOGLE CALENDAR INTEGRATION (Optional)
# ===================================================================

# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
# GOOGLE_REDIRECT_URI=$SITE_URL/profile/google-callback
TOKEN_ENCRYPTION_KEY=$TOKEN_ENCRYPTION_KEY
ALLOWED_ORIGIN=$SITE_URL

# ===================================================================
# MCP SERVER (Optional - Claude AI Integration)
# ===================================================================

MCP_HTTP_PORT=3100
MCP_AUTH_ENABLED=true
MCP_AUTH_USERNAME=admin
MCP_AUTH_PASSWORD=$MCP_AUTH_PASSWORD
MCP_APP_URL=$SITE_URL

# ===================================================================
# INITIAL USER (Optional - for first setup)
# ===================================================================

SEED_USER_EMAIL=admin@example.com
SEED_USER_PASSWORD=changeme123
SEED_USER_NAME=Admin User

# ===================================================================
# ANALYTICS (Logflare)
# ===================================================================

LOGFLARE_PUBLIC_ACCESS_TOKEN=$LOGFLARE_PUBLIC
LOGFLARE_PRIVATE_ACCESS_TOKEN=$LOGFLARE_PRIVATE

# ===================================================================
# SUPABASE STUDIO SETTINGS
# ===================================================================

STUDIO_DEFAULT_ORGANIZATION=Default Organization
STUDIO_DEFAULT_PROJECT=TaskManager
OPENAI_API_KEY=

# ===================================================================
# DOCKER CONFIGURATION
# ===================================================================

DOCKER_SOCKET_LOCATION=/var/run/docker.sock

# ===================================================================
# DOMAIN CONFIGURATION (Production with SSL via Caddy)
# ===================================================================

APP_DOMAIN=kodo.example.com
API_DOMAIN=api.example.com
STUDIO_DOMAIN=supabase.example.com
MCP_DOMAIN=mcp.example.com
CADDY_BASIC_AUTH_USERNAME=admin
CADDY_BASIC_AUTH_HASH=

# ===================================================================
# DEPLOYMENT
# ===================================================================

DEPLOY_VPS_USER=ubuntu
DEPLOY_VPS_HOST=$VPS_HOST
DEPLOY_VPS_PATH=~/taskmanager
EOF

echo "✅ Environment file created: $ENV_FILE"
echo ""
echo "📋 Summary:"
echo "   - PostgreSQL Password: ✓ Generated"
echo "   - JWT Secret: ✓ Generated"
echo "   - ANON_KEY: ✓ Generated"
echo "   - SERVICE_ROLE_KEY: ✓ Generated"
echo "   - Dashboard Password: ✓ Generated"
echo "   - TOKEN_ENCRYPTION_KEY: ✓ Generated"
echo "   - MCP_AUTH_PASSWORD: ✓ Generated"
echo "   - All encryption keys: ✓ Generated"
echo ""
echo "🔒 IMPORTANT SECURITY NOTES:"
echo "   - Add $ENV_FILE to .gitignore (DO NOT commit to git!)"
echo "   - Dashboard credentials: admin / $DASHBOARD_PASSWORD"
echo "   - Keep SERVICE_ROLE_KEY secret (full database access!)"
echo ""

if [ "$1" == "--production" ]; then
    echo "⚠️  PRODUCTION CHECKLIST:"
    echo "   [ ] Update APP_DOMAIN, API_DOMAIN, STUDIO_DOMAIN, MCP_DOMAIN (for SSL)"
    echo "   [ ] Configure SMTP settings for email"
    echo "   [ ] Configure Google OAuth (optional)"
    echo "   [ ] Review all security settings"
    echo "   [ ] Run 'make caddy' to generate Caddyfile"
    echo ""
fi

echo "🚀 Next steps:"
echo "   1. Review and customize $ENV_FILE if needed"
echo "   2. Run: docker compose --profile ${1/--production/production} ${1/--production/local} up -d"
echo "   3. Access Supabase Studio at http://localhost:3000"
echo ""
