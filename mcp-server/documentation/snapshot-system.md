# Snapshot System — Sauvegarde automatique avant modification MCP

## Vue d'ensemble

Le systeme de snapshots sauvegarde automatiquement l'etat d'une entite **avant** chaque modification (update/delete) effectuee via les outils MCP. Si l'IA fait une erreur, l'utilisateur peut demander un rollback grace au token de snapshot retourne dans chaque reponse.

**Principe fondamental** : aucune modification ne demarre tant que le snapshot n'est pas confirme en base. Si le snapshot echoue, la modification est bloquee.

## Architecture

```
┌─────────────────────┐
│   Outil MCP         │
│  (ex: update_task)  │
└────────┬────────────┘
         │ 1. Fetch etat actuel
         │ 2. saveSnapshot() ──► Table mcp_snapshots
         │ 3. Modification (seulement si snapshot OK)
         │ 4. Reponse avec token "snap_xxx_yyy"
         ▼
┌─────────────────────┐
│  restore_snapshot    │◄── L'IA utilise le token pour rollback
└─────────────────────┘
```

### Fichiers

| Fichier | Role |
|---------|------|
| `src/services/snapshot.ts` | Service core : `saveSnapshot`, `restoreSnapshot`, `listSnapshots`, `cleanupOldSnapshots` |
| `src/tools/snapshots.ts` | 3 outils MCP : `restore_snapshot`, `list_snapshots`, `cleanup_snapshots` |
| `src/config.ts` | Variable `SNAPSHOT_RETENTION_DAYS` (defaut: 30 jours) |
| `migrations/20260222000001_create_mcp_snapshots.sql` | Table Supabase + index + RLS |

## Table `mcp_snapshots`

```sql
CREATE TABLE public.mcp_snapshots (
    id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    token         text NOT NULL UNIQUE,      -- snap_{entityId_12chars}_{timestamp_ms}
    entity_type   text NOT NULL,             -- document, project, task_row, etc.
    entity_id     text NOT NULL,             -- UUID ou ID composite de l'entite
    table_name    text,                      -- table Supabase cible (pour restore)
    tool_name     text NOT NULL,             -- outil MCP qui a declenche le snapshot
    operation     text NOT NULL,             -- 'update' ou 'delete'
    snapshot_data jsonb NOT NULL,            -- etat complet avant modification
    user_id       uuid,                      -- utilisateur authentifie
    created_at    timestamptz DEFAULT now()
);
```

**Index** : `(entity_type, entity_id)`, `(token)`, `(created_at)`

## Token

Format : `snap_{entityId_short_12chars}_{timestamp_ms}`

Exemple : `snap_a1b2c3d4e5f6_1740268800000`

Le token est retourne dans la reponse de chaque outil de modification :
```
Document updated (snapshot: snap_a1b2c3d4e5f6_1740268800000):
{ "id": "...", "title": "Mon document" }
```

## Types d'entites

| Entity Type | Table | Cle primaire | Mode restore |
|-------------|-------|-------------|--------------|
| `document` | `documents` | `id` | Standard |
| `project` | `projects` | `id` | Standard |
| `task_row` | `database_{uuid}` | `id` | Standard |
| `database_row` | `database_{uuid}` | `id` | Standard |
| `database_config` | `document_databases` | `database_id` | Standard |
| `tab` | `document_tabs` | `id` | Standard |
| `tab_group` | `document_tab_groups` | `id` | Standard |
| `section` | `document_sections` | `id` | Standard |
| `spreadsheet` | `document_spreadsheets` | `spreadsheet_id` | Standard |
| `comment` | `block_comments` | `id` | Standard |
| `spreadsheet_cell` | `spreadsheet_{uuid}_cells` | Composite | Upsert sur `(spreadsheet_id, sheet_id, row, col)` |
| `spreadsheet_cells_batch` | `spreadsheet_{uuid}_cells` | Composite | Upsert batch (tableau de cellules) |
| `spreadsheet_cells_range` | `spreadsheet_{uuid}_cells` | Composite | Upsert batch (tableau de cellules) |
| `file_metadata` | *(aucune)* | — | Non restorable (audit seulement) |

### Modes de restauration

- **Standard** : `update` → `.update(data).eq(pk, id)` / `delete` → `.insert(data)`
- **Composite** : upsert avec `onConflict: 'spreadsheet_id,sheet_id,row,col'`
- **Batch** : upsert de toutes les lignes du tableau
- **Non restorable** : `file_metadata` n'a pas de `table_name`, `restoreSnapshot` rejette

## Outils couverts (32 outils)

### Documents (2)
- `update_document` — snapshot du document avant modification
- `delete_document` — snapshot de chaque document (cascade inclus)

### Tasks (4)
- `update_task` — snapshot de la row avant modification
- `update_task_status` — snapshot de la row
- `update_task_priority` — snapshot de la row
- `delete_task` — snapshot de la row avant suppression

### Projects (3)
- `update_project` — snapshot du projet
- `archive_project` — snapshot du projet
- `delete_project` — snapshot du projet

### Databases (6)
- `update_database_row` — snapshot de la row
- `delete_database_rows` — snapshot de chaque row
- `delete_database` — snapshot de la config DB
- `add_column` — snapshot de la config DB (apres validation colonne unique)
- `update_column` — snapshot de la config DB (apres validation colonne existante)
- `delete_column` — snapshot de la config DB (apres validation colonne existante)

### Tabs & Sections (8)
- `update_tab` — snapshot du tab
- `delete_tab` — snapshot du tab + sections associees
- `set_default_tab` — snapshot du nouveau et ancien tab default
- `reorder_tabs` — snapshot de tous les tabs reordonnes
- `update_tab_group` — snapshot du groupe
- `delete_tab_group` — snapshot du groupe + tabs degroupes
- `update_section` — snapshot de la section
- `delete_section` — snapshot de la section

### Spreadsheets (7)
- `update_spreadsheet` — snapshot de la config complete
- `delete_spreadsheet` — snapshot de la config
- `update_cell` — snapshot de la cellule existante
- `update_cells_batch` — snapshot cible (seules les cellules affectees)
- `clear_range` — snapshot des cellules dans la plage
- `rename_sheet` — snapshot de la config (apres validation sheet existant)
- `delete_sheet` — snapshot de la config (apres validation sheet existant et non-dernier)

### Comments (1)
- `delete_comment` — snapshot du commentaire

### Storage (1)
- `delete_file` — snapshot des metadonnees uniquement (contenu fichier non restorable)

## Outils de gestion des snapshots (3)

### `restore_snapshot`
Restaure une entite a son etat precedent.
- Parametre : `token` (string)
- Pour `update` : ecrase l'entite avec les donnees du snapshot
- Pour `delete` : re-insere l'entite

### `list_snapshots`
Liste les snapshots recents pour retrouver un token.
- Parametres : `entity_type` (optionnel), `entity_id` (optionnel), `limit` (defaut 10, max 50)

### `cleanup_snapshots`
Supprime manuellement les snapshots expires.
- Le nettoyage automatique se declenche avec 1% de probabilite a chaque `saveSnapshot`
- Retention configurable via `SNAPSHOT_RETENTION_DAYS` (defaut : 30 jours)

## Pattern d'integration

Chaque outil de modification suit ce pattern :

```typescript
// 1. Validations (acces, existence, contraintes metier)
const hasAccess = await userHasDatabaseAccess(supabase, id, userId);
if (!hasAccess) return { isError: true, ... };

// 2. Fetch etat actuel
const { data: current } = await supabase.from('table').select('*').eq('id', entityId).single();

// 3. Snapshot OBLIGATOIRE (bloquant si echec)
const snapshot = await saveSnapshot({
  entityType: 'entity_type',
  entityId: entityId,
  tableName: 'table',
  toolName: 'tool_name',
  operation: 'update',  // ou 'delete'
  data: current,
  userId,
});

// 4. Modification (seulement apres snapshot confirme)
const { data, error } = await supabase.from('table').update(updates).eq('id', entityId);

// 5. Token dans la reponse
return { content: [{ type: 'text', text: `Updated (snapshot: ${snapshot.token})` }] };
```

**Regle importante** : les validations metier (colonne existe, sheet existe, updates non vides) doivent se faire **avant** le snapshot pour eviter les snapshots inutiles.

## Configuration

Variable d'environnement dans `.env` :

```env
SNAPSHOT_RETENTION_DAYS=30
```

Validee dans `config.ts` via Zod : `z.coerce.number().default(30)`
