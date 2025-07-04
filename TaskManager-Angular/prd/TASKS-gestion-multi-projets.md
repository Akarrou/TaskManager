# Plan d'Implémentation : Gestion Multi-Projets

Ce document détaille les tâches techniques nécessaires pour implémenter la fonctionnalité de gestion multi-projets, comme défini dans le PRD `prd-gestion-multi-projets-2024-07-31.md`.

## Epic: Gestion des Projets

### Feature: Backend & Données (Supabase)

- **Task 1**: [BDD] Créer la table `projects` dans Supabase.
  - **Sub-task 1.1**: Définir le schéma SQL pour la table `projects`.
  - **Sub-task 1.2**: Appliquer le schéma à la base de données.
- **Task 2**: [BDD] Mettre à jour la table `epics`.
  - **Sub-task 2.1**: Ajouter la colonne `project_id` à la table `epics`.
  - **Sub-task 2.2**: Créer un script de migration pour affecter un projet par défaut aux `epics` existants.

### Feature: Logique d'accès aux données (Frontend)

- **Task 3**: [State] Implémenter le store NgRx pour les projets.
  - **Sub-task 3.1**: Définir les `actions` (loadProjects, loadProjectsSuccess, selectProject).
  - **Sub-task 3.2**: Implémenter le `reducer` pour gérer l'état des projets.
  - **Sub-task 3.3**: Créer les `selectors` pour accéder aux données des projets.
- **Task 4**: [Service] Créer le `ProjectService`.
  - **Sub-task 4.1**: Implémenter la méthode `getProjects()` pour charger les projets depuis Supabase.
- **Task 5**: [State] Créer les `effects` NgRx.
  - **Sub-task 5.1**: Créer l'effet qui appelle `projectService.getProjects()` en réponse à l'action `loadProjects`.
- **Task 6**: [Service] Mettre à jour les services existants.
  - **Sub-task 6.1**: Modifier `EpicKanbanService` pour filtrer les epics par `project_id`.
  - **Sub-task 6.2**: Modifier `TaskService` pour filtrer les tâches en fonction du projet.

### Feature: Interface Utilisateur (UI)

- **Task 7**: [Component] Implémenter `project-list.component`.
  - **Sub-task 7.1**: Afficher la liste des projets depuis le store NgRx.
  - **Sub-task 7.2**: Ajouter un bouton pour naviguer vers le formulaire de création.
- **Task 8**: [Component] Implémenter `project-form.component`.
  - **Sub-task 8.1**: Créer le formulaire (réactif) pour le nom et la description du projet.
  - **Sub-task 8.2**: Implémenter la logique de sauvegarde qui appellera le `ProjectService`.
- **Task 9**: [Component] Implémenter `project-selector.component`.
  - **Sub-task 9.1**: Afficher un menu déroulant avec la liste des projets depuis le store.
  - **Sub-task 9.2**: Dispatcher l'action `selectProject` quand l'utilisateur change de sélection.
- **Task 10**: [Integration] Intégrer le sélecteur de projet.
  - **Sub-task 10.1**: Ajouter le composant `app-project-selector` dans le `header-nav.component.html`.

### Feature: Routage & Configuration

- **Task 11**: [Routing] Mettre à jour le routage.
  - **Sub-task 11.1**: Ajouter la route `/projects` qui charge `ProjectListComponent`.
  - **Sub-task 11.2**: Ajouter la route `/projects/new` pour le formulaire de création.
  - **Sub-task 11.3**: (Optionnel V2) Préfixer les routes existantes avec `/:projectId`.
- **Task 12**: [App-Module] Enregistrer le nouveau store NgRx.
  - **Sub-task 12.1**: Ajouter `ProjectState` à la configuration globale du store.
