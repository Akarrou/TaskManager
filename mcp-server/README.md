# TaskManager MCP Server

Serveur MCP (Model Context Protocol) pour TaskManager (Kōdo). Permet à Claude d'interagir avec vos projets, documents, tâches et bases de données.

## Installation

```bash
cd mcp-server
npm install
npm run build
```

## Configuration

1. Copiez `.env.example` vers `.env`:
```bash
cp .env.example .env
```

2. Configurez les variables d'environnement:
```env
SUPABASE_URL=http://localhost:8000
SUPABASE_SERVICE_ROLE_KEY=votre-service-role-key
STORAGE_BUCKET=documents-files
HTTP_PORT=3100
```

## Utilisation

### Claude Desktop

Ajoutez à `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "taskmanager": {
      "command": "node",
      "args": ["/chemin/vers/Task manager/mcp-server/dist/index.js"],
      "env": {
        "SUPABASE_URL": "http://localhost:8000",
        "SUPABASE_SERVICE_ROLE_KEY": "votre-service-role-key"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add taskmanager -- node "/chemin/vers/Task manager/mcp-server/dist/index.js"
```

### HTTP (Claude Web)

```bash
npm run start:http
# Endpoint: http://localhost:3100/mcp
```

## Outils disponibles

### Projects (6 outils)
| Outil | Description |
|-------|-------------|
| `list_projects` | Lister tous les projets |
| `get_project` | Obtenir les détails d'un projet |
| `create_project` | Créer un nouveau projet |
| `update_project` | Modifier un projet |
| `archive_project` | Archiver un projet |
| `list_project_members` | Lister les membres d'un projet |

### Documents (6 outils)
| Outil | Description |
|-------|-------------|
| `list_documents` | Lister les documents |
| `get_document` | Obtenir un document avec son contenu |
| `create_document` | Créer un document |
| `update_document` | Modifier un document |
| `delete_document` | Supprimer un document (avec cascade) |
| `search_documents` | Rechercher des documents |

### Tasks (5 outils)
| Outil | Description |
|-------|-------------|
| `list_tasks` | Lister les tâches de toutes les bases |
| `get_task_stats` | Obtenir les statistiques des tâches |
| `update_task_status` | Modifier le statut d'une tâche |
| `update_task_priority` | Modifier la priorité d'une tâche |
| `create_task` | Créer une nouvelle tâche |

### Databases (6 outils)
| Outil | Description |
|-------|-------------|
| `list_databases` | Lister les bases de données |
| `get_database_schema` | Obtenir le schéma d'une base |
| `get_database_rows` | Requêter les lignes |
| `add_database_row` | Ajouter une ligne |
| `update_database_row` | Modifier une ligne |
| `delete_database_rows` | Supprimer des lignes |

### Storage (3 outils)
| Outil | Description |
|-------|-------------|
| `list_document_files` | Lister les fichiers d'un document |
| `get_file_url` | Obtenir l'URL d'un fichier |
| `delete_file` | Supprimer un fichier |

## Prompts disponibles

### Projets
- `project_summary` - Résumé complet d'un projet
- `project_status_report` - Rapport d'avancement formel

### Tâches
- `daily_standup` - Résumé pour standup quotidien
- `task_breakdown` - Décomposer une tâche en sous-tâches
- `sprint_planning` - Aide à la planification de sprint
- `blocked_tasks_review` - Analyse des tâches bloquées

### Documents
- `document_outline` - Générer un plan de document
- `prd_template` - Template PRD selon les conventions du projet
- `meeting_notes` - Template de notes de réunion

## Développement

```bash
# Mode développement (stdio)
npm run dev

# Mode développement (HTTP)
npm run dev:http

# Vérification TypeScript
npm run typecheck

# Test avec MCP Inspector
npm run inspect
```

## Architecture

```
mcp-server/
├── src/
│   ├── index.ts           # Point d'entrée stdio
│   ├── http-server.ts     # Point d'entrée HTTP
│   ├── server.ts          # Configuration MCP
│   ├── config.ts          # Gestion des variables d'env
│   ├── tools/
│   │   ├── projects.ts    # Outils projets
│   │   ├── documents.ts   # Outils documents
│   │   ├── tasks.ts       # Outils tâches
│   │   ├── databases.ts   # Outils bases de données
│   │   └── storage.ts     # Outils stockage
│   ├── prompts/
│   │   ├── project-prompts.ts
│   │   ├── task-prompts.ts
│   │   └── document-prompts.ts
│   └── services/
│       └── supabase-client.ts
├── package.json
├── tsconfig.json
└── .env.example
```

## Sécurité

- Le `SERVICE_ROLE_KEY` n'est jamais exposé côté client
- Toutes les entrées sont validées avec Zod
- Le transport stdio est local uniquement
- Pour HTTP en production, utilisez un reverse proxy avec authentification

## Licence

MIT
