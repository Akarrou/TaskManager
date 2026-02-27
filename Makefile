# ===================================================================
# Kodo Task Manager - Makefile
# ===================================================================
# Single entry point for all operations
# Usage: make help
# ===================================================================

SHELL := /bin/bash
OBS_DIR := TaskManager-Angular/OBS
SCRIPTS_DIR := $(OBS_DIR)/scripts

.DEFAULT_GOAL := help

# ===================================================================
# Help
# ===================================================================

.PHONY: help
help: ## Show this help
	@echo ""
	@echo "Kōdo Task Manager"
	@echo "=================="
	@echo ""
	@echo "Usage: make <target>"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'
	@echo ""

# ===================================================================
# Setup
# ===================================================================

.PHONY: setup
setup: ## Generate secrets for local development
	@cd $(OBS_DIR) && ./scripts/generate-secrets.sh

.PHONY: setup-prod
setup-prod: ## Generate secrets for production
	@cd $(OBS_DIR) && ./scripts/generate-secrets.sh --production

# ===================================================================
# Docker Services
# ===================================================================

.PHONY: dev
dev: ## Start local development stack
	@cd $(OBS_DIR) && docker compose --profile local up -d
	@echo ""
	@echo "Application:     http://localhost:4010"
	@echo "Supabase Studio: http://localhost:3000"
	@echo "API:             http://localhost:8000"

.PHONY: prod
prod: ## Start production stack
	@cd $(OBS_DIR) && docker compose --profile production up -d

.PHONY: down
down: ## Stop all services
	@cd $(OBS_DIR) && docker compose down

.PHONY: logs
logs: ## Tail logs (use SERVICE=app to filter)
ifdef SERVICE
	@cd $(OBS_DIR) && docker compose logs -f $(SERVICE)
else
	@cd $(OBS_DIR) && docker compose logs -f
endif

.PHONY: status
status: ## Show service status
	@cd $(OBS_DIR) && docker compose ps

.PHONY: rebuild
rebuild: ## Rebuild and restart the Angular app
	@cd $(OBS_DIR) && docker compose build app && docker compose up -d app

# ===================================================================
# Database & Users
# ===================================================================

.PHONY: seed
seed: ## Create the default user
	@cd $(OBS_DIR) && \
	if [ -f .env.production ]; then \
		export $$(grep -E '^SEED_USER_' .env.production | xargs) && ./scripts/seed-user.sh; \
	elif [ -f .env.local ]; then \
		export $$(grep -E '^SEED_USER_' .env.local | xargs) && ./scripts/seed-user.sh; \
	else \
		./scripts/seed-user.sh; \
	fi

# ===================================================================
# Production
# ===================================================================

.PHONY: deploy
deploy: ## Deploy to VPS
	@cd $(OBS_DIR) && ./scripts/deploy.sh

.PHONY: caddy
caddy: ## Generate Caddyfile from template
	@cd $(OBS_DIR) && ./scripts/generate-caddyfile.sh

# ===================================================================
# MCP Server
# ===================================================================

.PHONY: mcp
mcp: ## Start MCP server (Docker)
	@cd $(OBS_DIR) && docker compose --profile mcp up -d mcp-server

.PHONY: mcp-build
mcp-build: ## Build MCP server locally
	@cd mcp-server && pnpm run build
