# PRD : Gestion Multi-Projets

- **Date** : 2024-07-31
- **Auteur** : IA
- **Slug** : `gestion-multi-projets`
- **Statut** : Validé

## 1. Vision & Problème à résoudre

### Vision

Faire d'AgroFlow Task Manager une plateforme capable de gérer plusieurs contextes de travail (projets) de manière isolée et intuitive. L'utilisateur doit pouvoir naviguer fluidement entre ses différents projets sans friction.

### Problème

Actuellement, l'application fonctionne comme un conteneur unique pour toutes les données (Epics, tâches). Cela empêche les équipes ou les utilisateurs de segmenter leur travail, ce qui mène à une surcharge d'informations, un manque de clarté et une difficulté à gérer plusieurs initiatives en parallèle.

## 2. Objectifs SMART & KPIs

| Objectif                                                                                   | Type        | KPI(s) Associés                                                                 | Échéance    |
| ------------------------------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------- | ----------- |
| Permettre aux utilisateurs de créer, voir et sélectionner des projets distincts.           | Fonctionnel | 100% des nouveaux projets sont créés via l'UI.                                  | Version 1.0 |
| Isoler les données (Epics, tâches) par projet pour n'afficher que le contexte sélectionné. | Fonctionnel | Le dashboard et la vue Kanban n'affichent que les données du projet actif.      | Version 1.0 |
| Assurer une migration transparente des données existantes vers un projet par défaut.       | Technique   | 100% des Epics existants sont rattachés au "Projet par défaut" après migration. | Version 1.0 |
| Le temps de bascule entre deux projets doit être inférieur à 500ms.                        | Performance | Temps de chargement des données après sélection d'un projet.                    | Version 1.0 |

## 3. User Stories

| En tant que... (Rôle) | Je veux... (Action)                                         | Afin de... (Bénéfice)                                                   | Priorité |
| --------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------- | -------- |
| Chef de Projet        | Créer un nouveau projet avec un nom et une description.     | Isoler les initiatives et les équipes.                                  | Haute    |
| Développeur           | Sélectionner un projet actif depuis un menu dans le header. | Ne voir que les Epics et les tâches pertinents pour mon travail actuel. | Haute    |
| Utilisateur           | Voir la liste de tous les projets auxquels j'ai accès.      | Avoir une vue d'ensemble de mes périmètres d'activité.                  | Moyenne  |
| Administrateur        | Associer les Epics existants à un projet par défaut.        | Assurer la cohérence des données après la mise à jour.                  | Haute    |

## 4. Spécifications Fonctionnelles

### 4.1. Modèle de Données (Supabase)

- **Nouvelle Table : `projects`**
  - `id` (uuid, pk)
  - `name` (text, not null)
  - `description` (text)
  - `created_at` (timestampz)
  - `organization_id` (uuid, fk vers `organizations`)
- **Modification Table : `epics`**
  - Ajouter la colonne `project_id` (uuid, fk vers `projects`, not null).

### 4.2. Logique Frontend (Angular)

- **Nouvelle Feature `projects`** (`/src/app/features/projects`)
  - **Composants**:
    - `project-list.component.ts`: Affiche la liste des projets. Route : `/projects`.
    - `project-form.component.ts`: Formulaire pour créer/éditer un projet.
    - `project-selector.component.ts`: Composant réutilisable (dans le `header-nav`) pour afficher le projet actif et permettre la sélection.
  - **Store NgRx (`ProjectState`)**:
    - Actions: `loadProjects`, `selectProject`.
    - Selectors: `selectAllProjects`, `selectActiveProject`.
    - Effects: Pour charger les projets depuis Supabase.
- **Mise à jour des services existants**:
  - `EpicKanbanService`, `TaskService` etc. devront inclure le `project_id` du projet actif dans leurs requêtes à Supabase pour filtrer les données.

## 5. Spécifications Non-Fonctionnelles

- **Performance**: Le changement de projet via le sélecteur doit déclencher un rechargement des données contextuelles en moins de 500ms.
- **Sécurité**: Pour la V1, les permissions sont simples : un utilisateur peut voir tous les projets de son organisation. La création de projet est ouverte à tous les membres.
- **Migration**: Un script de migration unique sera nécessaire pour affecter un `project_id` par défaut à tous les `epics` existants.

## 6. Dépendances & Risques

| ID  | Risque                        | Probabilité | Impact | Plan de Mitigation                                                                        |
| --- | ----------------------------- | ----------- | ------ | ----------------------------------------------------------------------------------------- |
| R1  | Migration des données échoue. | Faible      | Haut   | Créer et tester le script sur un environnement de staging avant de l'appliquer en prod.   |
| R2  | Régression sur les vues.      | Moyenne     | Haut   | Tests unitaires et e2e pour valider que le filtrage par projet est bien appliqué partout. |

## 7. Critères d'Acceptation (Gherkin)

```gherkin
Feature: Gestion multi-projets

  Scenario: Création d'un nouveau projet
    Given je suis connecté et sur la page de liste des projets
    When je clique sur "Nouveau Projet", que je saisis le nom "Projet Alpha" et que je valide
    Then le "Projet Alpha" doit apparaître dans la liste des projets.

  Scenario: Sélection d'un projet actif
    Given je suis connecté et le "Projet Alpha" est actif
    When je sélectionne "Projet Bêta" dans le menu des projets
    Then le nom du projet actif dans le header devient "Projet Bêta"
    And le tableau de bord est mis à jour pour n'afficher que les données du "Projet Bêta".
```
