# TaskPlan – Refonte UI/UX gestion hiérarchique des tâches

## Vue synthétique (tableau)

| Niveau   | Slug                                      | Titre                                              | Env      | Est. |
| -------- | ----------------------------------------- | -------------------------------------------------- | -------- | ---- |
| Epic     | prd-ui-ux-hierarchie-tasks                | Refonte UI/UX gestion hiérarchique des tâches      | frontend | –    |
| Feature  | prd-ui-ux-hierarchie-tasks:frontend:1     | Vue arborescente des tâches (tree view)            | frontend | –    |
| Task     | prd-ui-ux-hierarchie-tasks:frontend:1:1   | Composant Angular Material Tree                    | frontend | 8    |
| Sub-task | prd-ui-ux-hierarchie-tasks:frontend:1:1:1 | Afficher Epic > Feature > Task > Sub-task          | frontend | 4    |
| Sub-task | prd-ui-ux-hierarchie-tasks:frontend:1:1:2 | Navigation parent/enfant dans l'arborescence       | frontend | 2    |
| Feature  | prd-ui-ux-hierarchie-tasks:frontend:2     | Formulaire création/édition contextuelle           | frontend | –    |
| Task     | prd-ui-ux-hierarchie-tasks:frontend:2:1   | Sélecteur de type de tâche                         | frontend | 4    |
| Task     | prd-ui-ux-hierarchie-tasks:frontend:2:2   | Génération automatique des slugs/PRD slugs         | frontend | 4    |
| Task     | prd-ui-ux-hierarchie-tasks:frontend:2:3   | Création contextuelle (parent pré-rempli)          | frontend | 2    |
| Feature  | prd-ui-ux-hierarchie-tasks:frontend:3     | Filtres avancés et recherche multi-critères        | frontend | –    |
| Task     | prd-ui-ux-hierarchie-tasks:frontend:3:1   | Filtres par type, parent, PRD, tag                 | frontend | 4    |
| Task     | prd-ui-ux-hierarchie-tasks:frontend:3:2   | Recherche textuelle globale                        | frontend | 2    |
| Feature  | prd-ui-ux-hierarchie-tasks:frontend:4     | Vue Roadmap synthétique exportable                 | frontend | –    |
| Task     | prd-ui-ux-hierarchie-tasks:frontend:4:1   | Tableau exportable Markdown/JSON                   | frontend | 4    |
| Feature  | prd-ui-ux-hierarchie-tasks:frontend:5     | Modification de la hiérarchie (drag & drop)        | frontend | –    |
| Task     | prd-ui-ux-hierarchie-tasks:frontend:5:1   | Drag & drop pour changer le parent                 | frontend | 6    |
| Task     | prd-ui-ux-hierarchie-tasks:frontend:5:2   | Mise à jour automatique des slugs enfants          | frontend | 2    |
| Feature  | prd-ui-ux-hierarchie-tasks:frontend:6     | Améliorations ergonomiques                         | frontend | –    |
| Task     | prd-ui-ux-hierarchie-tasks:frontend:6:1   | Breadcrumb, badges, info-bulles, navigation rapide | frontend | 4    |

---

## TaskPlan JSON

```json
{
  "tasks": [
    {
      "title": "Refonte UI/UX gestion hiérarchique des tâches",
      "slug": "prd-ui-ux-hierarchie-tasks",
      "type": "epic",
      "guideline_refs": ["FG", "PG", "TA"],
      "environment": ["frontend"],
      "tags": ["user-story", "PRD:prd-ui-ux-hierarchie-tasks"]
    },
    {
      "title": "Vue arborescente des tâches (tree view)",
      "slug": "prd-ui-ux-hierarchie-tasks:frontend:1",
      "type": "feature",
      "parent_task_id": "<uuid-epic>",
      "guideline_refs": ["FG", "PG", "TA"],
      "environment": ["frontend"],
      "tags": ["feature", "PRD:prd-ui-ux-hierarchie-tasks"]
    },
    {
      "title": "Composant Angular Material Tree",
      "slug": "prd-ui-ux-hierarchie-tasks:frontend:1:1",
      "type": "task",
      "parent_task_id": "<uuid-feature-1>",
      "guideline_refs": ["FG", "TA"],
      "environment": ["frontend"],
      "tags": ["task", "PRD:prd-ui-ux-hierarchie-tasks"],
      "estimated_hours": 8
    },
    {
      "title": "Formulaire création/édition contextuelle",
      "slug": "prd-ui-ux-hierarchie-tasks:frontend:2",
      "type": "feature",
      "parent_task_id": "<uuid-epic>",
      "guideline_refs": ["FG", "PG", "TA"],
      "environment": ["frontend"],
      "tags": ["feature", "PRD:prd-ui-ux-hierarchie-tasks"]
    },
    {
      "title": "Sélecteur de type de tâche",
      "slug": "prd-ui-ux-hierarchie-tasks:frontend:2:1",
      "type": "task",
      "parent_task_id": "<uuid-feature-2>",
      "guideline_refs": ["FG", "TA"],
      "environment": ["frontend"],
      "tags": ["task", "PRD:prd-ui-ux-hierarchie-tasks"],
      "estimated_hours": 4
    },
    {
      "title": "Génération automatique des slugs/PRD slugs",
      "slug": "prd-ui-ux-hierarchie-tasks:frontend:2:2",
      "type": "task",
      "parent_task_id": "<uuid-feature-2>",
      "guideline_refs": ["FG", "TA"],
      "environment": ["frontend"],
      "tags": ["task", "PRD:prd-ui-ux-hierarchie-tasks"],
      "estimated_hours": 4
    },
    {
      "title": "Création contextuelle (parent pré-rempli)",
      "slug": "prd-ui-ux-hierarchie-tasks:frontend:2:3",
      "type": "task",
      "parent_task_id": "<uuid-feature-2>",
      "guideline_refs": ["FG", "TA"],
      "environment": ["frontend"],
      "tags": ["task", "PRD:prd-ui-ux-hierarchie-tasks"],
      "estimated_hours": 2
    },
    {
      "title": "Filtres avancés et recherche multi-critères",
      "slug": "prd-ui-ux-hierarchie-tasks:frontend:3",
      "type": "feature",
      "parent_task_id": "<uuid-epic>",
      "guideline_refs": ["FG", "PG", "TA"],
      "environment": ["frontend"],
      "tags": ["feature", "PRD:prd-ui-ux-hierarchie-tasks"]
    },
    {
      "title": "Filtres par type, parent, PRD, tag",
      "slug": "prd-ui-ux-hierarchie-tasks:frontend:3:1",
      "type": "task",
      "parent_task_id": "<uuid-feature-3>",
      "guideline_refs": ["FG", "TA"],
      "environment": ["frontend"],
      "tags": ["task", "PRD:prd-ui-ux-hierarchie-tasks"],
      "estimated_hours": 4
    },
    {
      "title": "Recherche textuelle globale",
      "slug": "prd-ui-ux-hierarchie-tasks:frontend:3:2",
      "type": "task",
      "parent_task_id": "<uuid-feature-3>",
      "guideline_refs": ["FG", "TA"],
      "environment": ["frontend"],
      "tags": ["task", "PRD:prd-ui-ux-hierarchie-tasks"],
      "estimated_hours": 2
    },
    {
      "title": "Vue Roadmap synthétique exportable",
      "slug": "prd-ui-ux-hierarchie-tasks:frontend:4",
      "type": "feature",
      "parent_task_id": "<uuid-epic>",
      "guideline_refs": ["FG", "PG", "TA"],
      "environment": ["frontend"],
      "tags": ["feature", "PRD:prd-ui-ux-hierarchie-tasks"]
    },
    {
      "title": "Tableau exportable Markdown/JSON",
      "slug": "prd-ui-ux-hierarchie-tasks:frontend:4:1",
      "type": "task",
      "parent_task_id": "<uuid-feature-4>",
      "guideline_refs": ["FG", "TA"],
      "environment": ["frontend"],
      "tags": ["task", "PRD:prd-ui-ux-hierarchie-tasks"],
      "estimated_hours": 4
    },
    {
      "title": "Modification de la hiérarchie (drag & drop)",
      "slug": "prd-ui-ux-hierarchie-tasks:frontend:5",
      "type": "feature",
      "parent_task_id": "<uuid-epic>",
      "guideline_refs": ["FG", "PG", "TA"],
      "environment": ["frontend"],
      "tags": ["feature", "PRD:prd-ui-ux-hierarchie-tasks"]
    },
    {
      "title": "Drag & drop pour changer le parent",
      "slug": "prd-ui-ux-hierarchie-tasks:frontend:5:1",
      "type": "task",
      "parent_task_id": "<uuid-feature-5>",
      "guideline_refs": ["FG", "TA"],
      "environment": ["frontend"],
      "tags": ["task", "PRD:prd-ui-ux-hierarchie-tasks"],
      "estimated_hours": 6
    },
    {
      "title": "Mise à jour automatique des slugs enfants",
      "slug": "prd-ui-ux-hierarchie-tasks:frontend:5:2",
      "type": "task",
      "parent_task_id": "<uuid-feature-5>",
      "guideline_refs": ["FG", "TA"],
      "environment": ["frontend"],
      "tags": ["task", "PRD:prd-ui-ux-hierarchie-tasks"],
      "estimated_hours": 2
    },
    {
      "title": "Améliorations ergonomiques",
      "slug": "prd-ui-ux-hierarchie-tasks:frontend:6",
      "type": "feature",
      "parent_task_id": "<uuid-epic>",
      "guideline_refs": ["FG", "PG", "TA"],
      "environment": ["frontend"],
      "tags": ["feature", "PRD:prd-ui-ux-hierarchie-tasks"]
    },
    {
      "title": "Breadcrumb, badges, info-bulles, navigation rapide",
      "slug": "prd-ui-ux-hierarchie-tasks:frontend:6:1",
      "type": "task",
      "parent_task_id": "<uuid-feature-6>",
      "guideline_refs": ["FG", "TA"],
      "environment": ["frontend"],
      "tags": ["task", "PRD:prd-ui-ux-hierarchie-tasks"],
      "estimated_hours": 4
    }
  ],
  "subtasks": [
    {
      "title": "Afficher Epic > Feature > Task > Sub-task",
      "slug": "prd-ui-ux-hierarchie-tasks:frontend:1:1:1",
      "task_id": "<uuid-task-1-1>",
      "guideline_refs": ["FG", "TA"],
      "environment": ["frontend"],
      "estimated_hours": 4
    },
    {
      "title": "Navigation parent/enfant dans l'arborescence",
      "slug": "prd-ui-ux-hierarchie-tasks:frontend:1:1:2",
      "task_id": "<uuid-task-1-1>",
      "guideline_refs": ["FG", "TA"],
      "environment": ["frontend"],
      "estimated_hours": 2
    }
  ]
}
```
