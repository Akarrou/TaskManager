# 🚀 Supabase Self-Hosted - Guide d'Installation

Ce dossier contient tout le nécessaire pour déployer Supabase en auto-hébergement pour l'application TaskManager.

## 📋 Table des Matières

- [Prérequis](#prérequis)
- [Installation Rapide](#installation-rapide)
- [Configuration Détaillée](#configuration-détaillée)
- [Migration des Données](#migration-des-données)
- [Mise à Jour du Frontend](#mise-à-jour-du-frontend)
- [Vérification et Tests](#vérification-et-tests)
- [Dépannage](#dépannage)

---

## ⚙️ Prérequis

Avant de commencer, assurez-vous d'avoir installé :

- **Docker** (version 20.10+) : [Installation](https://docs.docker.com/get-docker/)
- **Docker Compose** (version 2.0+) : [Installation](https://docs.docker.com/compose/install/)
- **Node.js** (version 18+) : Pour les scripts de migration
- **Git** : Pour cloner le repo Supabase

Vérifier les versions :
```bash
docker --version
docker-compose --version
node --version
```

---

## 🚀 Installation Rapide (15 minutes)

### Étape 1 : Générer les Clés de Sécurité

```bash
# Installer dépendances
cd scripts
npm install jsonwebtoken

# Générer les clés
node generate-keys.js
```

**⚠️ IMPORTANT :** Copier les 3 clés affichées (JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY).

### Étape 2 : Configurer l'Environnement

```bash
# Copier le template
cp .env.example .env

# Éditer le fichier .env
nano .env  # ou votre éditeur préféré
```

**Modifier dans `.env` :**

```env
# Coller vos clés générées
JWT_SECRET=votre-jwt-secret-64-caracteres
ANON_KEY=votre-anon-key-jwt-token
SERVICE_ROLE_KEY=votre-service-role-key-jwt-token

# Configurer PostgreSQL
POSTGRES_PASSWORD=changez-ce-password-24-chars-minimum

# URLs (garder localhost pour test local)
SUPABASE_PUBLIC_URL=http://localhost:8000
STUDIO_URL=http://localhost:3000
```

### Étape 3 : Démarrer Supabase

```bash
# Lancer tous les services
docker-compose up -d

# Vérifier que tout fonctionne
docker-compose ps
```

**Tous les services doivent afficher "healthy"** (cela peut prendre 2-3 minutes).

### Étape 4 : Accéder à Supabase Studio

Ouvrir dans votre navigateur : **http://localhost:3000**

Connexion :
- Email : (créer un compte)
- Database Password : Celui défini dans `POSTGRES_PASSWORD`

---

## 🔧 Configuration Détaillée

### Structure du Projet

```
supabase-self-hosted/
├── docker-compose.yml          # Configuration des services
├── .env                        # Variables d'environnement (NE PAS COMMIT!)
├── .env.example                # Template de configuration
├── volumes/
│   ├── db/
│   │   └── init/
│   │       └── 01-schema.sql   # Schéma initial de votre BDD
│   ├── storage/                # Fichiers uploadés
│   └── logs/                   # Logs des services
├── scripts/
│   ├── generate-keys.js        # Génération clés JWT
│   └── migrate-storage.js      # Migration fichiers
└── README-SETUP.md             # Ce fichier
```

### Services Déployés

| Service | Port | Description |
|---------|------|-------------|
| **Kong** (API Gateway) | 8000 | Point d'entrée API |
| **Studio** (UI Admin) | 3000 | Interface d'administration |
| **PostgreSQL** | 5432 | Base de données |
| **GoTrue** (Auth) | 9999 | Service d'authentification |
| **PostgREST** | 3001 | API REST auto-générée |
| **Realtime** | 4000 | WebSockets temps réel |
| **Storage** | 5000 | Stockage fichiers |
| **imgproxy** | 5001 | Transformation images |
| **Meta** | 8080 | Service métadonnées |

---

## 📦 Migration des Données

### Option A : Export depuis Supabase Cloud

```bash
# Via Supabase CLI (si installé)
supabase db dump -f backup.sql

# OU via pg_dump
pg_dump -h db.eoejjfztgdpdciqlvnte.supabase.co \
  -U postgres \
  -d postgres \
  --no-owner \
  --no-acl \
  > backup.sql
```

### Option B : Import vers Supabase Self-Hosted

```bash
# Copier le backup dans le container
docker cp backup.sql supabase-db-taskmanager:/tmp/

# Importer
docker exec -it supabase-db-taskmanager psql \
  -U postgres \
  -d postgres \
  -f /tmp/backup.sql
```

### Vérification des Données

```bash
# Se connecter à PostgreSQL
docker exec -it supabase-db-taskmanager psql -U postgres

# Dans psql:
\dt                                # Lister les tables
SELECT COUNT(*) FROM tasks;        # Vérifier données
SELECT COUNT(*) FROM documents;
\q                                 # Quitter
```

### Migration du Storage (Fichiers)

```bash
# 1. Éditer le script de migration
nano scripts/migrate-storage.js

# Modifier les valeurs :
# - OLD_URL : https://eoejjfztgdpdciqlvnte.supabase.co
# - OLD_KEY : Votre ancienne ANON_KEY Supabase Cloud
# - NEW_KEY : Votre nouvelle ANON_KEY Self-Hosted

# 2. Installer dépendances
cd scripts
npm install @supabase/supabase-js

# 3. Exécuter la migration
node migrate-storage.js
```

---

## 🎨 Mise à Jour du Frontend Angular

### Fichier `src/environments/environment.ts` (Développement)

```typescript
export const environment = {
  production: false,
  supabaseUrl: 'http://localhost:8000',        // ← CHANGÉ
  supabaseAnonKey: 'VOTRE_NOUVELLE_ANON_KEY',  // ← CHANGÉ
};
```

### Fichier `src/environments/environment.prod.ts` (Production)

```typescript
export const environment = {
  production: true,
  supabaseUrl: 'https://votre-domaine.com',    // ← URL de votre serveur
  supabaseAnonKey: 'VOTRE_NOUVELLE_ANON_KEY',  // ← Même clé que dev
};
```

**C'est tout !** Aucune autre modification nécessaire dans le code Angular.

---

## ✅ Vérification et Tests

### Checklist de Vérification

```bash
# 1. Vérifier que tous les services sont UP
docker-compose ps

# 2. Tester l'API REST
curl http://localhost:8000/rest/v1/tasks \
  -H "apikey: VOTRE_ANON_KEY"

# 3. Vérifier Studio UI
# Ouvrir http://localhost:3000 dans le navigateur

# 4. Tester Auth
# Se connecter via l'application Angular

# 5. Tester Upload Fichier
# Uploader un fichier via l'interface
```

### Tests Fonctionnels dans l'Application

- [ ] **Authentification**
  - [ ] Login avec email/password
  - [ ] Signup nouveau utilisateur
  - [ ] Logout
  - [ ] Session reste active après refresh

- [ ] **CRUD**
  - [ ] Créer un projet
  - [ ] Créer une tâche
  - [ ] Créer un document
  - [ ] Modifier des données
  - [ ] Supprimer des données

- [ ] **Fichiers**
  - [ ] Upload fichier (task attachments)
  - [ ] Télécharger fichier
  - [ ] Voir liste des fichiers

- [ ] **Features Avancées**
  - [ ] Créer une table dynamique (database extension)
  - [ ] Hiérarchie de documents
  - [ ] Relations entre tasks

---

## 🔒 Sécurité

### ⚠️ AVANT Déploiement Production

- [ ] Changer **TOUS** les secrets par défaut dans `.env`
- [ ] `JWT_SECRET` : minimum 32 caractères aléatoires
- [ ] `POSTGRES_PASSWORD` : minimum 24 caractères sécurisés
- [ ] Générer de nouvelles `ANON_KEY` et `SERVICE_ROLE_KEY`
- [ ] Configurer HTTPS avec certificat SSL (Let's Encrypt)
- [ ] Configurer firewall (autoriser seulement ports 80, 443)
- [ ] Setup backup automatique PostgreSQL (cron + pg_dump)
- [ ] Monitoring avec logs centralisés
- [ ] **NE JAMAIS** commiter `.env` dans Git

### Ajouter `.env` au `.gitignore`

```bash
echo ".env" >> .gitignore
echo "volumes/db/data/*" >> .gitignore
echo "volumes/storage/data/*" >> .gitignore
```

---

## 🛠️ Dépannage

### Problème : Services ne démarrent pas

```bash
# Vérifier les logs
docker-compose logs -f

# Redémarrer proprement
docker-compose down
docker-compose up -d
```

### Problème : Erreur "Cannot connect to database"

```bash
# Vérifier que PostgreSQL est prêt
docker-compose ps | grep db

# Se connecter manuellement
docker exec -it supabase-db-taskmanager psql -U postgres
```

### Problème : Erreur JWT lors de l'auth

Vérifier que :
1. `JWT_SECRET` est identique dans `.env` et utilisé pour générer les clés
2. `ANON_KEY` dans `.env` correspond à celle dans `environment.ts`
3. Les clés n'ont pas expiré (vérifier date d'expiration du JWT)

### Problème : Upload fichiers ne fonctionne pas

```bash
# Vérifier que le bucket existe
docker exec -it supabase-storage ls /var/lib/storage/

# Recréer le bucket via Studio UI
# Settings > Storage > Create bucket "task-attachments"
```

### Réinitialisation Complète

```bash
# ATTENTION : Supprime toutes les données !
docker-compose down -v
rm -rf volumes/db/data volumes/storage/data
docker-compose up -d
```

---

## 📚 Commandes Utiles

```bash
# Démarrer
docker-compose up -d

# Arrêter
docker-compose down

# Voir logs
docker-compose logs -f [service]

# Redémarrer un service
docker-compose restart [service]

# Mettre à jour Supabase
docker-compose pull
docker-compose up -d

# Backup PostgreSQL
docker exec supabase-db-taskmanager pg_dump -U postgres postgres > backup_$(date +%Y%m%d).sql

# Restaurer backup
docker exec -i supabase-db-taskmanager psql -U postgres postgres < backup.sql
```

---

## 🔗 Ressources

- [Documentation Supabase Self-Hosting](https://supabase.com/docs/guides/self-hosting/docker)
- [Repo GitHub Supabase](https://github.com/supabase/supabase)
- [Configuration Docker Compose](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml)
- [Supabase Community](https://github.com/orgs/supabase/discussions)

---

## 📞 Support

En cas de problème :

1. Consulter les logs : `docker-compose logs -f`
2. Vérifier la documentation officielle Supabase
3. Rechercher sur [GitHub Discussions](https://github.com/orgs/supabase/discussions)
4. Vérifier votre configuration `.env`

---

**Bonne chance avec votre installation Supabase Self-Hosted ! 🚀**
