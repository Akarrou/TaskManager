#!/bin/sh

# ===================================================================
# TaskManager - Automated Backup Script (runs inside Docker container)
# ===================================================================
# Executed by crond at 2:00 AM daily
# Backs up: PostgreSQL database + storage files
# Rotation: removes auto backups older than BACKUP_RETENTION_DAYS
# ===================================================================

set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/auto_${TIMESTAMP}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-3}"

echo "=== TaskManager Automated Backup ==="
echo "Date: $(date)"
echo "Retention: ${RETENTION_DAYS} days"
echo ""

# Check database connectivity
echo "[1/4] Checking database connectivity..."
if ! pg_isready -h db -U postgres -q; then
    echo "ERROR: Database is not reachable"
    exit 1
fi
echo "OK - Database is reachable"

# Create backup directory
mkdir -p "${BACKUP_DIR}"

# Backup PostgreSQL database
echo "[2/4] Backing up PostgreSQL database..."
if pg_dumpall -h db -U postgres > "${BACKUP_DIR}/database.sql"; then
    DBSIZE=$(du -h "${BACKUP_DIR}/database.sql" | cut -f1)
    echo "OK - Database backup complete (${DBSIZE})"
else
    echo "ERROR: Database backup failed"
    rm -rf "${BACKUP_DIR}"
    exit 1
fi

# Backup storage files
echo "[3/4] Backing up storage files..."
if [ -d "/storage-data" ] && [ "$(ls -A /storage-data 2>/dev/null)" ]; then
    tar czf "${BACKUP_DIR}/storage.tar.gz" -C /storage-data . 2>/dev/null
    STORAGESIZE=$(du -h "${BACKUP_DIR}/storage.tar.gz" | cut -f1)
    echo "OK - Storage backup complete (${STORAGESIZE})"
else
    echo "SKIP - No storage files found"
fi

# Create manifest
echo "[4/4] Creating manifest..."
cat > "${BACKUP_DIR}/manifest.txt" <<EOF
TaskManager Automated Backup Manifest
======================================
Backup Name: auto_${TIMESTAMP}
Created: $(date)
Type: automated (cron)
Retention: ${RETENTION_DAYS} days

Contents:
- database.sql       : PostgreSQL full dump (pg_dumpall)
- storage.tar.gz     : Uploaded files and images
- manifest.txt       : This file

Restore Instructions:
1. Stop all containers: docker compose down
2. Restore database: cat database.sql | docker compose exec -T db psql -U postgres
3. Restore storage: docker compose exec -T storage tar xzf - -C /var/lib/storage < storage.tar.gz
4. Restart: docker compose --profile [local|production] up -d
EOF
echo "OK - Manifest created"

# Rotation: remove old automated backups
echo ""
echo "=== Rotation ==="
DELETED=$(find /backups -maxdepth 1 -name "auto_*" -type d -mtime +${RETENTION_DAYS} | wc -l | tr -d ' ')
if [ "${DELETED}" -gt 0 ]; then
    find /backups -maxdepth 1 -name "auto_*" -type d -mtime +${RETENTION_DAYS} -exec rm -rf {} \;
    echo "Removed ${DELETED} backup(s) older than ${RETENTION_DAYS} days"
else
    echo "No backups to rotate"
fi

echo ""
echo "=== Backup completed successfully ==="
TOTALSIZE=$(du -sh "${BACKUP_DIR}" | cut -f1)
echo "Location: ${BACKUP_DIR}"
echo "Total size: ${TOTALSIZE}"
