# Mind Map
Noeud : `mindmap` (atom)
Carte mentale interactive. Les donnees (noeuds, config) sont stockees en JSON directement dans les attributs du noeud.

## Structure JSON

```json
{
  "type": "mindmap",
  "attrs": {
    "mindmapId": "mm-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "data": {
      "nodes": [
        {
          "id": "root-uuid",
          "label": "Idee centrale",
          "parentId": null,
          "children": [],
          "collapsed": false
        }
      ],
      "rootId": "root-uuid",
      "config": {}
    }
  }
}
```

## Attributs

| Attribut | Type | Defaut | Description |
|----------|------|--------|-------------|
| `mindmapId` | string | `""` | ID unique. Format : `"mm-" + UUID` |
| `data` | MindmapData | `createDefaultMindmapData()` | Objet contenant : nodes (tableau de noeuds avec id, label, parentId, children, style, collapsed), rootId, config |

## Contraintes

- Noeud atomique — pas de contenu editable
- `selectable: false`, `draggable: false`
- Raccourci clavier : `Mod-Shift-m`
- `data.rootId` doit correspondre a l'id d'un noeud dans `data.nodes`

## Commandes

| Commande | Description |
|----------|-------------|
| `insertMindmap(data?)` | Insere une mind map. Genere automatiquement un mindmapId |
| `updateMindmap(mindmapId, data)` | Met a jour les donnees d'une mind map existante par son ID |
