#!/bin/bash

#===============================================================================
# 🚀 Supabase Self-Hosted - Script d'Installation Automatique
#===============================================================================
# Ce script configure automatiquement Supabase en auto-hébergement
#
# Usage:
#   chmod +x setup.sh
#   ./setup.sh
#===============================================================================

set -e  # Arrêter en cas d'erreur

# Couleurs pour l'output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fonctions d'affichage
print_header() {
    echo ""
    echo -e "${BLUE}=========================================================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}=========================================================================${NC}"
    echo ""
}

print_step() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Vérifier les prérequis
check_prerequisites() {
    print_header "Vérification des Prérequis"

    # Vérifier Docker
    if ! command -v docker &> /dev/null; then
        print_error "Docker n'est pas installé !"
        print_info "Installez Docker depuis: https://docs.docker.com/get-docker/"
        exit 1
    fi
    print_step "Docker installé: $(docker --version)"

    # Vérifier Docker Compose
    if ! docker compose version &> /dev/null; then
        print_error "Docker Compose n'est pas installé !"
        print_info "Installez Docker Compose depuis: https://docs.docker.com/compose/install/"
        exit 1
    fi
    print_step "Docker Compose installé: $(docker compose version)"

    # Vérifier Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js n'est pas installé !"
        print_info "Installez Node.js depuis: https://nodejs.org/"
        exit 1
    fi
    print_step "Node.js installé: $(node --version)"

    # Vérifier npm
    if ! command -v npm &> /dev/null; then
        print_error "npm n'est pas installé !"
        exit 1
    fi
    print_step "npm installé: $(npm --version)"
}

# Générer les clés de sécurité
generate_keys() {
    print_header "Génération des Clés de Sécurité"

    cd scripts

    # Installer jsonwebtoken si nécessaire
    if [ ! -d "node_modules" ]; then
        print_info "Installation de jsonwebtoken..."
        npm install --silent jsonwebtoken 2>&1 > /dev/null
    fi

    # Générer les clés
    print_info "Génération des clés JWT..."
    node generate-keys.js > ../keys.txt

    cd ..

    # Extraire les valeurs
    JWT_SECRET=$(grep "JWT_SECRET" keys.txt -A 1 | tail -n 1)
    ANON_KEY=$(grep "ANON_KEY" keys.txt -A 1 | tail -n 1)
    SERVICE_ROLE_KEY=$(grep "SERVICE_ROLE_KEY" keys.txt -A 1 | tail -n 1)

    print_step "Clés générées avec succès"
}

# Générer un mot de passe PostgreSQL sécurisé
generate_postgres_password() {
    POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
    print_step "Mot de passe PostgreSQL généré"
}

# Configurer le fichier .env
configure_env() {
    print_header "Configuration du Fichier .env"

    if [ -f .env ]; then
        print_warning "Le fichier .env existe déjà"
        read -p "Voulez-vous le remplacer ? (o/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Oo]$ ]]; then
            print_info "Conservation du fichier .env existant"
            return
        fi
    fi

    # Copier le template
    cp .env.example .env

    # Remplacer les valeurs
    print_info "Configuration des variables d'environnement..."

    # Utiliser sed compatible macOS et Linux
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s|your-super-secret-jwt-token-with-at-least-32-characters-long|$JWT_SECRET|g" .env
        sed -i '' "s|your-super-secret-and-long-postgres-password|$POSTGRES_PASSWORD|g" .env
        sed -i '' "s|eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0|$ANON_KEY|g" .env
        sed -i '' "s|eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU|$SERVICE_ROLE_KEY|g" .env
    else
        # Linux
        sed -i "s|your-super-secret-jwt-token-with-at-least-32-characters-long|$JWT_SECRET|g" .env
        sed -i "s|your-super-secret-and-long-postgres-password|$POSTGRES_PASSWORD|g" .env
        sed -i "s|eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0|$ANON_KEY|g" .env
        sed -i "s|eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU|$SERVICE_ROLE_KEY|g" .env
    fi

    print_step "Fichier .env configuré"
}

# Démarrer les services Docker
start_services() {
    print_header "Démarrage des Services Supabase"

    print_info "Téléchargement des images Docker (cela peut prendre quelques minutes)..."
    docker compose pull

    print_info "Démarrage de la stack Supabase..."
    docker compose up -d

    print_step "Services lancés"
}

# Attendre que les services soient prêts
wait_for_services() {
    print_header "Attente du Démarrage Complet"

    print_info "Attente que tous les services soient opérationnels..."
    print_info "(Cela peut prendre 2-3 minutes)"

    local max_attempts=60
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        # Vérifier si PostgreSQL est prêt
        if docker compose exec -T db pg_isready -U postgres &> /dev/null; then
            print_step "PostgreSQL est prêt"
            break
        fi

        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done

    if [ $attempt -eq $max_attempts ]; then
        print_error "Timeout: Les services n'ont pas démarré dans le délai imparti"
        print_info "Vérifiez les logs: docker compose logs"
        exit 1
    fi

    # Attendre encore un peu pour que tous les services soient prêts
    sleep 10
}

# Vérifier l'état des services
check_services() {
    print_header "Vérification de l'État des Services"

    docker compose ps

    echo ""

    # Compter les services healthy
    local healthy_count=$(docker compose ps --format json | grep -c '"Health":"healthy"' || echo "0")

    if [ "$healthy_count" -gt 0 ]; then
        print_step "Services opérationnels détectés"
    else
        print_warning "Certains services peuvent encore démarrer"
        print_info "Attendez quelques minutes et vérifiez: docker compose ps"
    fi
}

# Créer un fichier .gitignore
create_gitignore() {
    print_header "Configuration de .gitignore"

    cat > .gitignore << 'EOF'
# Variables d'environnement (SENSIBLE - NE JAMAIS COMMITER)
.env
keys.txt

# Données Docker (volumes)
volumes/db/data/
volumes/storage/data/
volumes/logs/

# Node modules
scripts/node_modules/
scripts/package-lock.json

# Backups
*.sql
backups/

# OS
.DS_Store
Thumbs.db
EOF

    print_step "Fichier .gitignore créé"
}

# Afficher le résumé final
show_summary() {
    print_header "🎉 Installation Terminée avec Succès !"

    echo ""
    echo -e "${GREEN}✅ Supabase Self-Hosted est maintenant opérationnel !${NC}"
    echo ""

    print_info "Informations importantes:"
    echo ""
    echo "📊 Supabase Studio (Interface Admin):"
    echo "   URL: http://localhost:3000"
    echo ""
    echo "🔌 API Gateway (Kong):"
    echo "   URL: http://localhost:8000"
    echo ""
    echo "🗄️  PostgreSQL:"
    echo "   Host: localhost"
    echo "   Port: 5432"
    echo "   User: postgres"
    echo "   Database: postgres"
    echo "   Password: $POSTGRES_PASSWORD"
    echo ""
    echo "🔑 Clés API (à utiliser dans Angular):"
    echo "   ANON_KEY: $ANON_KEY"
    echo ""

    print_warning "IMPORTANT - Sécurité:"
    echo "   - Les clés ont été sauvegardées dans keys.txt"
    echo "   - Ne JAMAIS commiter .env ou keys.txt dans Git"
    echo "   - Les fichiers sensibles sont dans .gitignore"
    echo ""

    print_info "Prochaines étapes:"
    echo ""
    echo "1. Ouvrez Supabase Studio:"
    echo "   ${BLUE}http://localhost:3000${NC}"
    echo ""
    echo "2. Mettez à jour votre Angular environment.ts:"
    echo "   ${YELLOW}supabaseUrl: 'http://localhost:8000'${NC}"
    echo "   ${YELLOW}supabaseAnonKey: '$ANON_KEY'${NC}"
    echo ""
    echo "3. Migrez vos données (optionnel):"
    echo "   Consultez README-SETUP.md pour les instructions"
    echo ""

    print_info "Commandes utiles:"
    echo "   docker compose ps              # Voir l'état des services"
    echo "   docker compose logs -f         # Voir les logs"
    echo "   docker compose stop            # Arrêter les services"
    echo "   docker compose start           # Redémarrer les services"
    echo "   docker compose down            # Tout arrêter et supprimer"
    echo ""

    print_header "Bonne utilisation de Supabase Self-Hosted ! 🚀"
}

# Fonction principale
main() {
    clear

    print_header "🚀 Installation Supabase Self-Hosted pour TaskManager"

    echo "Ce script va:"
    echo "  1. Vérifier les prérequis (Docker, Node.js)"
    echo "  2. Générer les clés de sécurité"
    echo "  3. Configurer le fichier .env"
    echo "  4. Démarrer tous les services Supabase"
    echo "  5. Vérifier que tout fonctionne"
    echo ""

    read -p "Continuer ? (o/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Oo]$ ]]; then
        print_info "Installation annulée"
        exit 0
    fi

    # Exécuter les étapes
    check_prerequisites
    generate_keys
    generate_postgres_password
    configure_env
    create_gitignore
    start_services
    wait_for_services
    check_services
    show_summary
}

# Exécuter
main "$@"
