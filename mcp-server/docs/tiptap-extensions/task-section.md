# Task Section
Noeud : `taskSection` (atom)
Bloc affichant les taches liees au document courant. Rendu par un composant Angular.

## Structure JSON

```json
{
  "type": "taskSection",
  "attrs": {
    "documentId": "uuid-du-document"
  }
}
```

## Attributs

| Attribut | Type | Defaut | Description |
|----------|------|--------|-------------|
| `documentId` | string \| null | `null` | ID du document parent. Recupere automatiquement depuis `editor.options.documentId` |

## Contraintes

- Noeud atomique et `draggable: true`
- `isolating: true`
- Raccourci clavier : `Mod-Shift-t`

## Commandes

| Commande | Description |
|----------|-------------|
| `insertTaskSection()` | Insere une section taches liee au document courant |
