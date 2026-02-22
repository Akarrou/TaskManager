# Columns
Noeuds : `columns`, `column`
Hierarchie : `columns` > `column+` > `block+`

## Structure JSON

```json
{
  "type": "columns",
  "content": [
    {
      "type": "column",
      "content": [
        {
          "type": "paragraph",
          "content": [{ "type": "text", "text": "Colonne 1" }]
        }
      ]
    },
    {
      "type": "column",
      "content": [
        {
          "type": "paragraph",
          "content": [{ "type": "text", "text": "Colonne 2" }]
        }
      ]
    }
  ]
}
```

## Attributs

Aucun attribut custom. Les noeuds `columns` et `column` n'ont pas d'attributs.

## Contraintes

- Pas d'imbrication de colonnes dans des colonnes
- `columns` doit contenir au moins une `column` (content: `column+`)
- Chaque `column` doit contenir au moins un bloc (content: `block+`)
- `column` est `isolating: true`
- `columns` est `defining: true`

## Commandes

| Commande | Description |
|----------|-------------|
| `setColumns(n = 2)` | Insere une mise en page a N colonnes |
| `unsetColumns()` | Remplace par un paragraphe simple |
