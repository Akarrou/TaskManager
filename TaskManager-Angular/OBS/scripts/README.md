# Scripts OBS

Tous les scripts d'exploitation de Kodo Task Manager.

## Deploiement

| Script | Depuis | Description |
|--------|--------|-------------|
| **deploy.sh** | Machine locale | Deploiement complet : sauvegarde pre-deploy, build Angular + MCP, sync des fichiers vers le VPS, migrations, redemarrage des services Docker, health check |
| **start-local.sh** | Machine locale | Lance le stack en local : build app, demarrage Docker avec le profil local, seed de l'utilisateur par defaut |

## Sauvegardes

| Script | Depuis | Description |
|--------|--------|-------------|
| **backup.sh** | Machine locale / VPS | Sauvegarde manuelle de la base de donnees, du storage et de la config .env |
| **backup-cron.sh** | Conteneur Docker (backup) | Sauvegarde automatique quotidienne a 2h du matin avec rotation des anciennes sauvegardes |
| **crontab** | Conteneur Docker (backup) | Planification du cron pour backup-cron.sh |

## Base de donnees

| Script | Depuis | Description |
|--------|--------|-------------|
| **apply-migrations.sh** | Conteneur Docker (db) | Applique les migrations SQL pendantes et enregistre leur execution |
| **migrate-on-startup.sh** | Conteneur Docker (migrations) | Applique automatiquement les migrations au demarrage du stack Docker |
| **validate-schema.sh** | VPS | Inspecte le schema PostgreSQL : tables, fonctions RPC, policies RLS, migrations appliquees |

## Docker

| Script | Depuis | Description |
|--------|--------|-------------|
| **entrypoint.sh** | Conteneur Docker (app) | Injecte les variables d'environnement Supabase dans l'app Angular au demarrage du conteneur nginx |

## Configuration initiale

| Script | Depuis | Description |
|--------|--------|-------------|
| **generate-secrets.sh** | Machine locale / VPS | Genere tous les secrets (JWT, mots de passe, cles de chiffrement) et cree le fichier .env |
| **seed-user.sh** | VPS | Cree un utilisateur admin par defaut dans Supabase Auth |
