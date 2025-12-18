# PRD – Refonte UI/UX pour la gestion hiérarchique des tâches (Epic, Feature, Task)

## Objectif
Permettre aux utilisateurs de visualiser, créer, modifier et naviguer efficacement dans la hiérarchie des tâches (`epic`, `feature`, `task`) en respectant la structure métier et la traçabilité PRD.

---

## 1. User Stories

- En tant qu'utilisateur, je veux voir la structure des tâches sous forme d'arborescence pour comprendre la roadmap.
- En tant qu'utilisateur, je veux créer une feature directement depuis un epic, et une task depuis une feature.
- En tant qu'utilisateur, je veux filtrer et rechercher les tâches par type, parent, PRD, tag.
- En tant qu'utilisateur, je veux modifier la hiérarchie par drag & drop ou sélection rapide.
- En tant qu'utilisateur, je veux voir la traçabilité PRD (slugs, tags, guideline_refs) pour chaque tâche.

---

## 2. Description fonctionnelle

- Ajout d'une vue arborescente (tree view) des tâches.
- Formulaire de création/édition dynamique selon le type de tâche.
- Génération automatique des slugs/PRD slugs.
- Filtres avancés et recherche multi-critères.
- Vue "Roadmap" synthétique exportable.
- Drag & drop pour modification de la hiérarchie.

---

## 3. Critères d'acceptation (exemples)

- [ ] L'utilisateur peut visualiser la hiérarchie complète Epic > Feature > Task > Sub-task.
- [ ] La création d'une tâche propose le bon parent et génère le slug automatiquement.
- [ ] Les filtres permettent d'afficher uniquement les epics, features ou tasks.
- [ ] La vue Roadmap affiche tous les slugs, titres, types, parents, estimations, tags PRD.
- [ ] Le drag & drop met à jour le parent_task_id et les slugs enfants.

---

## 4. Contraintes

- Respect strict de la structure Supabase et du protocole TaskMaster.
- Génération des slugs conforme à la règle 20_task-breakdown.
- Accessibilité et responsivité de l'UI.

---

## 5. Plan de refonte (étapes)

1. **Ajout d'une vue arborescente (tree view) des tâches**
   - Utiliser un composant Angular Material Tree ou équivalent.
   - Afficher les badges de type, slugs, titres, estimations.
2. **Refonte du formulaire de création/édition**
   - Sélecteur de type de tâche en premier.
   - Génération automatique des slugs/PRD slugs.
   - Création contextuelle (pré-remplir le parent).
3. **Ajout de filtres avancés**
   - Filtres par type, parent, PRD, tag.
   - Recherche textuelle globale.
4. **Vue Roadmap synthétique**
   - Tableau exportable (Markdown/JSON) conforme à la règle 20_task-breakdown.
5. **Modification de la hiérarchie**
   - Drag & drop ou sélection rapide du parent.
   - Mise à jour automatique des slugs enfants.
6. **Améliorations ergonomiques**
   - Breadcrumb, badges, info-bulles, navigation rapide.

---

## 6. Synthèse

L'UI/UX actuelle ne permet pas d'exploiter pleinement la structure hiérarchique des tâches et la traçabilité PRD attendue par le métier. Une refonte ciblée, centrée sur la visualisation arborescente, la création contextuelle, la génération automatique des slugs et la traçabilité, est nécessaire pour aligner l'application avec les besoins métier et les conventions TaskMaster. 