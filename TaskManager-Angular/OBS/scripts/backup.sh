#!/bin/bash

# ===================================================================
# TaskManager - Backup Script
# ===================================================================
# Creates complete backup of database and storage files
# Usage: ./backup.sh [backup_name]
# ===================================================================

set -e

# Configuration
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="${1:-backup_$TIMESTAMP}"
BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"

echo "📦 TaskManager Backup Script"
echo "============================"
echo ""

# Create backup directory
mkdir -p "$BACKUP_PATH"

echo "🔍 Checking Docker containers..."

# Check if containers are running
if ! docker compose ps | grep -q "supabase-db"; then
    echo "❌ Error: Database container is not running"
    echo "   Start the stack with: docker compose --profile local up -d"
    exit 1
fi

echo "✅ Containers are running"
echo ""

# Backup PostgreSQL database
echo "💾 Backing up PostgreSQL database..."
docker compose exec -T db pg_dumpall -U postgres > "$BACKUP_PATH/database.sql"
DBSIZE=$(du -h "$BACKUP_PATH/database.sql" | cut -f1)
echo "✅ Database backup complete ($DBSIZE)"
echo ""

# Backup Storage files
echo "📁 Backing up storage files..."
if docker compose exec -T storage tar czf - /var/lib/storage 2>/dev/null > "$BACKUP_PATH/storage.tar.gz"; then
    STORAGESIZE=$(du -h "$BACKUP_PATH/storage.tar.gz" | cut -f1)
    echo "✅ Storage backup complete ($STORAGESIZE)"
else
    echo "⚠️  Storage backup skipped (no files or permission issue)"
fi
echo ""

# Backup environment configuration
echo "⚙️  Backing up configuration..."
if [ -f ".env.local" ]; then
    cp .env.local "$BACKUP_PATH/.env.backup"
    echo "✅ Environment config backed up (.env.local)"
elif [ -f ".env.production" ]; then
    cp .env.production "$BACKUP_PATH/.env.backup"
    echo "✅ Environment config backed up (.env.production)"
else
    echo "⚠️  No environment file found to backup"
fi
echo ""

# Create backup manifest
cat > "$BACKUP_PATH/manifest.txt" <<EOF
TaskManager Backup Manifest
===========================
Backup Name: $BACKUP_NAME
Created: $(date)
Hostname: $(hostname)

Contents:
- database.sql       : PostgreSQL full dump
- storage.tar.gz     : Uploaded files and images
- .env.backup        : Environment configuration

Restore Instructions:
1. Stop all containers: docker compose down
2. Restore database: cat database.sql | docker compose exec -T db psql -U postgres
3. Restore storage: docker compose exec -T storage tar xzf - -C / < storage.tar.gz
4. Copy .env.backup to .env.local or .env.production
5. Restart: docker compose --profile [local|production] up -d
EOF

echo "📋 Backup Summary"
echo "================="
echo "Location: $BACKUP_PATH"
echo "Files:"
ls -lh "$BACKUP_PATH" | tail -n +2
echo ""
echo "Total size: $(du -sh "$BACKUP_PATH" | cut -f1)"
echo ""
echo "✅ Backup completed successfully!"
echo ""
echo "📝 To restore this backup:"
echo "   1. docker compose down"
echo "   2. cat $BACKUP_PATH/database.sql | docker compose exec -T db psql -U postgres"
echo "   3. docker compose --profile [local|production] up -d"
echo ""
