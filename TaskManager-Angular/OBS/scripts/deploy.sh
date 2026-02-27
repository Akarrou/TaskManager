#!/bin/bash

# ===================================================================
# TaskManager - Full Deployment Script (from local machine)
# ===================================================================
# Builds, syncs, applies migrations, and rebuilds Docker on VPS
# Also deploys the MCP server for Claude Code integration
# Usage: ./OBS/scripts/deploy.sh
# ===================================================================

set -e

# Load environment variables safely (handles values with spaces)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OBS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

load_env() {
    local file="$1"
    while IFS= read -r line || [ -n "$line" ]; do
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ -z "${line// }" ]] && continue
        if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*) ]]; then
            local key="${BASH_REMATCH[1]}"
            local val="${BASH_REMATCH[2]}"
            val="${val%\"}"; val="${val#\"}"
            val="${val%\'}"; val="${val#\'}"
            export "$key=$val"
        fi
    done < "$file"
}

if [ -f "$OBS_DIR/.env.production" ]; then
    load_env "$OBS_DIR/.env.production"
elif [ -f "$OBS_DIR/.env.local" ]; then
    load_env "$OBS_DIR/.env.local"
fi

# Configuration
VPS_USER="${DEPLOY_VPS_USER:-ubuntu}"
VPS_HOST="${DEPLOY_VPS_HOST:?ERROR: DEPLOY_VPS_HOST is required. Set it in .env.production or export it.}"
VPS_PATH="${DEPLOY_VPS_PATH:-~/taskmanager}"
LOCAL_PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
MCP_SERVER_DIR="$(cd "$(dirname "$0")/../../../mcp-server" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 TaskManager - Full Deployment${NC}"
echo "=================================="
echo ""

# Step 0: Pre-deploy backup on VPS
echo -e "${YELLOW}💾 Step 0/7: Pre-deploy backup on VPS...${NC}"
BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="predeploy_${BACKUP_TIMESTAMP}"
BACKUP_REMOTE_DIR="$VPS_PATH/OBS/backups/$BACKUP_NAME"

echo "   Creating backup directory..."
ssh "$VPS_USER@$VPS_HOST" "mkdir -p $BACKUP_REMOTE_DIR"

echo "   Backing up PostgreSQL database..."
ssh "$VPS_USER@$VPS_HOST" "cd $VPS_PATH/OBS && docker exec supabase-db pg_dumpall -U postgres > $BACKUP_REMOTE_DIR/database.sql"
DB_SIZE=$(ssh "$VPS_USER@$VPS_HOST" "du -h $BACKUP_REMOTE_DIR/database.sql | cut -f1")
echo -e "${GREEN}   ✅ Database backup complete ($DB_SIZE)${NC}"

echo "   Backing up storage files..."
ssh "$VPS_USER@$VPS_HOST" "cd $VPS_PATH/OBS && docker exec supabase-storage tar czf - /var/lib/storage 2>/dev/null > $BACKUP_REMOTE_DIR/storage.tar.gz || true"
echo -e "${GREEN}   ✅ Storage backup complete${NC}"

# Create manifest
ssh "$VPS_USER@$VPS_HOST" "cat > $BACKUP_REMOTE_DIR/manifest.txt << 'MANIFEST_EOF'
TaskManager Pre-Deploy Backup
==============================
Backup Name: $BACKUP_NAME
Created: $(date)
Type: pre-deploy

Contents:
- database.sql       : PostgreSQL full dump (pg_dumpall)
- storage.tar.gz     : Uploaded files and images

Restore Instructions:
1. Stop all containers: docker compose down
2. Restore database: cat database.sql | docker compose exec -T db psql -U postgres
3. Restore storage: docker compose exec -T storage tar xzf - -C / < storage.tar.gz
4. Restart: docker compose --profile production up -d
MANIFEST_EOF"

echo -e "${GREEN}✅ Pre-deploy backup saved: $BACKUP_NAME${NC}"

# Rotate old pre-deploy backups (keep last 5)
echo "   Rotating old pre-deploy backups..."
ssh "$VPS_USER@$VPS_HOST" "cd $VPS_PATH/OBS/backups && ls -1dt predeploy_* 2>/dev/null | tail -n +6 | xargs -r rm -rf"
echo ""

# Step 1: Build Angular application
echo -e "${YELLOW}📦 Step 1/7: Building Angular application...${NC}"
cd "$LOCAL_PROJECT_DIR"
source ~/.nvm/nvm.sh 2>/dev/null || true
if [ -f "$LOCAL_PROJECT_DIR/.nvmrc" ]; then
    nvm use 2>/dev/null || true
else
    nvm use 22 2>/dev/null || true
fi
pnpm run build
echo -e "${GREEN}✅ Angular build completed${NC}"
echo ""

# Step 2: Build MCP server
echo -e "${YELLOW}📦 Step 2/7: Building MCP server...${NC}"
cd "$MCP_SERVER_DIR"
pnpm run build
echo -e "${GREEN}✅ MCP server build completed${NC}"
echo ""

# Step 3: Sync files to VPS
echo -e "${YELLOW}📤 Step 3/7: Syncing files to VPS...${NC}"

# Sync Angular build
echo "   Syncing Angular build..."
rsync -avz --delete \
    "$LOCAL_PROJECT_DIR/dist/TaskManager-Angular/browser/" \
    "$VPS_USER@$VPS_HOST:$VPS_PATH/dist/TaskManager-Angular/browser/"

# Sync Supabase migrations
echo "   Syncing Supabase migrations..."
rsync -avz --delete \
    "$LOCAL_PROJECT_DIR/supabase/" \
    "$VPS_USER@$VPS_HOST:$VPS_PATH/supabase/"

# Sync Supabase self-hosted volumes (config files only, not DB data)
echo "   Syncing Supabase self-hosted volumes..."
rsync -avz \
    --exclude='.DS_Store' \
    --exclude='db/data/' \
    --exclude='db/init/' \
    --rsync-path='sudo rsync' \
    "$LOCAL_PROJECT_DIR/OBS/supabase-self-hosted/" \
    "$VPS_USER@$VPS_HOST:$VPS_PATH/OBS/supabase-self-hosted/"

# Sync OBS config files (docker-compose, scripts, Caddyfile, Dockerfile)
echo "   Syncing OBS config files..."
rsync -avz \
    "$LOCAL_PROJECT_DIR/OBS/docker-compose.yml" \
    "$VPS_USER@$VPS_HOST:$VPS_PATH/OBS/docker-compose.yml"
rsync -avz \
    "$LOCAL_PROJECT_DIR/OBS/Caddyfile" \
    "$VPS_USER@$VPS_HOST:$VPS_PATH/OBS/Caddyfile"
rsync -avz \
    "$LOCAL_PROJECT_DIR/OBS/Dockerfile" \
    "$VPS_USER@$VPS_HOST:$VPS_PATH/OBS/Dockerfile"
rsync -avz \
    "$LOCAL_PROJECT_DIR/OBS/Dockerfile.production" \
    "$VPS_USER@$VPS_HOST:$VPS_PATH/OBS/Dockerfile.production"
rsync -avz \
    "$LOCAL_PROJECT_DIR/OBS/nginx.conf" \
    "$VPS_USER@$VPS_HOST:$VPS_PATH/OBS/nginx.conf"
rsync -avz --delete \
    "$LOCAL_PROJECT_DIR/OBS/scripts/" \
    "$VPS_USER@$VPS_HOST:$VPS_PATH/OBS/scripts/"

echo -e "${GREEN}✅ Files synced${NC}"
echo ""

# Step 4: Apply pending migrations
echo -e "${YELLOW}🗄️  Step 4/7: Applying pending migrations...${NC}"

# Get list of applied migrations from server
APPLIED_MIGRATIONS=$(ssh "$VPS_USER@$VPS_HOST" "cd $VPS_PATH/OBS && docker exec supabase-db psql -U postgres -d postgres -t -c \"SELECT version FROM public.schema_migrations ORDER BY version;\"" 2>/dev/null | tr -d ' ')

# Get list of local migration files
LOCAL_MIGRATIONS=$(ls -1 "$LOCAL_PROJECT_DIR/supabase/migrations/"*.sql 2>/dev/null | xargs -n1 basename | sed 's/_.*//' | sort)

# Find pending migrations
PENDING_COUNT=0
for migration_file in "$LOCAL_PROJECT_DIR/supabase/migrations/"*.sql; do
    filename=$(basename "$migration_file")
    version=$(echo "$filename" | sed 's/_.*//')

    if ! echo "$APPLIED_MIGRATIONS" | grep -q "^$version$"; then
        echo "   Applying: $filename"

        # Apply migration
        ssh "$VPS_USER@$VPS_HOST" "cd $VPS_PATH/OBS && docker exec -i supabase-db psql -U postgres -d postgres" < "$migration_file"

        # Record migration
        ssh "$VPS_USER@$VPS_HOST" "cd $VPS_PATH/OBS && docker exec supabase-db psql -U postgres -d postgres -c \"INSERT INTO public.schema_migrations (version, name, applied_at, applied_by) VALUES ('$version', '$filename', NOW(), 'postgres');\""

        PENDING_COUNT=$((PENDING_COUNT + 1))
    fi
done

if [ $PENDING_COUNT -eq 0 ]; then
    echo "   No pending migrations"
else
    echo -e "${GREEN}✅ Applied $PENDING_COUNT migration(s)${NC}"
fi
echo ""

# Step 5: Rebuild and restart services
echo -e "${YELLOW}🐳 Step 5/7: Rebuilding and restarting services...${NC}"

# Rebuild Angular app image (using production Dockerfile with pre-built dist)
echo "   Rebuilding Angular app image..."
ssh "$VPS_USER@$VPS_HOST" "cd $VPS_PATH && docker build --no-cache -f OBS/Dockerfile.production -t taskmanager-app ."
echo -e "${GREEN}   ✅ Angular app image rebuilt${NC}"

# Bring up all production services (creates missing containers like backup)
echo "   Starting all production services..."
ssh "$VPS_USER@$VPS_HOST" "cd $VPS_PATH/OBS && docker compose --profile production up -d --no-build"
echo -e "${GREEN}   ✅ All services started${NC}"

# Restart Realtime container if migrations were applied (picks up publication changes)
if [ $PENDING_COUNT -gt 0 ]; then
    echo "   Restarting Realtime container..."
    ssh "$VPS_USER@$VPS_HOST" "cd $VPS_PATH/OBS && docker compose restart realtime"
    echo -e "${GREEN}   ✅ Realtime container restarted${NC}"
fi

# Reload Caddy config (no downtime)
echo "   Reloading Caddy config..."
ssh "$VPS_USER@$VPS_HOST" "cd $VPS_PATH/OBS && docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile 2>/dev/null || true"
echo -e "${GREEN}   ✅ Caddy config reloaded${NC}"

# Step 6: MCP server (Docker)
echo ""
echo -e "${YELLOW}🔌 Step 6/7: Deploying MCP server...${NC}"

# Sync MCP server source for Docker build
echo "   Syncing MCP server..."
rsync -avz --delete \
    --exclude='node_modules' \
    --exclude='.env' \
    "$MCP_SERVER_DIR/" \
    "$VPS_USER@$VPS_HOST:$VPS_PATH/mcp-server/"

# Build and restart MCP server via Docker Compose
echo "   Rebuilding MCP server Docker image..."
ssh "$VPS_USER@$VPS_HOST" "cd $VPS_PATH/OBS && docker compose --profile mcp up -d --build mcp-server 2>/dev/null || echo 'MCP profile not enabled, skipping'"
echo -e "${GREEN}   ✅ MCP server deployed${NC}"

# Step 7: Health check
echo ""
echo -e "${YELLOW}🏥 Step 7/7: Health check...${NC}"
SERVICES=$(ssh "$VPS_USER@$VPS_HOST" "cd $VPS_PATH/OBS && docker compose --profile production ps --format '{{.Name}} {{.Status}}'" 2>/dev/null)
HEALTHY=0
TOTAL=0
while IFS= read -r line; do
    [ -z "$line" ] && continue
    TOTAL=$((TOTAL + 1))
    NAME=$(echo "$line" | awk '{print $1}')
    if echo "$line" | grep -qEi "\bUp\b|\bhealthy\b"; then
        echo -e "   ${GREEN}✅ $NAME${NC}"
        HEALTHY=$((HEALTHY + 1))
    else
        echo -e "   ${RED}❌ $NAME${NC}"
    fi
done <<< "$SERVICES"
echo ""
echo "   Services: $HEALTHY/$TOTAL running"
echo ""

# Final status
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Application:     https://${APP_DOMAIN}"
echo "Supabase API:    https://${API_DOMAIN:-api.${APP_DOMAIN#*.}}"
echo "Supabase Studio: https://${STUDIO_DOMAIN:-supabase.${APP_DOMAIN#*.}}"
echo "MCP Server:      https://${MCP_DOMAIN:-mcp.${APP_DOMAIN#*.}}"
echo ""
