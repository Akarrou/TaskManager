#!/bin/sh
set -e

echo "🔧 Injecting runtime environment variables into Angular app..."

# Create the assets directory if it doesn't exist
mkdir -p /usr/share/nginx/html/assets

# Generate env-config.js with runtime environment variables
cat > /usr/share/nginx/html/assets/env-config.js <<EOF
// Runtime environment configuration
// This file is generated automatically by the Docker entrypoint script
window.__env = window.__env || {};
window.__env.supabaseUrl = '${SUPABASE_URL:-http://localhost:8000}';
window.__env.supabaseAnonKey = '${SUPABASE_ANON_KEY:-}';
window.__env.production = ${PRODUCTION:-true};
window.__env.projectName = '${PROJECT_NAME:-Kōdo Task Manager}';
EOF

echo "✅ Environment configuration injected successfully"
echo "   - Supabase URL: ${SUPABASE_URL:-http://localhost:8000}"
echo "   - Production mode: ${PRODUCTION:-true}"

# Continue with the default nginx entrypoint
exec "$@"
