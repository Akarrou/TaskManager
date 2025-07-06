# 🧪 Suite de Tests des Règles AgroFlow

## 🎯 Objectif

Valider la logique, la cohérence et la non-régression du système de règles AgroFlow. Ce document sert de "cahier de tests" à exécuter manuellement après toute modification significative d'une règle.

---

## 🏗️ Scénarios de Test

### Test Case #1 : Workflow Nominal (Golden Path)

- **ID**: `WT-001`
- **Scénario**: `PRD` → `Tâches` → `PRP` → `Plan` → `Exécution`.
- **Résultat Attendu**: Le workflow se déroule sans erreur, chaque règle étant appelée dans le bon ordre.

### Test Case #2 : Workflow "Fast Track" pour tâche triviale

- **ID**: `WT-002`
- **Scénario**: Une tâche marquée `trivial` est exécutée.
- **Résultat Attendu**: L'orchestrateur saute l'étape de génération de PRP (`25_prp-builder`).

### Test Case #3 : Fallback MCP Supabase

- **ID**: `CI-001`
- **Scénario**: Une règle tente d'accéder à Supabase alors que le service est indisponible.
- **Résultat Attendu**: Le workflow continue en mode dégradé en utilisant le cache local (`@/PRD/tasks-cache/`).

### Test Case #4 : Validation Anti-Doublon

- **ID**: `DV-001`
- **Scénario**: Tentative de création d'un PRD qui existe déjà.
- **Résultat Attendu**: La création est bloquée et l'agent propose de modifier le PRD existant.

### Test Case #5 : Boucle d'Auto-Correction

- **ID**: `CE-001`
- **Scénario**: `40_code-executor` reçoit un plan contenant une erreur de code qui viole une règle de linting.
- **Résultat Attendu**: L'agent corrige l'erreur de manière autonome et la validation finit par passer.

---

## 🚀 Exécution de la Suite de Tests

- **Fréquence**: Manuelle, après chaque modification d'une règle `.mdc`.
- **Runner**: L'ingénieur IA.
- **Rapport**: Un tableau Markdown simple avec le statut (✅ Pass | ❌ Fail) de chaque test case.
