# Kodo MCP Server

Serveur MCP (Model Context Protocol) pour Kodo. Permet à Claude d'interagir avec vos projets, documents, tâches, bases de données, spreadsheets et plus encore.

**Version:** 0.2.0

## Installation

```bash
cd mcp-server
pnpm install
pnpm run build
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
    "kodo": {
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
claude mcp add kodo --scope project -- node "/chemin/vers/Task manager/mcp-server/dist/index.js"
```

### HTTP (Claude Web)

```bash
pnpm run start:http
# Endpoint: http://localhost:3100/mcp
```

## Outils disponibles (71 outils)

### Projects (8 outils)
| Outil | Description |
|-------|-------------|
| `list_projects` | Lister tous les projets |
| `get_project` | Obtenir les détails d'un projet |
| `create_project` | Créer un nouveau projet |
| `update_project` | Modifier un projet |
| `archive_project` | Archiver un projet |
| `restore_project` | Restaurer un projet archivé |
| `delete_project` | Supprimer un projet (avec cascade) |
| `list_project_members` | Lister les membres d'un projet |

### Documents (11 outils)
| Outil | Description |
|-------|-------------|
| `list_documents` | Lister les documents |
| `get_document` | Obtenir un document avec son contenu |
| `create_document` | Créer un document |
| `update_document` | Modifier un document |
| `delete_document` | Supprimer un document (avec cascade) |
| `search_documents` | Rechercher des documents |
| `get_document_breadcrumb` | Obtenir le chemin de navigation |
| `get_documents_stats` | Statistiques des documents |
| `link_task_to_document` | Lier une tâche à un document |
| `get_document_tasks` | Obtenir les tâches liées |
| `unlink_task_from_document` | Délier une tâche |

### Tasks (8 outils)
| Outil | Description |
|-------|-------------|
| `list_tasks` | Lister les tâches de toutes les bases |
| `get_task` | Obtenir une tâche spécifique |
| `get_task_stats` | Obtenir les statistiques des tâches |
| `create_task` | Créer une nouvelle tâche |
| `update_task` | Modifier tous les champs d'une tâche |
| `update_task_status` | Modifier le statut d'une tâche |
| `update_task_priority` | Modifier la priorité d'une tâche |
| `delete_task` | Supprimer une tâche |

### Databases (12 outils)
| Outil | Description |
|-------|-------------|
| `list_databases` | Lister les bases de données |
| `get_database_schema` | Obtenir le schéma d'une base |
| `create_database` | Créer une base de données |
| `delete_database` | Supprimer une base (cascade) |
| `get_database_rows` | Requêter les lignes |
| `add_database_row` | Ajouter une ligne |
| `update_database_row` | Modifier une ligne |
| `delete_database_rows` | Supprimer des lignes |
| `add_column` | Ajouter une colonne |
| `update_column` | Modifier une colonne |
| `delete_column` | Supprimer une colonne |
| `import_csv` | Importer des données CSV |

### Tabs & Organisation (14 outils)
| Outil | Description |
|-------|-------------|
| `list_tabs` | Lister les tabs d'un projet |
| `create_tab` | Créer un tab |
| `update_tab` | Modifier un tab |
| `delete_tab` | Supprimer un tab |
| `set_default_tab` | Définir le tab par défaut |
| `reorder_tabs` | Réordonner les tabs |
| `list_tab_groups` | Lister les groupes de tabs |
| `create_tab_group` | Créer un groupe |
| `update_tab_group` | Modifier un groupe |
| `delete_tab_group` | Supprimer un groupe |
| `list_sections` | Lister les sections d'un tab |
| `create_section` | Créer une section |
| `update_section` | Modifier une section |
| `delete_section` | Supprimer une section |

### Spreadsheets (12 outils)
| Outil | Description |
|-------|-------------|
| `list_spreadsheets` | Lister les spreadsheets |
| `get_spreadsheet` | Obtenir un spreadsheet |
| `create_spreadsheet` | Créer un spreadsheet |
| `update_spreadsheet` | Modifier la configuration |
| `delete_spreadsheet` | Supprimer un spreadsheet |
| `get_cells` | Obtenir les cellules d'une plage |
| `update_cell` | Modifier une cellule |
| `update_cells_batch` | Modifier plusieurs cellules |
| `add_sheet` | Ajouter une feuille |
| `rename_sheet` | Renommer une feuille |
| `delete_sheet` | Supprimer une feuille |
| `clear_range` | Effacer une plage |

### Comments (5 outils)
| Outil | Description |
|-------|-------------|
| `list_comments` | Lister les commentaires d'un document/block |
| `add_comment` | Ajouter un commentaire |
| `delete_comment` | Supprimer un commentaire |
| `get_comment_count` | Compter les commentaires |
| `get_blocks_with_comments` | Lister les blocks avec commentaires |

### Users & Profiles (4 outils)
| Outil | Description |
|-------|-------------|
| `list_users` | Lister tous les utilisateurs |
| `get_user` | Obtenir un utilisateur |
| `get_profile` | Obtenir un profil |
| `update_profile` | Modifier un profil |

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
pnpm run dev

# Mode développement (HTTP)
pnpm run dev:http

# Vérification TypeScript
pnpm run typecheck

# Test avec MCP Inspector
pnpm run inspect
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
│   │   ├── projects.ts    # Outils projets (8)
│   │   ├── documents.ts   # Outils documents (11)
│   │   ├── tasks.ts       # Outils tâches (8)
│   │   ├── databases.ts   # Outils bases de données (12)
│   │   ├── tabs.ts        # Outils tabs/organisation (14)
│   │   ├── spreadsheets.ts# Outils spreadsheets (12)
│   │   ├── comments.ts    # Outils commentaires (5)
│   │   ├── users.ts       # Outils utilisateurs (4)
│   │   └── storage.ts     # Outils stockage (3)
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
