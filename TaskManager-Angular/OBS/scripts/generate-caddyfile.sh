#!/bin/bash

# ===================================================================
# Kōdo Task Manager — Générateur de Caddyfile
# ===================================================================
# Génère un Caddyfile à partir du template en utilisant les variables
# d'environnement.
# Usage : ./scripts/generate-caddyfile.sh
# ===================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OBS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE="$OBS_DIR/Caddyfile.template"
OUTPUT="$OBS_DIR/Caddyfile"

# Charger les variables d'environnement (gère les espaces, commentaires, etc.)
load_env() {
    local file="$1"
    while IFS= read -r line || [ -n "$line" ]; do
        # Ignorer les commentaires et lignes vides
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ -z "${line// }" ]] && continue
        # Extraire clé=valeur, retirer les guillemets autour de la valeur
        if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*) ]]; then
            local key="${BASH_REMATCH[1]}"
            local val="${BASH_REMATCH[2]}"
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
    echo "Variables chargées depuis .env.production"
elif [ -f "$OBS_DIR/.env.local" ]; then
    load_env "$OBS_DIR/.env.local"
    echo "Variables chargées depuis .env.local"
elif [ -f "$OBS_DIR/.env" ]; then
    load_env "$OBS_DIR/.env"
    echo "Variables chargées depuis .env"
fi

# Vérifier les variables requises
if [ -z "$APP_DOMAIN" ]; then
    echo "ERREUR : APP_DOMAIN n'est pas défini. Impossible de générer le Caddyfile."
    echo "  Relancez generate-secrets.sh --production avec un domaine valide."
    exit 1
fi

# Vérifier que le template existe
if [ ! -f "$TEMPLATE" ]; then
    echo "ERREUR : Template introuvable : $TEMPLATE"
    exit 1
fi

# Valeurs par défaut pour les sous-domaines
export APP_DOMAIN="${APP_DOMAIN}"
export API_DOMAIN="${API_DOMAIN:-api.${APP_DOMAIN#*.}}"
export STUDIO_DOMAIN="${STUDIO_DOMAIN:-supabase.${APP_DOMAIN#*.}}"
export MCP_DOMAIN="${MCP_DOMAIN:-mcp.${APP_DOMAIN#*.}}"
export CADDY_BASIC_AUTH_USERNAME="${CADDY_BASIC_AUTH_USERNAME:-admin}"

# Générer le hash basicauth si absent
if [ -z "$CADDY_BASIC_AUTH_HASH" ]; then
    if [ -n "$DASHBOARD_PASSWORD" ]; then
        if command -v caddy &> /dev/null; then
            echo "Génération du hash basicauth avec Caddy..."
            CADDY_BASIC_AUTH_HASH=$(caddy hash-password --plaintext "$DASHBOARD_PASSWORD")
            export CADDY_BASIC_AUTH_HASH
        else
            echo "Caddy non trouvé localement. Essai via Docker..."
            CADDY_BASIC_AUTH_HASH=$(docker run --rm caddy:2-alpine caddy hash-password --plaintext "$DASHBOARD_PASSWORD" 2>/dev/null || true)
            if [ -n "$CADDY_BASIC_AUTH_HASH" ]; then
                export CADDY_BASIC_AUTH_HASH
            else
                echo "ERREUR : Impossible de générer le hash basicauth. Définissez CADDY_BASIC_AUTH_HASH dans votre .env."
                echo "  Exécutez : caddy hash-password --plaintext 'votre-mot-de-passe'"
                exit 1
            fi
        fi
    else
        echo "ERREUR : CADDY_BASIC_AUTH_HASH ou DASHBOARD_PASSWORD doit être défini."
        exit 1
    fi
fi

# Générer le Caddyfile depuis le template
echo "Génération du Caddyfile depuis le template..."
envsubst '${APP_DOMAIN} ${API_DOMAIN} ${STUDIO_DOMAIN} ${MCP_DOMAIN} ${CADDY_BASIC_AUTH_USERNAME} ${CADDY_BASIC_AUTH_HASH}' \
    < "$TEMPLATE" > "$OUTPUT"

echo "Caddyfile généré : $OUTPUT"
echo ""
echo "Domaines configurés :"
echo "   Application:     https://$APP_DOMAIN"
echo "   Supabase API:    https://$API_DOMAIN"
echo "   Supabase Studio: https://$STUDIO_DOMAIN"
echo "   Serveur MCP:     https://$MCP_DOMAIN"
echo ""
