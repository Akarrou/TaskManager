# Claude Code - Règles et Conventions TaskManager

## 🎯 Rôle & Contexte

Ce fichier adapte les règles Cursor existantes pour Claude Code, définissant les conventions, patterns et bonnes pratiques pour le développement du projet TaskManager.

---

## 📐 Architecture du Projet

### Structure du Projet
```text
TaskManager-Angular/
  src/
    app/
      core/
        guards/                   # Guards de route (ex: AuthGuard)
        services/                 # Services Core (AuthService, SupabaseService, etc.)
      features/                   # Modules fonctionnels (Feature Modules)
        auth/                     # Authentification (login, etc.)
        dashboard/                # Dashboard principal
        projects/                 # Gestion des projets
        tasks/                    # Gestion des tâches (création, édition, vue)
          task-form/
          task-tree/
      shared/
        components/               # Composants partagés et réutilisables (UI)
          confirm-dialog/
          generic-kanban/
          header-nav/
          kanban-card/
        models/                   # Modèles de données partagés
        pipes/                    # Pipes partagés
        store/                    # Logique NGRX (si partagée)
      store/                      # Configuration principale du store NGRX
        reducers/
      assets/
        images/
      environments/               # Fichiers d'environnement (dev, prod)
      styles/                     # Styles globaux (variables, mixins SCSS)
```

### Patterns Structurels
- **Organisation par fonctionnalités** : Code organisé en modules basés sur les fonctionnalités métier
- **`core` vs `shared`** :
  - `core/` : Services singletons instanciés une seule fois
  - `shared/` : Composants, pipes, directives réutilisables
- **Gestion d'état NgRx** : Chaque feature a son propre slice de state
- **Convention de nommage** : kebab-case pour fichiers, PascalCase pour classes

---

## 🛠️ Stack Technique

- **Framework Frontend** : Angular
- **UI Components** : Angular Material
- **Styling** : Tailwind CSS
- **State Management** : NgRx
- **Backend-as-a-Service** : Supabase
- **Gestionnaire de paquets** : pnpm
- **Version Node** : 22.16.0 (via NVM)

---

## 📝 Conventions de Développement

### Composants
- **Toujours `standalone: true`**
- **Structure de fichiers séparés obligatoire** : `.ts`, `.html`, `.scss`
- **Interdiction** d'utiliser `template:` ou `styles:` en ligne
- Nom de fichier en `kebab-case.component.ts`

### TypeScript
- `strict mode` **obligatoire**
- **Interdiction stricte** du type `any`
- Utiliser `inject()` pour l'injection de dépendances
- Ordre des imports : Angular > RxJS > Libs externes > Libs du projet > Relatifs

### Styles
- **Tailwind CSS** en priorité
- **Angular Material** pour composants de base (apparence `outline` pour `mat-form-field`)
- **Jamais** de manipulation DOM directe avec `ElementRef`

---

## 🔄 Patterns de Référence

### Formulaires (CRUD)
- **Modèle** : `task-form` (`/src/app/features/tasks/task-form/`)
- Utiliser `ReactiveFormsModule` avec `FormControl` typés
- Validation avec `Validators`
- État `isLoading` pour désactiver pendant soumission

### Communication Supabase
- **Service dédié** pour chaque table
- **Jamais** d'appel direct `supabase.from(...)` depuis composant
- Utiliser types générés Supabase
- Gestion d'erreurs prévisible dans services

### NgRx
- **Modèle** : `projects` store (`/src/app/features/projects/store/`)
- Chaque feature a son slice (actions, reducer, selectors, effects)
- Effets responsables communication avec services
- Composants interagissent uniquement avec store

---

## 🚦 Workflow & Quality Gates

### Git & Commits
- **Messages en anglais** : Format `feat:`, `fix:`, etc.
- Strategy feature branches + PR vers `main`
- Revues de code systématiques

### Quality Gates
- Respect principes SOLID
- Structure conforme architecture Angular
- Nommage conforme (kebab-case, PascalCase)
- Couverture tests unitaires composants/services critiques
- Conformité stricte guidelines techniques

### Checklist Nouveau Composant
- [ ] Composant non disponible dans `shared/components`
- [ ] Nommage en `kebab-case`
- [ ] `standalone: true`
- [ ] Fichiers séparés (`.html`, `.scss`)
- [ ] `@Input()` traités comme immuables

---

## 📋 Workflow Séquentiel

### Nouvelle Fonctionnalité
1. **PRD** : Générer document PRD structuré
2. **Validation** : Validation explicite utilisateur
3. **Enregistrement** : Sauvegarder dans `/PRD/` format `<slug>-YYYY-MM-DD.md`
4. **Breakdown** : Découper en epics/features/tasks/sub-tasks
5. **Supabase** : Enregistrer tâches dans base Supabase (source de vérité)

### Réalisation Tâche
1. **Orchestrateur** : Vérifier existence PRP
2. **Plan technique** : Générer plan détaillé
3. **Validation** : Validation avant implémentation
4. **Traçabilité** : Lien tâche Supabase ↔ PRP ↔ plan

---

## 🧠 Philosophie Développement

### Approche Cognitive
1. **Réflexion Préalable** : Comprendre besoins et implications
2. **Consultation Mémoire** : Rechercher solutions/patterns antérieurs
3. **Synthèse Conceptuelle** : Construire solution optimale
4. **Validation Architecturale** : Vérifier cohérence écosystème

### Comportements Requis
- **Toujours commencer par réflexion**
- **Consulter systématiquement mémoire**
- **Optimiser conceptuellement avant implémenter**
- **Maintenir continuité évolutive**

### Comportements Interdits
- **Développer sans réflexion**
- **Ignorer expérience acquise**
- **Créer sans cohérence**
- **Répéter erreurs passées**

---

## 📊 Conventions Spécifiques

### Définitions
- **PRD** : Product Requirements Document
- **Epic** : Macro-fonctionnalité
- **Feature** : Fonctionnalité métier
- **Task** : Action technique/métier
- **Sub-task** : Action atomique
- **Slug** : Identifiant unique kebab-case

### Formats
- **YAML** : Mémoire long terme
- **JSON** : TaskPlan
- **Markdown** : Tableaux traçabilité
- **Gherkin** : Critères acceptation

### Slugs
- Format : kebab-case sans accents
- Branch : `prd/<slug>`
- Commit : `PRD:<slug>` | `feat:<slug>`

---

## 🔧 Mode Dégradé Supabase

### Stratégie Fallback
1. **Test connectivité** : Appel simple avant opération
2. **Fallback immédiat** : Basculer vers mode dégradé si échec
3. **Notification utilisateur** : Informer du mode dégradé

### Mode Dégradé
- Enregistrer JSON dans `@/PRD/tasks-cache/<timestamp>_tasks.json`
- Créer `@/PRD/tasks-cache/sync-pending.log`
- Continuer workflow sans bloquer
- Afficher warning mode dégradé

### Récupération
1. Lire fichiers cache JSON
2. Synchroniser par ordre chronologique
3. Nettoyer cache après succès
4. Confirmer à utilisateur

---

## 📚 Références

- Langue principale code : **Anglais**
- Messages commit : **Anglais**
- Communication : **Français**
- Architecture détaillée : Voir fichiers `.cursor/rules/`