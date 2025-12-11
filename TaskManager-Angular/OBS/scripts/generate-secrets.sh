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
    SUPABASE_URL="http://YOUR_VPS_IP:8000"
    SITE_URL="http://YOUR_VPS_IP:4010"
    EMAIL_AUTOCONFIRM="false"
    echo "🏭 Generating PRODUCTION environment file..."
else
    ENV_FILE=".env.local"
    SUPABASE_URL="http://localhost:8000"
    SITE_URL="http://localhost:4010"
    EMAIL_AUTOCONFIRM="true"
    echo "🛠️  Generating LOCAL DEVELOPMENT environment file..."
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
EOF

echo "✅ Environment file created: $ENV_FILE"
echo ""
echo "📋 Summary:"
echo "   - PostgreSQL Password: ✓ Generated"
echo "   - JWT Secret: ✓ Generated"
echo "   - ANON_KEY: ✓ Generated"
echo "   - SERVICE_ROLE_KEY: ✓ Generated"
echo "   - Dashboard Password: ✓ Generated"
echo "   - All encryption keys: ✓ Generated"
echo ""
echo "🔒 IMPORTANT SECURITY NOTES:"
echo "   - Add $ENV_FILE to .gitignore (DO NOT commit to git!)"
echo "   - Dashboard credentials: admin / $DASHBOARD_PASSWORD"
echo "   - Keep SERVICE_ROLE_KEY secret (full database access!)"
echo ""

if [ "$1" == "--production" ]; then
    echo "⚠️  PRODUCTION CHECKLIST:"
    echo "   [ ] Update SUPABASE_PUBLIC_URL with your domain/IP"
    echo "   [ ] Update SITE_URL with your domain/IP"
    echo "   [ ] Configure SMTP settings for email"
    echo "   [ ] Set ENABLE_EMAIL_AUTOCONFIRM=false"
    echo "   [ ] Review all security settings"
    echo ""
fi

echo "🚀 Next steps:"
echo "   1. Review and customize $ENV_FILE if needed"
echo "   2. Run: docker compose --profile ${1/--production/production} ${1/--production/local} up -d"
echo "   3. Access Supabase Studio at http://localhost:3000"
echo ""
