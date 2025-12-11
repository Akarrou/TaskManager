#!/bin/bash

#===============================================================================
# 🌐 Déploiement Supabase Self-Hosted sur VPS (Ubuntu/Debian)
#===============================================================================
# Script d'installation ULTRA-SIMPLE pour VPS
# Compatible: Ubuntu 20.04+, Debian 11+
#
# Usage sur VPS (une seule commande):
#   curl -fsSL https://get.docker.com | sh && \
#   curl -fsSL https://raw.githubusercontent.com/.../deploy-vps.sh | bash
#
# OU localement:
#   chmod +x deploy-vps.sh
#   ./deploy-vps.sh
#===============================================================================

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo -e "${BLUE}=========================================================================${NC}"
echo -e "${BLUE}🚀 Déploiement Supabase Self-Hosted sur VPS${NC}"
echo -e "${BLUE}=========================================================================${NC}"
echo ""

# Fonction pour logger
log() {
    echo -e "${GREEN}✓ $1${NC}"
}

warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
    exit 1
}

info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Détecter l'OS
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        VER=$VERSION_ID
    else
        error "Système d'exploitation non supporté"
    fi

    log "Système détecté: $OS $VER"
}

# Installer Docker (si pas déjà installé)
install_docker() {
    echo ""
    info "Vérification de Docker..."

    if command -v docker &> /dev/null; then
        log "Docker déjà installé: $(docker --version)"
        return
    fi

    info "Installation de Docker..."

    # Installation Docker
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh

    # Démarrer Docker
    systemctl enable docker
    systemctl start docker

    log "Docker installé avec succès"
}

# Installer Docker Compose (si pas déjà installé)
install_docker_compose() {
    echo ""
    info "Vérification de Docker Compose..."

    if docker compose version &> /dev/null; then
        log "Docker Compose déjà installé"
        return
    fi

    info "Installation de Docker Compose..."

    # Docker Compose est inclus avec Docker moderne
    # Vérifier version
    if ! docker compose version &> /dev/null; then
        error "Docker Compose n'est pas disponible. Installez Docker version récente."
    fi

    log "Docker Compose installé"
}

# Installer Node.js (pour les scripts)
install_nodejs() {
    echo ""
    info "Vérification de Node.js..."

    if command -v node &> /dev/null; then
        log "Node.js déjà installé: $(node --version)"
        return
    fi

    info "Installation de Node.js..."

    # Installation via NodeSource (version LTS)
    curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
    apt-get install -y nodejs

    log "Node.js installé: $(node --version)"
}

# Configurer le firewall
configure_firewall() {
    echo ""
    info "Configuration du Firewall (UFW)..."

    if ! command -v ufw &> /dev/null; then
        info "Installation de UFW..."
        apt-get update -qq
        apt-get install -y ufw
    fi

    # Autoriser SSH (IMPORTANT!)
    ufw allow 22/tcp comment 'SSH'

    # Autoriser HTTP/HTTPS
    ufw allow 80/tcp comment 'HTTP'
    ufw allow 443/tcp comment 'HTTPS'

    # Autoriser Supabase (optionnel, pour dev)
    # ufw allow 8000/tcp comment 'Supabase API'
    # ufw allow 3000/tcp comment 'Supabase Studio'

    # Activer UFW
    ufw --force enable

    log "Firewall configuré"
}

# Créer le dossier de travail
setup_directory() {
    echo ""
    info "Création du dossier de travail..."

    WORK_DIR="/opt/supabase"

    if [ -d "$WORK_DIR" ]; then
        warn "Le dossier $WORK_DIR existe déjà"
        read -p "Voulez-vous le supprimer et recommencer ? (o/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Oo]$ ]]; then
            rm -rf "$WORK_DIR"
        else
            cd "$WORK_DIR"
            return
        fi
    fi

    mkdir -p "$WORK_DIR"
    cd "$WORK_DIR"

    log "Dossier créé: $WORK_DIR"
}

# Télécharger Supabase Docker
download_supabase() {
    echo ""
    info "Téléchargement de Supabase..."

    git clone --depth 1 https://github.com/supabase/supabase temp-supabase
    cp -r temp-supabase/docker/* .
    rm -rf temp-supabase

    # Créer structure volumes
    mkdir -p volumes/db/init
    mkdir -p volumes/storage
    mkdir -p volumes/logs
    mkdir -p scripts

    log "Supabase téléchargé"
}

# Générer les clés de sécurité
generate_keys() {
    echo ""
    info "Génération des clés de sécurité..."

    # Créer script de génération
    cat > scripts/generate-keys.js << 'SCRIPT_EOF'
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const jwtSecret = crypto.randomBytes(32).toString('hex');
const anonKey = jwt.sign({ role: 'anon', iss: 'supabase' }, jwtSecret, { expiresIn: '10y' });
const serviceKey = jwt.sign({ role: 'service_role', iss: 'supabase' }, jwtSecret, { expiresIn: '10y' });

console.log('JWT_SECRET=' + jwtSecret);
console.log('ANON_KEY=' + anonKey);
console.log('SERVICE_ROLE_KEY=' + serviceKey);
SCRIPT_EOF

    # Installer jsonwebtoken
    cd scripts
    npm install --silent jsonwebtoken &> /dev/null
    cd ..

    # Générer les clés
    node scripts/generate-keys.js > .keys

    # Extraire valeurs
    export JWT_SECRET=$(grep "JWT_SECRET=" .keys | cut -d'=' -f2)
    export ANON_KEY=$(grep "ANON_KEY=" .keys | cut -d'=' -f2)
    export SERVICE_ROLE_KEY=$(grep "SERVICE_ROLE_KEY=" .keys | cut -d'=' -f2)
    export POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)

    log "Clés générées"
}

# Demander le domaine (optionnel)
ask_domain() {
    echo ""
    info "Configuration du domaine"
    echo ""
    echo "Si vous avez un nom de domaine (ex: supabase.monsite.com),"
    echo "entrez-le maintenant. Sinon, laissez vide pour utiliser l'IP."
    echo ""
    read -p "Domaine (optionnel): " DOMAIN

    if [ -z "$DOMAIN" ]; then
        # Utiliser IP publique
        PUBLIC_IP=$(curl -s ifconfig.me)
        SUPABASE_URL="http://$PUBLIC_IP:8000"
        STUDIO_URL="http://$PUBLIC_IP:3000"
        log "Utilisation de l'IP: $PUBLIC_IP"
    else
        SUPABASE_URL="https://$DOMAIN"
        STUDIO_URL="https://studio.$DOMAIN"
        log "Domaine configuré: $DOMAIN"
    fi
}

# Configurer .env
configure_env() {
    echo ""
    info "Configuration du fichier .env..."

    cp .env.example .env

    # Remplacer les valeurs avec les variables exportées
    sed -i "s|your-super-secret-jwt-token-with-at-least-32-characters-long|$JWT_SECRET|g" .env
    sed -i "s|your-super-secret-and-long-postgres-password|$POSTGRES_PASSWORD|g" .env
    sed -i "s|eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0|$ANON_KEY|g" .env
    sed -i "s|eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU|$SERVICE_ROLE_KEY|g" .env

    # Configurer les URLs
    sed -i "s|http://localhost:8000|$SUPABASE_URL|g" .env
    sed -i "s|http://localhost:3000|$STUDIO_URL|g" .env

    log "Fichier .env configuré"
}

# Démarrer Supabase
start_supabase() {
    echo ""
    info "Démarrage de Supabase (cela peut prendre quelques minutes)..."

    docker compose pull
    docker compose up -d

    log "Services démarrés"
}

# Attendre que les services soient prêts
wait_services() {
    echo ""
    info "Attente du démarrage complet..."

    local max_attempts=60
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if docker compose exec -T db pg_isready -U postgres &> /dev/null; then
            log "PostgreSQL prêt"
            break
        fi
        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done

    sleep 10
}

# Sauvegarder les informations
save_credentials() {
    echo ""
    info "Sauvegarde des informations de connexion..."

    cat > /root/supabase-credentials.txt << EOF
========================================
Supabase Self-Hosted - Informations
========================================

URLs:
- API: $SUPABASE_URL
- Studio: $STUDIO_URL

Base de Données:
- Host: localhost
- Port: 5432
- User: postgres
- Database: postgres
- Password: $POSTGRES_PASSWORD

Clés API:
- ANON_KEY: $ANON_KEY
- SERVICE_ROLE_KEY: $SERVICE_ROLE_KEY
- JWT_SECRET: $JWT_SECRET

Configuration Angular (environment.ts):
supabaseUrl: '$SUPABASE_URL'
supabaseAnonKey: '$ANON_KEY'

Localisation:
- Dossier: $WORK_DIR
- Fichier .env: $WORK_DIR/.env

Commandes Docker:
- État: docker compose ps
- Logs: docker compose logs -f
- Arrêt: docker compose stop
- Démarrage: docker compose start

========================================
Date: $(date)
========================================
EOF

    chmod 600 /root/supabase-credentials.txt

    log "Informations sauvegardées dans /root/supabase-credentials.txt"
}

# Résumé final
show_summary() {
    echo ""
    echo -e "${BLUE}=========================================================================${NC}"
    echo -e "${GREEN}🎉 Installation Terminée avec Succès !${NC}"
    echo -e "${BLUE}=========================================================================${NC}"
    echo ""

    echo -e "${GREEN}✅ Supabase est maintenant opérationnel sur ce VPS !${NC}"
    echo ""

    info "Accès aux services:"
    echo ""
    echo "📊 Supabase Studio:"
    echo "   ${BLUE}$STUDIO_URL${NC}"
    echo ""
    echo "🔌 API Supabase:"
    echo "   ${BLUE}$SUPABASE_URL${NC}"
    echo ""

    info "Configuration Angular:"
    echo ""
    echo "   ${YELLOW}supabaseUrl: '$SUPABASE_URL'${NC}"
    echo "   ${YELLOW}supabaseAnonKey: '$ANON_KEY'${NC}"
    echo ""

    warn "IMPORTANT:"
    echo "   - Vos identifiants sont dans: ${YELLOW}/root/supabase-credentials.txt${NC}"
    echo "   - NE JAMAIS partager ces informations"
    echo "   - Configurez un nom de domaine avec SSL pour la production"
    echo ""

    info "Prochaines étapes:"
    echo "   1. Configurez un nom de domaine (si pas fait)"
    echo "   2. Installez un certificat SSL (Let's Encrypt)"
    echo "   3. Configurez un reverse proxy (Nginx)"
    echo "   4. Mettez à jour votre application Angular"
    echo ""

    echo -e "${BLUE}=========================================================================${NC}"
}

# Fonction principale
main() {
    # Vérifier si root
    if [ "$EUID" -ne 0 ]; then
        error "Ce script doit être exécuté en tant que root (sudo)"
    fi

    detect_os
    install_docker
    install_docker_compose
    install_nodejs
    setup_directory
    download_supabase
    generate_keys
    ask_domain
    configure_env
    configure_firewall
    start_supabase
    wait_services
    save_credentials
    show_summary
}

# Exécuter
main "$@"
