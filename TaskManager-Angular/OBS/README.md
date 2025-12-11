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

### Automated Deployment

```bash
./scripts/deploy-vps.sh
```

The script will:
1. ✅ Check prerequisites
2. 🔐 Generate production secrets
3. ⚙️ Prompt for VPS configuration
4. 🔄 Build and start all services
5. 🏥 Perform health checks
6. 📋 Display access information

### Manual Deployment

#### 1. Prepare VPS

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
# Logout and login
```

#### 2. Generate Production Secrets

```bash
./scripts/generate-secrets.sh --production
```

#### 3. Configure Environment

Edit `.env.production`:

```bash
# Update these for your VPS
SUPABASE_PUBLIC_URL=http://YOUR_VPS_IP:8000
SITE_URL=http://YOUR_VPS_IP:4010

# For domain with SSL:
# SUPABASE_PUBLIC_URL=https://api.yourdomain.com
# SITE_URL=https://yourdomain.com

# Configure SMTP
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

#### 4. Start Services

```bash
docker compose --env-file .env.production --profile production up -d
```

#### 5. Configure Firewall

```bash
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP
sudo ufw allow 443/tcp     # HTTPS
sudo ufw allow 4010/tcp    # App
sudo ufw allow 8000/tcp    # API
sudo ufw allow 3000/tcp    # Studio
sudo ufw enable
```

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

**Version**: 1.0.0
**Last Updated**: December 2024
