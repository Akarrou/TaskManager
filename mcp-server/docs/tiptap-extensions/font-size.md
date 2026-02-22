# Font Size
Type : Extension sur `textStyle` (pas un noeud)
Ajoute le support de la taille de police via le mark `textStyle`. Depend de `@tiptap/extension-text-style`.

## Utilisation dans le JSON

```json
{
  "type": "text",
  "text": "Texte en 18px",
  "marks": [
    {
      "type": "textStyle",
      "attrs": {
        "fontSize": "18px"
      }
    }
  ]
}
```

## Attributs

| Attribut | Type | Defaut | Description |
|----------|------|--------|-------------|
| `fontSize` | string \| null | `null` | Taille CSS (ex: `"14px"`, `"1.2em"`). Rendu comme style inline `font-size` |

## Commandes

| Commande | Description |
|----------|-------------|
| `setFontSize(fontSize)` | Applique une taille de police au texte selectionne |
| `unsetFontSize()` | Retire la taille de police du texte selectionne |
