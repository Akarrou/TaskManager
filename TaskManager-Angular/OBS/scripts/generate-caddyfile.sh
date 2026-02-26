#!/bin/bash

# ===================================================================
# TaskManager - Caddyfile Generator
# ===================================================================
# Generates a Caddyfile from the template using environment variables.
# Usage: ./scripts/generate-caddyfile.sh
# ===================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OBS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE="$OBS_DIR/Caddyfile.template"
OUTPUT="$OBS_DIR/Caddyfile"

# Load environment variables safely (handles values with spaces, comments, etc.)
load_env() {
    local file="$1"
    while IFS= read -r line || [ -n "$line" ]; do
        # Skip comments and empty lines
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ -z "${line// }" ]] && continue
        # Extract key=value, strip surrounding quotes from value
        if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*) ]]; then
            local key="${BASH_REMATCH[1]}"
            local val="${BASH_REMATCH[2]}"
            # Remove surrounding quotes if present
            val="${val%\"}"
            val="${val#\"}"
            val="${val%\'}"
            val="${val#\'}"
            export "$key=$val"
        fi
    done < "$file"
}

if [ -f "$OBS_DIR/.env.production" ]; then
    load_env "$OBS_DIR/.env.production"
    echo "Loaded variables from .env.production"
elif [ -f "$OBS_DIR/.env.local" ]; then
    load_env "$OBS_DIR/.env.local"
    echo "Loaded variables from .env.local"
elif [ -f "$OBS_DIR/.env" ]; then
    load_env "$OBS_DIR/.env"
    echo "Loaded variables from .env"
fi

# Check required variables
if [ -z "$APP_DOMAIN" ] || [ "$APP_DOMAIN" = "kodo.example.com" ]; then
    echo "⚠️  No custom domain configured. Generating Caddyfile for IP-based access (no SSL)."
    echo ""

    # Get VPS IP or use localhost
    VPS_IP="${DEPLOY_VPS_HOST:-localhost}"

    cat > "$OUTPUT" << IPEOF
# ===================================================================
# TaskManager - Caddy Configuration (IP-based, no SSL)
# Auto-generated on $(date)
# ===================================================================

:80 {
    reverse_proxy app:4010
}

:8080 {
    reverse_proxy kong:8000
}

:3080 {
    reverse_proxy studio:3000
}

:3180 {
    reverse_proxy mcp-server:3100 {
        flush_interval -1
    }
}
IPEOF

    echo "✅ Generated IP-based Caddyfile: $OUTPUT"
    echo ""
    echo "📋 Access URLs:"
    echo "   Application:     http://$VPS_IP"
    echo "   Supabase API:    http://$VPS_IP:8080"
    echo "   Supabase Studio: http://$VPS_IP:3080"
    echo "   MCP Server:      http://$VPS_IP:3180"
    exit 0
fi

# Check template exists
if [ ! -f "$TEMPLATE" ]; then
    echo "❌ Template not found: $TEMPLATE"
    exit 1
fi

# Set defaults
export APP_DOMAIN="${APP_DOMAIN}"
export API_DOMAIN="${API_DOMAIN:-api.${APP_DOMAIN#*.}}"
export STUDIO_DOMAIN="${STUDIO_DOMAIN:-supabase.${APP_DOMAIN#*.}}"
export MCP_DOMAIN="${MCP_DOMAIN:-mcp.${APP_DOMAIN#*.}}"
export CADDY_BASIC_AUTH_USERNAME="${CADDY_BASIC_AUTH_USERNAME:-admin}"

# Generate basicauth hash if not provided
if [ -z "$CADDY_BASIC_AUTH_HASH" ]; then
    if [ -n "$DASHBOARD_PASSWORD" ]; then
        if command -v caddy &> /dev/null; then
            echo "🔐 Generating basicauth hash with Caddy..."
            CADDY_BASIC_AUTH_HASH=$(caddy hash-password --plaintext "$DASHBOARD_PASSWORD")
            export CADDY_BASIC_AUTH_HASH
        else
            echo "⚠️  Caddy not found locally. Trying Docker..."
            CADDY_BASIC_AUTH_HASH=$(docker run --rm caddy:2-alpine caddy hash-password --plaintext "$DASHBOARD_PASSWORD" 2>/dev/null || true)
            if [ -n "$CADDY_BASIC_AUTH_HASH" ]; then
                export CADDY_BASIC_AUTH_HASH
            else
                echo "❌ Cannot generate basicauth hash. Set CADDY_BASIC_AUTH_HASH in your .env file."
                echo "   Run: caddy hash-password --plaintext 'your-password'"
                exit 1
            fi
        fi
    else
        echo "❌ CADDY_BASIC_AUTH_HASH or DASHBOARD_PASSWORD must be set."
        exit 1
    fi
fi

# Generate Caddyfile from template
echo "📝 Generating Caddyfile from template..."
envsubst '${APP_DOMAIN} ${API_DOMAIN} ${STUDIO_DOMAIN} ${MCP_DOMAIN} ${CADDY_BASIC_AUTH_USERNAME} ${CADDY_BASIC_AUTH_HASH}' \
    < "$TEMPLATE" > "$OUTPUT"

echo "✅ Generated Caddyfile: $OUTPUT"
echo ""
echo "📋 Configured domains:"
echo "   Application:     https://$APP_DOMAIN"
echo "   Supabase API:    https://$API_DOMAIN"
echo "   Supabase Studio: https://$STUDIO_DOMAIN"
echo "   MCP Server:      https://$MCP_DOMAIN"
echo ""
