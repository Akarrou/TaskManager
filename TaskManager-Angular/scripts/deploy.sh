#!/bin/bash

# ===================================================================
# TaskManager - Full Deployment Script (from local machine)
# ===================================================================
# Builds, syncs, applies migrations, and rebuilds Docker on VPS
# Also deploys the MCP server for Claude Code integration
# Usage: ./scripts/deploy.sh
# ===================================================================

set -e

# Configuration
VPS_USER="ubuntu"
VPS_HOST="51.178.52.150"
VPS_PATH="~/taskmanager"
LOCAL_PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MCP_SERVER_DIR="$(cd "$(dirname "$0")/../../mcp-server" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 TaskManager - Full Deployment${NC}"
echo "=================================="
echo ""

# Step 1: Build Angular application
echo -e "${YELLOW}📦 Step 1/5: Building Angular application...${NC}"
cd "$LOCAL_PROJECT_DIR"
source ~/.nvm/nvm.sh 2>/dev/null || true
nvm use 24 2>/dev/null || true
pnpm run build
echo -e "${GREEN}✅ Angular build completed${NC}"
echo ""

# Step 2: Build MCP server
echo -e "${YELLOW}📦 Step 2/5: Building MCP server...${NC}"
cd "$MCP_SERVER_DIR"
pnpm run build
echo -e "${GREEN}✅ MCP server build completed${NC}"
echo ""

# Step 3: Sync files to VPS
echo -e "${YELLOW}📤 Step 3/5: Syncing files to VPS...${NC}"

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

# Sync MCP server
echo "   Syncing MCP server..."
rsync -avz --delete \
    --exclude='node_modules' \
    --exclude='.env' \
    "$MCP_SERVER_DIR/" \
    "$VPS_USER@$VPS_HOST:/opt/mcp-server/"

echo -e "${GREEN}✅ Files synced${NC}"
echo ""

# Step 4: Apply pending migrations
echo -e "${YELLOW}🗄️  Step 4/5: Applying pending migrations...${NC}"

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
echo -e "${YELLOW}🐳 Step 5/5: Rebuilding and restarting services...${NC}"

# Rebuild Angular app container
echo "   Rebuilding Angular app container..."
ssh "$VPS_USER@$VPS_HOST" "cd $VPS_PATH/OBS && docker compose build app --no-cache && docker compose up -d app"
echo -e "${GREEN}   ✅ Angular app container restarted${NC}"

# Restart MCP server
echo "   Restarting MCP server..."
ssh "$VPS_USER@$VPS_HOST" "sudo systemctl restart mcp-server"
echo -e "${GREEN}   ✅ MCP server restarted${NC}"

echo ""

# Final status
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Application:     https://kodo.logicfractals.fr"
echo "Supabase API:    https://api.logicfractals.fr"
echo "Supabase Studio: https://supabase.logicfractals.fr"
echo "MCP Server:      https://mcp.logicfractals.fr"
echo ""
