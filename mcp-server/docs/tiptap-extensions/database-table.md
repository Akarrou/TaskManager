# Database Table
Noeud : `databaseTable` (atom)
Bloc atomique representant une base de donnees embarquee. Les donnees sont stockees dans des tables PostgreSQL dynamiques via Supabase.

## Structure JSON

```json
{
  "type": "databaseTable",
  "attrs": {
    "databaseId": "db-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "config": {
      "name": "Nouvelle base de donnees",
      "columns": [
        {
          "id": "uuid",
          "name": "Nom",
          "type": "text",
          "visible": true,
          "required": true,
          "order": 0,
          "isNameColumn": true,
          "color": "blue"
        }
      ],
      "views": [
        {
          "id": "view-table",
          "name": "Vue tableau",
          "type": "table",
          "config": {}
        }
      ],
      "defaultView": "table"
    },
    "storageMode": "supabase",
    "isLinked": false
  }
}
```

## Attributs

| Attribut | Type | Defaut | Description |
|----------|------|--------|-------------|
| `databaseId` | string | `""` | ID de la base de donnees |
| `config` | object | `DEFAULT_DATABASE_CONFIG` | Configuration complete (name, columns, views, defaultView) |
| `storageMode` | string | `"supabase"` | Mode de stockage |
| `isLinked` | boolean | `false` | Si la base est liee a une source externe |

## Contraintes

- Noeud atomique — pas de contenu editable a l'interieur
- `selectable: false`, `draggable: false`
- Raccourci clavier : `Mod-Shift-d`

## Commandes

| Commande | Description |
|----------|-------------|
| `insertDatabaseTable(databaseId?)` | Insere un bloc base de donnees. Si databaseId est omis, cree avec un ID vide |

## Workflow d'integration

L'insertion d'une base de donnees dans un document se fait en 2 etapes :

1. **Creer la base** via `create_database` avec un `name` et un `type` → retourne `database_id` et `config`
2. **Inserer le noeud** `databaseTable` dans le document :
   - **Si `document_id` est fourni** dans `create_database` : le noeud est insere **automatiquement** a la fin du contenu du document. Aucun appel supplementaire a `update_document` n'est necessaire.
   - **Si `document_id` n'est pas fourni** : utiliser `update_document` pour inserer le noeud manuellement dans le document cible, en utilisant le `tiptap_node` retourne par `create_database`.

## Exemple complet

Document TipTap avec un heading suivi d'un noeud `databaseTable` utilisant les valeurs retournees par `create_database` :

```json
{
  "type": "doc",
  "content": [
    {
      "type": "heading",
      "attrs": { "level": 1 },
      "content": [{ "type": "text", "text": "Mon projet" }]
    },
    {
      "type": "databaseTable",
      "attrs": {
        "databaseId": "db-xxx-retourne-par-create_database",
        "config": { "...config retournee par create_database..." },
        "storageMode": "supabase",
        "isLinked": false
      }
    }
  ]
}
```

## Regles importantes

- `databaseId` et `config` doivent provenir de la reponse de `create_database`, ne JAMAIS les inventer
- Le noeud doit etre un element direct du tableau `content` du document (pas imbrique dans un paragraph)
- `storageMode` toujours `"supabase"`, `isLinked` toujours `false` pour une base creee par l'utilisateur
