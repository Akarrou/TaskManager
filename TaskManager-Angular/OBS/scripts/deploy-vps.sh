#!/bin/bash

# ===================================================================
# TaskManager - VPS Deployment Script
# ===================================================================
# Automated deployment to VPS server
# Usage: ./deploy-vps.sh
# ===================================================================

set -e

echo "🚀 TaskManager VPS Deployment"
echo "=============================="
echo ""

# Check if running on VPS (basic check)
if [ -f ".env.local" ] && [ ! -f ".env.production" ]; then
    echo "⚠️  Warning: Found .env.local but not .env.production"
    echo "   This script is intended for VPS production deployment"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check prerequisites
echo "🔍 Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed"
    echo "   Install Docker: https://docs.docker.com/engine/install/"
    exit 1
fi

if ! command -v docker compose &> /dev/null; then
    echo "❌ Docker Compose is not installed"
    exit 1
fi

echo "✅ Prerequisites met"
echo ""

# Generate production secrets if not exists
if [ ! -f ".env.production" ]; then
    echo "🔐 Generating production secrets..."
    ./scripts/generate-secrets.sh --production
    echo ""
    echo "⚠️  IMPORTANT: Review .env.production and update:"
    echo "   - SUPABASE_PUBLIC_URL (your domain or VPS IP)"
    echo "   - SITE_URL (your domain or VPS IP)"
    echo "   - SMTP configuration (for emails)"
    echo ""
    read -p "Press Enter after reviewing and updating .env.production..."
else
    echo "✅ Found existing .env.production"
    echo ""
fi

# Prompt for VPS configuration
read -p "Enter your VPS IP or domain (e.g., 192.168.1.100 or yourdomain.com): " VPS_HOST
read -p "Do you have a domain name configured? (y/N): " HAS_DOMAIN

if [[ $HAS_DOMAIN =~ ^[Yy]$ ]]; then
    read -p "Enter your domain name (e.g., taskmanager.com): " DOMAIN
    USE_SSL=true
    SUPABASE_URL="https://api.$DOMAIN"
    SITE_URL="https://$DOMAIN"
else
    USE_SSL=false
    SUPABASE_URL="http://$VPS_HOST:8000"
    SITE_URL="http://$VPS_HOST:4010"
fi

echo ""
echo "📝 Deployment Configuration:"
echo "   VPS Host: $VPS_HOST"
echo "   Supabase URL: $SUPABASE_URL"
echo "   Site URL: $SITE_URL"
echo "   SSL/Domain: $USE_SSL"
echo ""

# Update .env.production with user values
echo "⚙️  Updating configuration..."
sed -i.bak "s|SUPABASE_PUBLIC_URL=.*|SUPABASE_PUBLIC_URL=$SUPABASE_URL|g" .env.production
sed -i.bak "s|API_EXTERNAL_URL=.*|API_EXTERNAL_URL=$SUPABASE_URL|g" .env.production
sed -i.bak "s|SITE_URL=.*|SITE_URL=$SITE_URL|g" .env.production
sed -i.bak "s|ADDITIONAL_REDIRECT_URLS=.*|ADDITIONAL_REDIRECT_URLS=$SITE_URL/*|g" .env.production

echo "✅ Configuration updated"
echo ""

# Pull latest images
echo "📥 Pulling Docker images..."
docker compose pull
echo ""

# Build application
echo "🔨 Building application..."
docker compose build --no-cache app
echo ""

# Stop existing containers
echo "🛑 Stopping existing containers (if any)..."
docker compose down
echo ""

# Start services
echo "🚀 Starting services..."
if [ "$USE_SSL" = true ]; then
    echo "   Using Caddy profile with SSL..."
    docker compose --profile production up -d
else
    echo "   Using production profile without SSL..."
    docker compose --profile production up -d
fi
echo ""

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check service health
echo "🏥 Health check..."
HEALTHY=0
TOTAL=0

for service in db kong auth rest storage app backup; do
    TOTAL=$((TOTAL + 1))
    if docker compose ps | grep "$service" | grep -q "healthy\|Up"; then
        echo "   ✅ $service"
        HEALTHY=$((HEALTHY + 1))
    else
        echo "   ❌ $service"
    fi
done

echo ""
echo "Services healthy: $HEALTHY/$TOTAL"
echo ""

if [ $HEALTHY -eq $TOTAL ]; then
    echo "✅ Deployment successful!"
    echo ""
    echo "📋 Access your application:"
    echo "   Application: $SITE_URL"
    echo "   Supabase Studio: http://$VPS_HOST:3000"
    echo "   API Gateway: $SUPABASE_URL"
    echo ""
    echo "🔑 Default Studio credentials:"
    echo "   Username: admin"
    echo "   Password: (check .env.production for DASHBOARD_PASSWORD)"
    echo ""

    if [ "$USE_SSL" = false ]; then
        echo "⚠️  Security Recommendations:"
        echo "   - Configure a domain name and enable SSL/HTTPS"
        echo "   - Set up firewall rules (UFW or iptables)"
        echo "   - Change default Studio password"
        echo "   - Configure SMTP for email notifications"
        echo ""
    fi

    echo "💾 Automated backups:"
    echo "   Schedule: daily at 2:00 AM (Europe/Paris)"
    echo "   Retention: ${BACKUP_RETENTION_DAYS:-3} days"
    echo "   Location: ./backups/auto_*"
    echo "   Logs: docker compose logs backup"
    echo ""
    echo "📊 Useful commands:"
    echo "   View logs: docker compose logs -f"
    echo "   Check status: docker compose ps"
    echo "   Restart: docker compose restart"
    echo "   Stop: docker compose down"
    echo "   Manual backup: ./scripts/backup.sh"
    echo "   Test auto backup: docker compose exec backup /scripts/backup-cron.sh"
    echo ""
else
    echo "⚠️  Some services failed to start properly"
    echo "   Check logs: docker compose logs"
    echo ""
    exit 1
fi
