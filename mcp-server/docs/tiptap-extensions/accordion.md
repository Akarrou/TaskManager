# Accordion
Noeuds : `accordionGroup`, `accordionItem`, `accordionTitle`, `accordionContent`
Hierarchie : `accordionGroup` > `accordionItem+` > (`accordionTitle` + `accordionContent`)

## Structure JSON

```json
{
  "type": "accordionGroup",
  "content": [
    {
      "type": "accordionItem",
      "content": [
        {
          "type": "accordionTitle",
          "attrs": {
            "icon": "description",
            "iconColor": "#3b82f6",
            "titleColor": "#1f2937",
            "collapsed": false
          },
          "content": [
            { "type": "text", "text": "Titre de l'accordeon" }
          ]
        },
        {
          "type": "accordionContent",
          "content": [
            {
              "type": "paragraph",
              "content": [
                { "type": "text", "text": "Contenu ici" }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

## Attributs (accordionTitle)

| Attribut | Type | Defaut | Description |
|----------|------|--------|-------------|
| `icon` | string | `"description"` | Nom de l'icone Material Icons |
| `iconColor` | string | `"#3b82f6"` | Couleur CSS de l'icone |
| `titleColor` | string | `"#1f2937"` | Couleur CSS du titre |
| `collapsed` | boolean | `false` | Etat replie |

## Contraintes

- Pas d'imbrication d'accordeons dans des accordeons
- `accordionGroup` doit contenir au moins un `accordionItem` (content: `accordionItem+`)
- `accordionItem` doit contenir exactement un `accordionTitle` suivi d'un `accordionContent`
- `accordionTitle` accepte du contenu inline (content: `inline*`)
- `accordionContent` doit contenir au moins un bloc (content: `block+`)
- Supprimer le dernier item remplace tout le groupe par un paragraphe
- `accordionItem` et `accordionContent` sont `isolating: true`
- `accordionGroup` est `draggable: true` et `defining: true`

## Commandes

| Commande | Description |
|----------|-------------|
| `insertAccordion(items = 1)` | Insere un groupe avec N items |
| `addAccordionItemAt(groupPos)` | Ajoute un item a la fin d'un groupe existant |
| `deleteAccordionItem(itemPos)` | Supprime un item (ou tout le groupe si c'est le dernier) |
