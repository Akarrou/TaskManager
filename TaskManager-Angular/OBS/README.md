# TaskManager - Docker Deployment Guide

Complete Docker-based deployment system for TaskManager Angular application with self-hosted Supabase infrastructure.

## 📋 Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Local Development](#local-development)
- [VPS Production Deployment](#vps-production-deployment)
- [Configuration](#configuration)
- [Backup & Restore](#backup--restore)
- [Troubleshooting](#troubleshooting)

---

## 🎯 Overview

This deployment system provides:

- **Unified Docker Compose**: Single file orchestrating 16 services (Angular app + 15 Supabase services)
- **Multi-environment support**: Profiles for local development and VPS production
- **Runtime configuration**: Environment variables injected at container startup
- **Automated secrets**: Cryptographically secure secret generation
- **Backup & Restore**: Complete database and storage backup scripts
- **SSL Support**: Optional Caddy reverse proxy with automatic Let's Encrypt certificates

### Services Included

| Service | Description | Port |
|---------|-------------|------|
| **app** | Angular application (Nginx) | 4010 |
| **kong** | API Gateway (Supabase) | 8000, 8443 |
| **studio** | Supabase Admin Dashboard | 3000 |
| **db** | PostgreSQL 15.8 | 5432 |
| **auth** | GoTrue authentication | - |
| **rest** | PostgREST API | - |
| **realtime** | WebSocket server | - |
| **storage** | File storage API | - |
| **mcp-server** | Claude AI MCP Server | 3100 |
| **analytics** | Logflare analytics | 4000 |
| **+ 6 more** | Supporting services | - |

---

## 📦 Prerequisites

### Required

- **Docker**: Version 20.10+ ([Install Docker](https://docs.docker.com/engine/install/))
- **Docker Compose**: Version 2.0+ (included with Docker Desktop)
- **OpenSSL**: For secret generation (usually pre-installed)
- **Bash**: For running scripts

### System Requirements

**Minimum (Development)**:
- 4 GB RAM
- 20 GB disk space
- 2 CPU cores

**Recommended (Production)**:
- 8 GB RAM
- 50 GB disk space
- 4 CPU cores

---

## 🚀 Quick Start

### Local Development (5 minutes)

Using the Makefile (from the project root):

```bash
make setup    # Generate secrets (.env.local)
make dev      # Start all services
make seed     # Create default user
# Open http://localhost:4010
```

Or manually:

```bash
# 1. Navigate to deployment directory
cd TaskManager-Angular/OBS

# 2. Generate secrets
./scripts/generate-secrets.sh

# 3. Start all services
docker compose --profile local up -d

# 4. Wait for services to be healthy (~2 minutes)
docker compose ps

# 5. Access the application
# Application: http://localhost:4010
# Supabase Studio: http://localhost:3000 (admin / check .env.local for password)
# API: http://localhost:8000
```

### VPS Production (10 minutes)

```bash
# 1. SSH to your VPS and clone the repository
git clone <your-repo-url>
cd TaskManager-Angular/OBS

# 2. Run automated deployment script
./scripts/deploy-vps.sh

# Follow the interactive prompts
```

---

## 🏗️ Architecture

### Network Topology

```
┌──────────────────────────────────────────────────┐
│  Host Machine                                    │
│                                                  │
│  ┌────────────────────────────────────────┐     │
│  │  Docker Network: supabase_network      │     │
│  │                                        │     │
│  │  ┌──────────┐                          │     │
│  │  │   App    │◄─── Port 4010            │     │
│  │  │ (Nginx)  │                          │     │
│  │  └────┬─────┘                          │     │
│  │       │ API calls                      │     │
│  │       ▼                                │     │
│  │  ┌──────────┐                          │     │
│  │  │   Kong   │◄─── Port 8000            │     │
│  │  │ Gateway  │                          │     │
│  │  └────┬─────┘                          │     │
│  │       │                                │     │
│  │       ├─► auth ──────► GoTrue          │     │
│  │       ├─► rest ──────► PostgREST       │     │
│  │       ├─► storage ───► Storage API     │     │
│  │       └─► realtime ──► Realtime        │     │
│  │                                        │     │
│  │       ┌──────────┐                     │     │
│  │       │PostgreSQL│◄─── All services    │     │
│  │       └──────────┘                     │     │
│  │                                        │     │
│  └────────────────────────────────────────┘     │
└──────────────────────────────────────────────────┘
```

---

## 💻 Local Development

### First-Time Setup

```bash
cd TaskManager-Angular/OBS

# Generate local environment
./scripts/generate-secrets.sh

# Review .env.local if needed
cat .env.local

# Start services
docker compose --profile local up -d
```

### Daily Workflow

```bash
# Start services
docker compose --profile local up -d

# View logs
docker compose logs -f app

# Check status
docker compose ps

# Stop services
docker compose down
```

### Development URLs

- **Application**: [http://localhost:4010](http://localhost:4010)
- **Supabase Studio**: [http://localhost:3000](http://localhost:3000)
- **API Gateway**: [http://localhost:8000](http://localhost:8000)

### Rebuilding After Code Changes

```bash
docker compose build app
docker compose up -d app
```

---

## 🌐 VPS Production Deployment

### First-Time Setup

#### 1. Prepare VPS

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
# Logout and login to apply group changes
```

#### 2. Generate Production Secrets

All URLs are automatically derived from the VPS IP — you only specify it once:

```bash
./scripts/generate-secrets.sh --production 203.0.113.50
```

Or pass it via environment variable:

```bash
export DEPLOY_VPS_HOST=203.0.113.50
./scripts/generate-secrets.sh --production
```

If omitted, the script will prompt you interactively.

This generates `.env.production` with:
- All cryptographic secrets (JWT, passwords, encryption keys)
- All URLs pre-filled (`SUPABASE_PUBLIC_URL`, `SITE_URL`, etc.)
- `DEPLOY_VPS_HOST` set for CI/CD and deploy scripts

#### 3. Configure SMTP (optional but recommended)

Edit `.env.production`:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_SENDER_NAME=Kodo
```

Without SMTP, set `ENABLE_EMAIL_AUTOCONFIRM=true` to skip email verification.

#### 4. Configure Custom Domains (optional)

For SSL with Let's Encrypt via Caddy, edit `.env.production`:

```bash
APP_DOMAIN=kodo.yourdomain.com
API_DOMAIN=api.yourdomain.com
STUDIO_DOMAIN=supabase.yourdomain.com
MCP_DOMAIN=mcp.yourdomain.com
```

Then generate the Caddyfile:

```bash
./scripts/generate-caddyfile.sh
```

If no custom domain is configured, the script generates an IP-based Caddyfile (no SSL).

#### 5. Start Services

```bash
docker compose --env-file .env.production --profile production up -d
```

#### 6. Create Initial User

```bash
./scripts/seed-user.sh
```

### Redeploying (Updating an Existing Instance)

#### Via CI/CD (recommended)

Push a version tag to trigger automatic deployment:

```bash
git tag v1.2.0
git push origin v1.2.0
```

Or trigger manually from the GitHub Actions tab (`workflow_dispatch`).

The CI/CD pipeline handles: build, file sync, pre-deploy backup, Docker image rebuild, migration application, and service restart — all with zero manual intervention.

#### Via deploy.sh (from local machine)

```bash
./scripts/deploy.sh
```

The script reads `DEPLOY_VPS_HOST` from `.env.production` and:

1. Creates a pre-deploy database backup on the VPS
2. Builds Angular app and MCP server locally
3. Syncs all files via rsync (build, migrations, edge functions, configs)
4. Applies pending database migrations
5. Rebuilds Docker images and restarts services
6. Reloads Caddy configuration (zero-downtime)
7. Runs health checks

#### Manual Update

```bash
# SSH to VPS
ssh ubuntu@your-vps-ip

# Pull latest code / sync files
cd ~/taskmanager

# Rebuild app image
docker build --no-cache -f OBS/Dockerfile.production -t taskmanager-app .

# Restart services
cd OBS
docker compose --env-file .env.production --profile production up -d --no-build

# Apply new migrations if any
docker exec -i supabase-db psql -U postgres -d postgres < ../supabase/migrations/NEW_MIGRATION.sql
```

### Firewall & Port Configuration

#### Required Ports

| Port | Service | Access | Notes |
|------|---------|--------|-------|
| **22** | SSH | Admin only | Restrict to your IP if possible |
| **80** | HTTP | Public | Caddy (redirects to HTTPS if domains configured) |
| **443** | HTTPS | Public | Caddy (SSL termination) |

#### Without Custom Domains (IP-based access)

| Port | Service | Access | Notes |
|------|---------|--------|-------|
| **4010** | Angular App | Public | Main application |
| **8000** | Kong API Gateway | Public | Supabase API (required by the app) |
| **3000** | Supabase Studio | **Admin only** | Database admin panel — restrict access |
| **3100** | MCP Server | **Admin only** | Claude AI integration — restrict access |

#### With Custom Domains (Caddy handles routing)

When using domains, Caddy listens on ports 80/443 and reverse-proxies to internal services. **No other ports need to be exposed publicly.**

#### UFW Configuration

**IP-based (no domains):**

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 4010/tcp comment 'Kodo App'
sudo ufw allow 8000/tcp comment 'Supabase API'
# Only if you need remote access to Studio/MCP:
# sudo ufw allow from YOUR_ADMIN_IP to any port 3000 proto tcp comment 'Studio (admin only)'
# sudo ufw allow from YOUR_ADMIN_IP to any port 3100 proto tcp comment 'MCP (admin only)'
sudo ufw enable
```

**Domain-based (Caddy SSL):**

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP (Caddy redirect)'
sudo ufw allow 443/tcp comment 'HTTPS (Caddy SSL)'
sudo ufw enable
```

#### Security Recommendations

- **Never expose port 5432** (PostgreSQL) to the internet — it is internal to Docker
- **Restrict Studio (3000)** to admin IPs only — it has full database access
- **Restrict MCP Server (3100)** to trusted IPs — it uses service role credentials
- **Use SSH key authentication** — disable password-based SSH login
- **Keep Docker updated** — `sudo apt update && sudo apt upgrade`
- **Set up fail2ban** for SSH brute-force protection:
  ```bash
  sudo apt install fail2ban
  sudo systemctl enable fail2ban
  ```
- **Change default seed credentials** after first login
- **Configure SMTP** and set `ENABLE_EMAIL_AUTOCONFIRM=false` in production

---

## ⚙️ Configuration

### Environment Variables

All configuration is in `.env.local` (development) or `.env.production` (production).

**Critical Variables**:

- `SUPABASE_PUBLIC_URL`: Public API URL
- `SITE_URL`: Angular app URL
- `POSTGRES_PASSWORD`: Database password (auto-generated)
- `JWT_SECRET`: JWT signing key (auto-generated)
- `ANON_KEY`: Public API key (auto-generated)
- `SERVICE_ROLE_KEY`: Admin API key (auto-generated)
- `DASHBOARD_PASSWORD`: Studio password (auto-generated)

See `.env.example` for complete list with documentation.

---

## 💾 Backup & Restore

### Create Backup

```bash
./scripts/backup.sh [backup_name]

# Example
./scripts/backup.sh before_upgrade
```

Backups include:
- PostgreSQL database (full dump)
- Storage files
- Environment configuration

### Restore Backup

```bash
# Stop services
docker compose down

# Restore database
cat backups/backup_TIMESTAMP/database.sql | docker compose exec -T db psql -U postgres

# Restart
docker compose --profile local up -d
```

### Automated Backups (Production)

```bash
# Add to crontab
crontab -e

# Daily backup at 2 AM
0 2 * * * cd /path/to/TaskManager-Angular/OBS && ./scripts/backup.sh
```

---

## 🔧 Troubleshooting

### Services Not Starting

**Check logs**:
```bash
docker compose logs -f
docker compose logs -f db
```

**Check status**:
```bash
docker compose ps
```

**Common issues**:

1. **Port conflicts**: Another service using ports 4010, 8000, or 3000
   ```bash
   sudo lsof -i :4010
   ```

2. **Insufficient disk space**:
   ```bash
   df -h
   docker system prune -a
   ```

3. **Database won't start**:
   ```bash
   docker compose down -v  # WARNING: deletes data
   docker compose up -d
   ```

### Application Errors

**Can't connect to Supabase**:

Check runtime config in browser console:
```javascript
console.log(window.__env);
```

Should show valid Supabase URL and keys.

**401 Unauthorized**:

Regenerate secrets:
```bash
./scripts/generate-secrets.sh
docker compose down
docker compose up -d
```

---

## 📞 Support & Resources

- **GitHub Issues**: Report bugs and feature requests
- **Docker Docs**: https://docs.docker.com
- **Supabase Docs**: https://supabase.com/docs

**Useful Commands**:

```bash
# View all logs
docker compose logs -f

# Restart a service
docker compose restart app

# Clean everything
docker compose down -v --remove-orphans

# Check disk usage
docker system df
```

---

## 🔌 MCP Server (Claude AI Integration)

The MCP server is integrated as a Docker Compose service with profiles `mcp` and `production`.

```bash
# Start MCP server alongside the stack
docker compose --profile mcp up -d mcp-server

# Or via Makefile
make mcp

# Health check
curl http://localhost:3100/health
```

The MCP server connects to Supabase via the internal Docker network (`kong:8000`) and exposes 83+ tools for Claude to interact with your Kodo instance.

See `mcp-server/README.md` for detailed configuration.

---

## 🌐 Caddyfile (SSL/Domains)

For production deployments with custom domains:

1. Set domain variables in `.env.production`:
   ```
   APP_DOMAIN=kodo.yourdomain.com
   API_DOMAIN=api.yourdomain.com
   STUDIO_DOMAIN=supabase.yourdomain.com
   MCP_DOMAIN=mcp.yourdomain.com
   ```

2. Generate the Caddyfile:
   ```bash
   make caddy
   # or: ./scripts/generate-caddyfile.sh
   ```

3. The Caddyfile is auto-loaded by the `caddy` Docker service. Only the `Caddyfile.template` is version-controlled.

---

## 🚀 CI/CD (GitHub Actions)

Two workflows are provided in `.github/workflows/`:

- **`ci.yml`**: Runs lint + build on every push to `main`/`develop` and on PRs
- **`deploy.yml`**: Deploys to VPS on `v*` tags or via manual dispatch

### Required GitHub Secrets (only 2)

| Secret | Description |
|--------|-------------|
| `VPS_SSH_KEY` | SSH private key for VPS access |
| `ENV_PRODUCTION` | Full contents of `.env.production` |

`ENV_PRODUCTION` contains everything: app secrets (JWT, passwords, domains...) **and** VPS connection info (`DEPLOY_VPS_HOST`, `DEPLOY_VPS_USER`, `DEPLOY_VPS_PATH`). Generate it locally with `make setup-prod`, customize it, then paste its contents into the GitHub secret. The deploy workflow writes it to the VPS and extracts the connection info automatically.

---

**Version**: 2.0.0
**Last Updated**: February 2026
