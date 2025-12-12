#!/bin/bash
# Script de lancement local avec rebuild automatique

set -euo pipefail

echo "🔨 Building Angular application..."
docker compose build app

echo "🚀 Starting all services..."
docker compose --profile local up -d

echo "✅ All services started!"
echo ""
echo "📊 Service status:"
docker compose ps

echo ""
echo "🌐 Access points:"
echo "   - Application:      http://localhost:4010"
echo "   - Supabase Studio:  http://localhost:3000"
echo "   - API Gateway:      http://localhost:8000"
