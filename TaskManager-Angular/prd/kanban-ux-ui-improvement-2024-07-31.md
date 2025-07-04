### **PRD : Amélioration UX/UI du Kanban**

| **Propriété** | **Valeur**                                                           |
| :------------ | :------------------------------------------------------------------- |
| **ID**        | `PRD-KANBAN-UXUI-01`                                                 |
| **Titre**     | Amélioration de l'Expérience Utilisateur et de l'Interface du Kanban |
| **Slug**      | `kanban-ux-ui-improvement`                                           |
| **Auteur**    | AI Assistant                                                         |
| **Statut**    | `Validé`                                                             |
| **Date**      | `2024-07-31`                                                         |

#### **1. Contexte & Problème**

L'analyse interactive de la vue Kanban a révélé plusieurs points de friction :

- **Incohérence Visuelle** : Le design actuel du Kanban est sobre et fonctionnel, mais il est visuellement déconnecté du reste de l'application, qui utilise une charte graphique plus moderne. Les couleurs ne sont pas exploitées pour transmettre des informations (statut, priorité).
- **Manque d'Affordance** : De nombreuses icônes d'action ne disposent pas d'infobulles (tooltips), ce qui oblige l'utilisateur à deviner leur fonction. Le tooltip de l'icône "loupe" (recherche de sous-tâches) est cassé.
- **Feedback du Drag & Drop** : La fonctionnalité de glisser-déposer est opérationnelle mais pourrait être améliorée en fournissant un retour visuel plus clair à l'utilisateur pendant l'action.

#### **2. Objectifs & KPIs**

- **Objectifs Principaux**

  1.  **Harmoniser l'UI** du Kanban avec la charte graphique globale de l'application.
  2.  **Améliorer la lisibilité** en utilisant des codes couleurs pour les statuts et priorités.
  3.  **Corriger tous les tooltips** manquants ou défectueux pour améliorer l'ergonomie.
  4.  **Fluidifier le Drag & Drop** avec un meilleur feedback visuel.

- **KPIs (Indicateurs de succès)**
  - **Qualitatif** : Feedback utilisateur positif concernant la clarté et l'esthétique du Kanban.
  - **Quantitatif** : Réduction du temps nécessaire pour identifier le statut/la priorité d'une tâche.

#### **3. User Stories & Critères d'Acceptation**

| ID       | User Story                                                                                                                                                                                 | Critères d'Acceptation (Gherkin)                                                                                                                                                                                                                                                                          |
| :------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **US-1** | En tant qu'utilisateur, je veux que les cartes et colonnes du Kanban utilisent des couleurs cohérentes avec le reste de l'application pour une expérience visuelle unifiée et informative. | `Scenario: Visualiser les statuts par couleur`<br/> `Given je suis sur la vue Kanban`<br/> `When je regarde une colonne (ex: "En cours")`<br/> `Then la colonne a une couleur de fond distincte`<br/> `And les cartes affichent une couleur ou un indicateur visuel basé sur leur statut et/ou priorité.` |
| **US-2** | En tant qu'utilisateur, je veux voir des infobulles claires lorsque je survole n'importe quelle icône d'action pour comprendre immédiatement sa fonction.                                  | `Scenario: Comprendre une icône d'action`<br/> `Given je suis sur la vue Kanban`<br/> `When je survole l'icône "éditer" (crayon) sur une carte`<br/> `Then une infobulle "Modifier la tâche" apparaît.`<br/> `And ce comportement s'applique à toutes les icônes (supprimer, voir détails, ajouter...).`  |
| **US-3** | En tant qu'utilisateur, lorsque je glisse-dépose une carte, je veux un retour visuel clair pour savoir que mon action est prise en compte et où je peux la déposer.                        | `Scenario: Déplacer une carte`<br/> `Given je suis sur la vue Kanban`<br/> `When je commence à glisser une carte`<br/> `Then la carte que je déplace a un style visuel distinct (ombre, rotation)`<br/> `And un espace réservé (placeholder) apparaît dans les colonnes où je peux la déposer.`           |

#### **4. Périmètre & Exclusions**

- **Inclus :**

  - Refonte CSS des composants du Kanban (`kanban-column`, `feature-card`, etc.).
  - Application de la charte graphique (variables CSS/Tailwind) aux éléments.
  - Implémentation ou correction des `matTooltip` sur toutes les icônes interactives.
  - Amélioration du style visuel du `CdkDrag` (preview, placeholder).

- **Exclus :**
  - Toute nouvelle fonctionnalité (ex: filtres, recherche avancée).
  - Modification de la logique métier ou des services backend.
  - Modification de la structure des données.

#### **5. Contraintes Techniques**

- Utiliser les composants `Angular Material` et le `CDK`.
- Respecter la configuration `Tailwind CSS` existante.
- Ne pas introduire de nouvelles dépendances lourdes.

---
