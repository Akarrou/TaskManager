# Block ID
Type : Extension globale (pas un noeud)
Ajoute un attribut `blockId` stable a tous les noeuds block-level. Permet d'attacher des commentaires a des blocs specifiques.

## Utilisation dans le JSON

```json
{
  "type": "paragraph",
  "attrs": {
    "blockId": "block-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
  },
  "content": [
    { "type": "text", "text": "Un paragraphe avec un blockId" }
  ]
}
```

## Noeuds supportes

L'attribut `blockId` est disponible sur 22 types de noeuds :

```
paragraph, heading, blockquote, codeBlock,
bulletList, orderedList, taskList, listItem, taskItem,
table, tableRow, tableCell, tableHeader,
horizontalRule, image,
columns, column,
databaseTable, taskSection,
accordionGroup, accordionItem, accordionTitle, accordionContent
```

## Attributs

| Attribut | Type | Defaut | Description |
|----------|------|--------|-------------|
| `blockId` | string \| null | `null` | ID unique du bloc. Format : `"block-" + UUID v4`. Genere a la demande (lazy) |

## Commandes

| Commande | Description |
|----------|-------------|
| `ensureBlockId()` | Genere un blockId si le bloc courant n'en a pas |
| `getBlockId()` | Retourne le blockId du bloc courant (ou null) |
| `setBlockId(blockId)` | Definit manuellement le blockId du bloc courant |
| `setBlocksWithComments(blockIds, counts)` | Met a jour les decorations visuelles des blocs commentes |
