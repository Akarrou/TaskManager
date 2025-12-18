# 2. Documentation Frontend

## 🎯 Objectif

Le frontend est le cœur de l'application TaskManager. Il fournit l'interface utilisateur complète pour que les utilisateurs puissent interagir avec leurs projets et leurs tâches. Il est responsable de l'affichage des tableaux Kanban, de la création/édition des tâches, de l'authentification des utilisateurs et de la communication avec le backend Supabase.

## 🛠️ Stack Technique Spécifique

- **Framework Principal:** Angular
- **Librairie de Composants UI:** Angular Material & Tailwind CSS
- **Gestion d'état (State Management):** NgRx (Actions, Reducers, Effects, Selectors)
- **Tests:** Karma, Jasmine

## 🏗️ Structure des Dossiers Clés

La structure du projet est détaillée dans la règle d'architecture, mais voici les points clés :

- `src/app/core/`: Contient les services singletons et les guards (ex: `AuthService`).
- `src/app/features/`: Contient les modules fonctionnels, chacun avec ses propres composants, services et logique de store (ex: `tasks`, `projects`).
- `src/app/shared/`: Contient les composants, pipes et modèles réutilisables à travers l'application.

## 🤖 Contexte pour l'IA

- Toujours créer les composants en mode `standalone: true`.
- Utiliser `inject()` pour l'injection de dépendances.
- Toute interaction avec Supabase doit passer par un service dédié (ex: `TaskService`), jamais d'appel direct depuis un composant.
- La gestion de l'état doit se faire via NgRx. Les composants doivent dispatcher des actions et sélectionner des données du store.
