# 5. Guide de Déploiement

Ce guide couvre le déploiement complet (Angular + Supabase self-hosted) via Docker Compose.

Pour la documentation détaillée, voir [`OBS/README.md`](../OBS/README.md).

## Quick Start

### Développement local

```bash
make setup    # Génère .env.local avec des secrets aléatoires
make dev      # Démarre les 16+ services Docker
make seed     # Crée l'utilisateur par défaut
# Ouvrir http://localhost:4010
```

### Production (VPS)

```bash
# Génère .env.production — l'IP est spécifiée une seule fois
make setup-prod   # ou: ./OBS/scripts/generate-secrets.sh --production <IP>

# Éditer OBS/.env.production si besoin (SMTP, domaines)
make caddy        # Génère le Caddyfile depuis le template
make prod         # Démarre le stack production
```

### Redéploiement

```bash
# Via CI/CD (recommandé) — push un tag
git tag v1.2.0 && git push origin v1.2.0

# Via script local
make deploy       # ou: ./OBS/scripts/deploy.sh
```

## Variables d'Environnement

Toute la configuration est dans `.env.local` (dev) ou `.env.production` (prod), générée automatiquement par `generate-secrets.sh`. Les variables d'environnement sont injectées au runtime dans le conteneur Angular via un entrypoint Docker — pas de rebuild nécessaire pour changer l'URL Supabase.

Voir `OBS/.env.example` pour la liste complète avec documentation.

## Ports et Sécurité

| Port | Service | Accès recommandé |
|------|---------|-------------------|
| 4010 | Application Angular | Public |
| 8000 | API Supabase (Kong) | Public |
| 3000 | Supabase Studio | Admin uniquement |
| 3100 | MCP Server | Admin uniquement |
| 5432 | PostgreSQL | Jamais exposé |

Avec des domaines personnalisés et Caddy, seuls les ports 80 et 443 sont nécessaires.

Voir [`OBS/README.md`](../OBS/README.md) pour les recommandations UFW et sécurité détaillées.
