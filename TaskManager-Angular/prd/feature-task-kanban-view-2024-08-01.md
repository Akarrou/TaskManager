# PRD : Vue Kanban des Tâches par Feature

| **Méta-information** | Détail                                |
| -------------------- | ------------------------------------- |
| **ID PRD**           | `PRD-2024-08-01-KANBAN-TASKS`         |
| **Titre**            | Vue Kanban des Tâches par Feature     |
| **Slug**             | `feature-task-kanban-view`            |
| **Auteur**           | Agent IA (via Jerome Valette)         |
| **Date de création** | 2024-08-01                            |
| **Date de MAJ**      | 2024-08-01                            |
| **Statut**           | Draft                                 |
| **Épic associée**    | `epic-kanban-interface` (à confirmer) |

---

## 1. Problème et Contexte

### 1.1. Problème Constaté

Actuellement, l'interface `epic-kanban` permet de visualiser les _features_ d'un _epic_ sous forme de tableau Kanban. Cependant, il n'existe pas de vue équivalente pour visualiser les _tâches_ associées à une _feature_ spécifique. Les tâches sont gérées dans une vue hiérarchique (arbre), ce qui ne permet pas d'avoir une vision claire et rapide de leur état d'avancement, qui est pourtant crucial pour le pilotage et le suivi quotidien.

### 1.2. Besoin Utilisateur

Les chefs de projet et les développeurs ont besoin d'une vue Kanban pour les tâches d'une feature afin de :

- Visualiser rapidement l'état d'avancement de chaque tâche.
- Faciliter le "daily stand-up".
- Identifier les blocages plus rapidement.
- Harmoniser l'expérience utilisateur avec la vue Kanban existante pour les features.

---

## 2. Objectifs et Success Metrics

### 2.1. Objectifs

1.  **Créer une vue Kanban dédiée aux tâches d'une feature.**
2.  **Réutiliser au maximum les composants existants** de la vue `epic-kanban`.
3.  Permettre le **glisser-déposer (Drag and Drop)** des tâches entre les colonnes pour changer leur statut.
4.  Assurer que la vue soit accessible depuis la vue `epic-kanban`.

### 2.2. Indicateurs de Succès (KPIs)

- **Taux d'adoption** : % d'utilisateurs actifs utilisant la nouvelle vue dans les 30 jours.
- **Feedback utilisateur** : Score de satisfaction (CSAT) de 4/5 ou plus.

---

## 3. Scope de la Fonctionnalité

### 3.1. Inclus (In-Scope)

- Affichage des tâches d'une feature dans un Kanban à 3 colonnes : "À faire" (`pending`), "En cours" (`in_progress`), "Terminé" (`done`).
- Réutilisation du composant `kanban-column` et adaptation de `feature-card` en `task-card`.
- Mise à jour du statut de la tâche en base de données lors du glisser-déposer.
- Un point d'entrée sur la `feature-card` pour naviguer vers cette vue Kanban.
- Le titre de la feature parente est visible sur la vue.

### 3.2. Exclu (Out-of-Scope)

- Création/édition/suppression de tâches depuis cette vue.
- Filtres avancés (par assigné, tag, etc.) dans cette V1.
- Gestion des sous-tâches dans cette vue.

---

## 4. User Stories & Scénarios

### 4.1. User Stories

- **En tant que Développeur,** je veux voir les tâches d'une feature dans un Kanban pour connaître mes priorités et mettre à jour facilement leur statut.
- **En tant que Chef de Projet,** je veux une vue d'ensemble de l'avancement des tâches d'une feature pour suivre le progrès.

### 4.2. Critères d'Acceptation (Gherkin)

```gherkin
Feature: Vue Kanban des tâches d'une feature

  Scenario: Accéder et visualiser la vue Kanban des tâches
    Given je suis sur la vue Kanban de l'epic
    When je clique sur une icône "Voir les tâches" sur une carte de feature
    Then je suis redirigé vers une vue Kanban affichant les tâches de cette feature
    And la colonne "À faire" contient les tâches avec le statut "pending"

  Scenario: Changer le statut d'une tâche via Drag and Drop
    Given la tâche "Créer le template HTML" est dans la colonne "À faire"
    When je glisse et dépose cette tâche dans la colonne "En cours"
    Then la tâche apparaît dans la colonne "En cours"
    And son statut en base de données est mis à jour à "in_progress"
```

---

## 5. Exigences Techniques et Hypothèses

### 5.1. Exigences fonctionnelles

- **FR-01** : Le système DOIT afficher une vue Kanban pour les tâches d'une feature.
- **FR-02** : La vue DOIT contenir des colonnes basées sur les statuts de tâche (`pending`, `in_progress`, `done`).
- **FR-03** : Le système DOIT permettre le Drag & Drop d'une tâche pour changer son statut.
- **FR-04** : Le changement de colonne DOIT persister le nouveau statut en base de données.

### 5.2. Réutilisation des composants

- La structure du composant `epic-kanban` sera la base.
- Le composant `kanban-column` sera réutilisé.
- Le composant `feature-card` sera adapté en `task-card`.
- Un nouveau service `feature-kanban.service.ts` sera créé en s'inspirant de `epic-kanban.service.ts`.

### 5.3. Structure des données

- L'analyse confirme que les modèles `Feature` et `Task` sont similaires et permettent la réutilisation.
- **Feature Model**: `id: string`, `name: string`, `status: 'todo' | 'inprogress' | 'inreview' | 'done'`
- **Task Model**: `id: number`, `title: string`, `status: 'pending' | 'in_progress' | 'done'`
- Un adaptateur simple sera nécessaire pour gérer la différence de propriété (`name` vs `title`).

### 5.4. Routage

- Une nouvelle route sera créée : `/features/:featureId/tasks-kanban`.

---

## 6. Risques

- **Risque (Moyen)** : La logique de Drag and Drop nécessite des ajustements plus complexes que prévu.
  - _Mitigation_ : Isoler la logique dans un PoC rapide.

---

## 7. Validation

| Rôle          | Nom            | Date | Signature / OK |
| ------------- | -------------- | ---- | -------------- |
| Product Owner | Jerome Valette |      |                |
| Tech Lead     | Agent IA       |      |                |
