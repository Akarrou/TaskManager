# Résumé des Corrections de Suppression en CASCADE

**Date** : 2025-12-12
**Migrations appliquées** :
- `20251212160000_fix_cascade_deletion_issues.sql`
- `20251212170000_remove_permissive_rls_policies.sql`

---

## 📋 Problèmes Corrigés

### ✅ Problème #1 : Suppression du propriétaire détruit tout le projet

**Avant** :
```sql
ALTER TABLE projects
ADD COLUMN owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
```
- **Impact** : Si un propriétaire supprimait son compte, **tous ses projets disparaissaient** avec toutes les tâches, membres et invitations.

**Après** :
```sql
ALTER TABLE projects
ADD CONSTRAINT projects_owner_id_fkey
FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL;
```
- **Impact** : Le projet reste avec `owner_id = NULL` et peut être réassigné manuellement.

---

### ✅ Problème #2 : Documents orphelins lors de suppression de projet

**Avant** :
```sql
ALTER TABLE documents
ADD COLUMN project_id uuid REFERENCES projects(id) ON DELETE SET NULL;
```
- **Impact** : Les documents restaient avec `project_id = NULL`, s'accumulant dans la base.

**Après** :
```sql
ALTER TABLE documents
ADD CONSTRAINT documents_project_id_fkey
FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
```
- **Impact** : Les documents sont automatiquement supprimés avec le projet (cohérence avec les tâches).

---

### ✅ Problème #3 : Documents ↔ Lignes de BDD non synchronisés

**Avant** :
- Aucun mécanisme de CASCADE entre documents et lignes de bases de données
- Suppression document → Ligne orpheline dans `database_<uuid>`
- Suppression ligne → Document orphelin avec `database_row_id` invalide

**Après** :

**1. Trigger automatique** `cleanup_database_row_on_document_delete` :
```sql
CREATE TRIGGER cleanup_database_row_on_document_delete_trigger
BEFORE DELETE ON documents
FOR EACH ROW
EXECUTE FUNCTION cleanup_database_row_on_document_delete();
```
- **Action** : Quand un document est supprimé, sa ligne correspondante dans `database_<uuid>` est automatiquement supprimée.

**2. Fonction de nettoyage périodique** `cleanup_orphaned_database_documents()` :
```sql
SELECT * FROM cleanup_orphaned_database_documents();
```
- **Action** : Supprime les documents pointant vers des lignes inexistantes et signale les lignes orphelines.
- **Utilisation** : À exécuter périodiquement (ex: tâche cron hebdomadaire).

---

### ✅ Problème #4 : Politiques RLS trop permissives

**Avant** :
```sql
-- Toute personne authentifiée pouvait voir les relations
CREATE POLICY "Users can view all document-task relations"
ON document_task_relations FOR SELECT USING (true);
```

**Après** :
```sql
-- Seuls les propriétaires de documents peuvent voir leurs relations
CREATE POLICY "Users can view own document task relations"
ON document_task_relations FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM documents d
    WHERE d.id = document_id AND d.user_id = auth.uid()
  )
);
```
- **Impact** : Les relations (task relations, databases) ne sont visibles que par le propriétaire du document.

---

## 🔍 Vérifications Effectuées

### Contraintes de clés étrangères

```sql
SELECT constraint_name, table_name, column_name, delete_rule
FROM information_schema.referential_constraints rc
JOIN information_schema.key_column_usage kcu ON rc.constraint_name = kcu.constraint_name
WHERE table_name IN ('projects', 'documents');
```

**Résultats** :
- ✅ `projects.owner_id` → `ON DELETE SET NULL`
- ✅ `documents.project_id` → `ON DELETE CASCADE`

### Triggers actifs

```sql
SELECT trigger_name, event_manipulation
FROM information_schema.triggers
WHERE event_object_table = 'documents';
```

**Résultats** :
- ✅ `cleanup_database_row_on_document_delete_trigger` → DELETE

### Politiques RLS

```sql
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('document_task_relations', 'document_databases');
```

**Résultats** : 8 politiques strictes basées sur la propriété du document (4 par table : SELECT, INSERT, UPDATE, DELETE).

---

## 📊 Nouveaux Comportements

### Suppression d'un propriétaire de projet

**Avant** : 🔴 Tout le projet est perdu
**Après** : ✅ Projet préservé avec `owner_id = NULL` (nécessite réassignation manuelle)

### Suppression d'un projet

**Avant** : ⚠️ Documents orphelins avec `project_id = NULL`
**Après** : ✅ Documents supprimés automatiquement (CASCADE)

### Suppression d'un document avec base de données

**Avant** : ⚠️ Lignes de BDD orphelines
**Après** : ✅ Lignes automatiquement supprimées (TRIGGER)

### Suppression d'une ligne de BDD

**Avant** : ⚠️ Document orphelin avec `database_row_id` invalide
**Après** : ✅ Document détecté lors du nettoyage périodique

### Accès aux relations de documents

**Avant** : 🔓 Tous les utilisateurs authentifiés pouvaient voir toutes les relations
**Après** : 🔒 Seuls les propriétaires de documents peuvent voir leurs relations

---

## 🧪 Tests Recommandés

### Test 1 : Suppression de propriétaire

```sql
-- 1. Créer un utilisateur et un projet
INSERT INTO auth.users (id, email) VALUES ('user-123', 'test@example.com');
INSERT INTO projects (id, name, owner_id) VALUES ('proj-123', 'Test Project', 'user-123');

-- 2. Supprimer l'utilisateur
DELETE FROM auth.users WHERE id = 'user-123';

-- 3. Vérifier que le projet existe avec owner_id = NULL
SELECT id, name, owner_id FROM projects WHERE id = 'proj-123';
-- Résultat attendu: owner_id = NULL
```

### Test 2 : Suppression de projet

```sql
-- 1. Créer un projet et un document
INSERT INTO projects (id, name) VALUES ('proj-456', 'Test Project 2');
INSERT INTO documents (id, title, project_id, user_id)
VALUES ('doc-456', 'Test Doc', 'proj-456', 'user-789');

-- 2. Supprimer le projet
DELETE FROM projects WHERE id = 'proj-456';

-- 3. Vérifier que le document est supprimé
SELECT COUNT(*) FROM documents WHERE id = 'doc-456';
-- Résultat attendu: 0
```

### Test 3 : Suppression de document avec ligne BDD

```sql
-- 1. Créer une base de données et un document lié
INSERT INTO document_databases (id, database_id, table_name, name, config, document_id)
VALUES ('db-meta-1', 'db-123', 'database_abc123', 'Task DB', '{}'::jsonb, 'doc-parent');

-- Créer la table dynamique
CREATE TABLE database_abc123 (id uuid PRIMARY KEY, title text);
INSERT INTO database_abc123 (id, title) VALUES ('row-123', 'Task 1');

-- Créer le document lié
INSERT INTO documents (id, title, database_id, database_row_id, user_id)
VALUES ('doc-row-123', 'Task 1 Doc', 'db-123', 'row-123', 'user-789');

-- 2. Supprimer le document
DELETE FROM documents WHERE id = 'doc-row-123';

-- 3. Vérifier que la ligne a été supprimée
SELECT COUNT(*) FROM database_abc123 WHERE id = 'row-123';
-- Résultat attendu: 0
```

### Test 4 : Nettoyage périodique

```sql
-- 1. Créer un document orphelin (pointant vers une ligne inexistante)
INSERT INTO documents (id, title, database_id, database_row_id, user_id)
VALUES ('orphan-doc', 'Orphan', 'db-123', 'non-existent-row', 'user-789');

-- 2. Exécuter la fonction de nettoyage
SELECT * FROM cleanup_orphaned_database_documents();

-- 3. Vérifier que le document orphelin a été supprimé
SELECT COUNT(*) FROM documents WHERE id = 'orphan-doc';
-- Résultat attendu: 0
```

### Test 5 : Politiques RLS strictes

```sql
-- 1. Créer deux utilisateurs
INSERT INTO auth.users (id, email) VALUES
  ('user-A', 'usera@example.com'),
  ('user-B', 'userb@example.com');

-- 2. User A crée un document avec une relation
INSERT INTO documents (id, title, user_id) VALUES ('doc-A', 'Doc A', 'user-A');
INSERT INTO tasks (id, name, project_id) VALUES ('task-1', 'Task 1', 'proj-123');
INSERT INTO document_task_relations (id, document_id, task_id)
VALUES ('rel-1', 'doc-A', 'task-1');

-- 3. User B tente de lire les relations (SET auth.uid() = 'user-B')
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'user-B';
SELECT * FROM document_task_relations WHERE document_id = 'doc-A';
-- Résultat attendu: 0 lignes (accès refusé)

-- 4. User A peut lire ses relations (SET auth.uid() = 'user-A')
SET LOCAL request.jwt.claim.sub = 'user-A';
SELECT * FROM document_task_relations WHERE document_id = 'doc-A';
-- Résultat attendu: 1 ligne
```

---

## 🚀 Déploiement en Production

### Pré-requis

1. **Backup de la base de données** :
   ```bash
   npx supabase db dump -f backup-$(date +%Y%m%d).sql
   ```

2. **Vérification de l'environnement local** :
   ```bash
   npx supabase db reset
   # Vérifier qu'aucune erreur n'est levée
   ```

### Étapes de déploiement

1. **Push des migrations** :
   ```bash
   npx supabase db push
   ```

2. **Vérification post-déploiement** :
   ```sql
   -- Vérifier les contraintes
   SELECT * FROM information_schema.referential_constraints
   WHERE constraint_name IN ('projects_owner_id_fkey', 'documents_project_id_fkey');

   -- Vérifier le trigger
   SELECT * FROM information_schema.triggers
   WHERE trigger_name = 'cleanup_database_row_on_document_delete_trigger';

   -- Vérifier les politiques RLS
   SELECT COUNT(*) FROM pg_policies
   WHERE tablename IN ('document_task_relations', 'document_databases');
   -- Résultat attendu: 8 (4 par table)
   ```

3. **Test en production** (sur données de test) :
   - Créer un projet test
   - Créer un document dans ce projet
   - Supprimer le projet
   - Vérifier que le document a été supprimé

### Rollback (si nécessaire)

Si des problèmes surviennent, restaurer depuis le backup :

```bash
npx supabase db reset --db-url <production-url>
psql <production-url> < backup-YYYYMMDD.sql
```

---

## 📞 Support et Questions

### Commandes utiles

**Lister toutes les politiques RLS** :
```sql
SELECT schemaname, tablename, policyname, permissive, cmd
FROM pg_policies
WHERE tablename LIKE 'document%'
ORDER BY tablename, policyname;
```

**Vérifier les contraintes de clés étrangères** :
```sql
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table,
  rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name, kcu.column_name;
```

**Compter les documents orphelins** :
```sql
SELECT COUNT(*) as orphaned_documents
FROM documents
WHERE database_row_id IS NOT NULL
  AND database_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM document_databases db
    WHERE db.database_id = documents.database_id
  );
```

---

## 🎯 Prochaines Étapes Recommandées

1. **Dashboard administrateur** : Créer une interface pour gérer les projets avec `owner_id = NULL`

2. **Tâche cron de nettoyage** : Exécuter `cleanup_orphaned_database_documents()` chaque semaine

3. **Monitoring** : Ajouter des alertes pour détecter l'accumulation de données orphelines

4. **Documentation utilisateur** : Informer les utilisateurs du nouveau comportement lors de la suppression

---

## ✅ Checklist de Validation

- [x] Contrainte `projects.owner_id` utilise `ON DELETE SET NULL`
- [x] Contrainte `documents.project_id` utilise `ON DELETE CASCADE`
- [x] Trigger `cleanup_database_row_on_document_delete` est actif
- [x] Fonction `cleanup_orphaned_database_documents` est créée
- [x] Politiques RLS strictes sur `document_task_relations` (8 politiques)
- [x] Politiques RLS strictes sur `document_databases` (8 politiques)
- [x] Aucune politique permissive (USING (true)) restante
- [x] Migrations appliquées sans erreur sur l'environnement local
- [ ] Tests manuels effectués
- [ ] Déployé en production
- [ ] Monitoring en place

---

**Migrations créées** :
- `supabase/migrations/20251212160000_fix_cascade_deletion_issues.sql`
- `supabase/migrations/20251212170000_remove_permissive_rls_policies.sql`

**Auteur** : Claude Code
**Date de création** : 2025-12-12
