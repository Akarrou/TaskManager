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
