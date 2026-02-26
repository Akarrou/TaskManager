# Kōdo Task Manager

A full-featured project management application with documents, tasks, calendars, spreadsheets, mindmaps and more — built with Angular 20 and self-hosted Supabase.

## Stack

- **Frontend**: Angular 20, Angular Material 20, Tailwind CSS, NgRx SignalStore
- **Backend**: Supabase (Auth, PostgreSQL, Storage, Realtime, Edge Functions)
- **Editor**: TipTap 3 (rich-text documents)
- **Calendar**: FullCalendar 6 + Google Calendar integration
- **Extras**: Cytoscape (mindmaps), HyperFormula (spreadsheets), Chart.js (dashboards)
- **AI Integration**: MCP Server for Claude Code (83 tools)

## Quick Start

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd task-manager

# 2. Generate secrets & environment
make setup

# 3. Start all services (Docker)
make dev

# 4. Create default user
make seed

# 5. Open the application
open http://localhost:4010
```

Login with `admin@example.com` / `changeme123` (or your custom seed user credentials).

## Available Commands

| Command | Description |
|---------|-------------|
| `make help` | Show all available commands |
| `make setup` | Generate secrets for local development |
| `make setup-prod` | Generate secrets for production |
| `make dev` | Start the local Docker stack |
| `make prod` | Start the production Docker stack |
| `make down` | Stop all services |
| `make logs` | Tail logs (`SERVICE=app` to filter) |
| `make status` | Show service status |
| `make seed` | Create the default user |
| `make deploy` | Deploy to VPS |
| `make caddy` | Generate Caddyfile from template |
| `make mcp` | Start MCP server (Docker) |

## Architecture

The application runs as a stack of 16+ Docker services:

```
┌─────────────────────────────────────────────┐
│  Angular App (:4010)                        │
│  ├── Kong API Gateway (:8000)               │
│  │   ├── GoTrue (Auth)                      │
│  │   ├── PostgREST (API)                    │
│  │   ├── Storage API                        │
│  │   ├── Realtime (WebSocket)               │
│  │   └── Edge Functions                     │
│  ├── PostgreSQL 15                          │
│  ├── Supabase Studio (:3000)                │
│  ├── Caddy (reverse proxy + SSL)            │
│  └── MCP Server (:3100) [optional]          │
└─────────────────────────────────────────────┘
```

## Self-Hosting

### Prerequisites

- Docker 20.10+ with Docker Compose v2
- 4 GB RAM minimum (8 GB recommended)

### Local Development

```bash
make setup    # generates .env.local with random secrets
make dev      # starts all services
```

### Production (VPS)

```bash
make setup-prod   # generates .env.production
# Edit OBS/.env.production with your domain/IP
make caddy        # generate Caddyfile from template
make prod         # start production stack
```

See [`TaskManager-Angular/OBS/README.md`](TaskManager-Angular/OBS/README.md) for detailed deployment documentation.

## CI/CD

GitHub Actions workflows are included:

- **CI** (`.github/workflows/ci.yml`): Lint + build on push to `main`/`develop` and PRs
- **Deploy** (`.github/workflows/deploy.yml`): Auto-deploy on `v*` tags + manual dispatch

### Required GitHub Secrets (only 2)

| Secret | Description |
|--------|-------------|
| `VPS_SSH_KEY` | SSH private key for VPS access |
| `ENV_PRODUCTION` | Full contents of `.env.production` |

The VPS connection info (`DEPLOY_VPS_HOST`, `DEPLOY_VPS_USER`, `DEPLOY_VPS_PATH`) is read from `ENV_PRODUCTION` — no duplication needed.

Generate `ENV_PRODUCTION` locally with `make setup-prod`, edit domains/SMTP/VPS info, then paste the file contents into the GitHub secret.

## MCP Server (Claude AI Integration)

The MCP server enables Claude to interact with your Kodo instance (projects, documents, tasks, etc.).

```bash
# Start as Docker service
make mcp

# Or run standalone
cd mcp-server && pnpm install && pnpm run start:http
```

See [`mcp-server/README.md`](mcp-server/README.md) for details.

## Project Structure

```
├── TaskManager-Angular/     # Angular application
│   ├── src/                 # Source code
│   ├── supabase/            # Migrations & Edge Functions
│   └── OBS/                 # Docker deployment configs
│       ├── docker-compose.yml
│       ├── Caddyfile.template
│       ├── .env.example
│       └── scripts/
├── mcp-server/              # MCP Server for Claude
├── .github/workflows/       # CI/CD pipelines
├── Makefile                 # Entry point for all commands
└── CLAUDE.md                # AI assistant conventions
```

## License

MIT
