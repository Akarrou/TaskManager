# 2. Documentation Frontend

## 🎯 Objectif

L'application frontend est le point d'interaction principal pour les utilisateurs. Elle leur permet de visualiser, créer, et gérer leurs tâches et projets de manière interactive.

## 🛠️ Stack Technique Spécifique

- **Framework Principal:** Angular 20 (avec Server-Side Rendering)
- **Librairie de Composants UI:** Angular Material & Tailwind CSS
- **Gestion d'état (State Management):** NgRx (avec Store, Effects, Reducers, et Selectors)
- **Tests:** Karma/Jasmine pour les tests unitaires.

## 🏗️ Structure des Dossiers Clés

- `src/app/core/`: Services transverses (Auth, Supabase), Guards, etc.
- `src/app/features/`: Modules fonctionnels principaux (ex: `tasks`, `dashboard`).
- `src/app/shared/`: Composants et utilitaires réutilisables.
- `src/app/store/`: Fichiers NgRx pour la gestion de l'état global.

## 🤖 Contexte pour l'IA

- Toujours créer les composants en mode `standalone`.
- Utiliser le store NgRx comme unique source de vérité (`Single Source of Truth`). Les composants ne doivent pas détenir d'état local complexe.
- Les appels à l'API Supabase doivent être gérés exclusivement via les `Effects` de NgRx.
