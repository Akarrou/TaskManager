# Enhanced Image
Noeud : `image` (extends `@tiptap/extension-image`)
Extension de l'image TipTap standard avec ajout de l'alignement et de la legende.

## Structure JSON

```json
{
  "type": "image",
  "attrs": {
    "src": "https://example.com/image.png",
    "alt": "Description de l'image",
    "title": "Titre",
    "alignment": "center",
    "caption": "Legende de l'image"
  }
}
```

## Attributs

| Attribut | Type | Defaut | Description |
|----------|------|--------|-------------|
| `src`, `alt`, `title` | string | _(herites)_ | Herites de `@tiptap/extension-image` |
| `alignment` | string | `"center"` | Valeurs : `"left"`, `"center"`, `"right"` |
| `caption` | string | `""` | Legende de l'image |

## Commandes

| Commande | Description |
|----------|-------------|
| `setImageAlignment(alignment)` | Definit l'alignement (`'left'`, `'center'`, `'right'`) |
| `setImageCaption(caption)` | Definit la legende de l'image |
| `setImage(options)` | Herite. Insere/remplace une image (src, alt, title) |
