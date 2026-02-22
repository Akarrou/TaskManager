# Task Mention
Noeud : `taskMention` (atom)
Carte de reference de tache integree dans le document. Affiche le statut, la priorite, le type et le numero de la tache.

## Structure JSON

```json
{
  "type": "taskMention",
  "attrs": {
    "taskId": "uuid-de-la-tache",
    "taskTitle": "Titre de la tache",
    "taskStatus": "pending",
    "taskPriority": "medium",
    "taskType": "task",
    "taskNumber": 42
  }
}
```

## Attributs

| Attribut | Type | Defaut | Description |
|----------|------|--------|-------------|
| `taskId` | string \| null | `null` | UUID de la tache |
| `taskTitle` | string | `""` | Titre affiche |
| `taskStatus` | string | `"pending"` | Valeurs : `pending`, `in_progress`, `review`, `completed`, `cancelled` |
| `taskPriority` | string | `"medium"` | Valeurs : `low`, `medium`, `high`, `urgent` |
| `taskType` | string | `"task"` | Valeurs : `epic`, `feature`, `task` |
| `taskNumber` | number \| null | `null` | Numero de la tache |

## Commandes

| Commande | Description |
|----------|-------------|
| `insertTaskMention(attrs)` | Insere une carte de tache. attrs : `{ taskId, taskTitle, taskStatus, taskPriority, taskType, taskNumber? }` |
| `updateTaskMention(taskId, attrs)` | Met a jour une mention existante par taskId. attrs partiels acceptes |
