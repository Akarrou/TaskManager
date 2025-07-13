# PRD: Refonte UX/UI globale et Dashboard d'Epics

- **Version**: 1.0
- **Statut**: Proposition
- **Date**: 2024-08-02
- **Auteur**: Jerome Valette (via Agent IA)
- **Slug**: refonte-ux-ui-globale-et-dashboard-epics

---

## 1. Contexte et Problème

L'application TaskManager actuelle, bien que fonctionnelle, présente des opportunités d'amélioration significatives en termes d'expérience utilisateur (UX) et d'interface (UI). La navigation peut être améliorée, et le tableau de bord initial ne fournit pas une vue d'ensemble stratégique centrée sur les initiatives majeures (Epics).

**Problèmes identifiés :**

- Le Dashboard actuel est trop orienté "tâches" et ne donne pas de vision macro.
- La navigation entre les différentes vues (Dashboard, Kanban Epics, Kanban Features) n'est pas fluide.
- L'identité visuelle de l'application manque de cohérence et de modernité.

## 2. Objectifs (Goals)

1.  **Améliorer la Vision Stratégique** : Fournir aux utilisateurs un tableau de bord clair listant les Epics pour une meilleure prise de décision.
2.  **Fluidifier la Navigation** : Simplifier les déplacements entre les pages clés de l'application.
3.  **Moderniser l'Interface** : Appliquer une refonte visuelle cohérente sur l'ensemble de l'application pour améliorer l'attrait et l'ergonomie.

## 3. Personas Cibles

- **Chefs de projet** : Ont besoin d'une vue d'ensemble des Epics pour suivre l'avancement global.
- **Développeurs / Membres d'équipe** : Ont besoin d'une navigation efficace pour passer rapidement de la vue d'ensemble aux tâches spécifiques.

## 4. User Stories / Scénarios

- **En tant que Chef de projet**, je veux voir la liste de tous les Epics sur le Dashboard pour rapidement évaluer l'état d'avancement de mes projets.
- **En tant que développeur**, lorsque je suis sur une vue Kanban (Epic ou Feature), je veux des boutons clairs pour revenir au Dashboard ou naviguer vers d'autres vues pertinentes sans avoir à utiliser le menu principal.
- **En tant qu'utilisateur**, je veux une interface visuellement agréable et cohérente sur toutes les pages de l'application.

## 5. Spécifications Fonctionnelles

### 5.1. Dashboard des Epics

- La page Dashboard (`/dashboard`) doit être modifiée pour ne plus afficher la liste de toutes les tâches.
- Elle doit afficher une liste des "Epics".
- Chaque élément de la liste doit afficher au minimum :
  - Le titre de l'Epic.
  - Une statistique clé (ex: % d'avancement basé sur les tâches enfants).
  - Un indicateur de statut (ex: À faire, En cours, Terminé).
- Un clic sur un Epic dans la liste doit rediriger vers la vue Kanban de cet Epic.
- Le bouton flottant "Ajouter une nouvelle tâche" sera réévalué. Peut-être qu'il devrait être "Ajouter un nouvel Epic".

### 5.2. Navigation sur les Vues Kanban

- Sur la page **Kanban des Epics** (`/epic-kanban`):
  - Ajouter un bouton "Retour au Dashboard".
  - Le bouton doit être clairement visible.
- Sur la page **Kanban des Features** (`/feature-kanban`):
  - Ajouter un bouton "Retour au Kanban des Epics".
  - Ajouter un bouton "Retour au Dashboard".

### 5.3. Refonte Visuelle Globale

Cet objectif est plus large et sera décomposé en tâches spécifiques, mais les principes directeurs sont :

- **Palette de couleurs** : Définir et appliquer une nouvelle palette de couleurs harmonieuse.
- **Typographie** : Standardiser les polices et les tailles de caractères pour une meilleure lisibilité.
- **Composants** : Revoir le style des composants récurrents (boutons, cartes, modales) pour assurer la cohérence.
- **Espacement et mise en page** : Utiliser une grille et des espacements cohérents pour une mise en page aérée et structurée.

## 6. Critères de Succès (KPIs)

- **Réduction du temps de navigation** : Le temps pour passer du Dashboard à une tâche spécifique devrait diminuer.
- **Augmentation de l'utilisation du Dashboard** : Le nouveau Dashboard devrait devenir la page de référence pour les sessions utilisateurs.
- **Feedback qualitatif** : Obtenir des retours positifs des utilisateurs concernant la nouvelle interface.

## 7. Hors-Périmètre (Non-Goals)

- La modification de la logique métier de gestion des tâches.
- L'ajout de nouvelles fonctionnalités non liées à la refonte visuelle et à la navigation.
- La migration des données existantes (la structure des données reste inchangée).

---
