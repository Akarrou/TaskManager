# Spreadsheet
Noeud : `spreadsheet` (atom)
Tableur de type Excel avec support multi-feuilles et HyperFormula. Donnees stockees dans des tables Supabase dynamiques.

## Structure JSON

```json
{
  "type": "spreadsheet",
  "attrs": {
    "spreadsheetId": "sp-xxxxxxxx",
    "config": {
      "name": "Feuille de calcul",
      "sheets": [
        {
          "id": "uuid",
          "name": "Feuille 1",
          "order": 0
        }
      ],
      "activeSheetId": "uuid",
      "namedRanges": [],
      "showGridlines": true,
      "showRowHeaders": true,
      "showColumnHeaders": true,
      "defaultCellFormat": {
        "fontFamily": "Arial",
        "fontSize": 11,
        "textAlign": "left",
        "verticalAlign": "middle"
      }
    },
    "storageMode": "supabase"
  }
}
```

## Attributs

| Attribut | Type | Defaut | Description |
|----------|------|--------|-------------|
| `spreadsheetId` | string | `""` | ID du tableur |
| `config` | object | `createDefaultSpreadsheetConfig()` | Configuration complete (name, sheets, activeSheetId, namedRanges, gridlines, headers, defaultCellFormat) |
| `storageMode` | string | `"supabase"` | Mode de stockage |

## Contraintes

- Noeud atomique — pas de contenu editable
- `selectable: false`, `draggable: false`
- Raccourci clavier : `Mod-Shift-x`

## Commandes

| Commande | Description |
|----------|-------------|
| `insertSpreadsheet(spreadsheetId?, name?)` | Insere un bloc tableur. name defaut : "Feuille de calcul" |
