# Migrations Supabase

## Migrations disponibles

### 1. Import CSV - `20251211_add_bulk_insert_rows.sql`

Ajoute la fonction RPC `bulk_insert_rows` pour l'import en batch de lignes CSV.

### 2. Suppression en cascade - `20251211_add_delete_database_cascade.sql`

Ajoute la fonction RPC `delete_database_cascade` pour supprimer proprement une base de données et sa table PostgreSQL dynamique en cascade.

### 3. Lazy creation de tables - `20251211_add_ensure_table_exists.sql`

Ajoute la fonction RPC `ensure_table_exists` pour créer la table PostgreSQL dynamique uniquement au premier usage (lazy creation). Évite les délais d'attente lors de l'insertion d'un bloc database vide.

## Étape 1 : Appliquer les migrations RPC

Les migrations suivantes doivent être appliquées à votre base de données Supabase :
- `20251211_add_bulk_insert_rows.sql` (Import CSV)
- `20251211_add_delete_database_cascade.sql` (Suppression cascade)
- `20251211_add_ensure_table_exists.sql` (Lazy creation)

### Option A : Via le Dashboard Supabase (Recommandé)

1. Connectez-vous à [app.supabase.com](https://app.supabase.com)
2. Sélectionnez votre projet
3. Allez dans **SQL Editor** (dans la barre latérale)
4. Créez une nouvelle requête
5. Copiez-collez le contenu du fichier `20251211_add_bulk_insert_rows.sql`
6. Cliquez sur **Run** pour exécuter la migration

### Option B : Via CLI Supabase

Si vous avez le CLI Supabase installé :

```bash
# Depuis le répertoire TaskManager-Angular
supabase db push
```

### Option C : Migration manuelle

Copiez le contenu du fichier SQL et exécutez-le directement dans votre base de données PostgreSQL.

## Vérification

Pour vérifier que les fonctions ont été créées correctement :

```sql
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('bulk_insert_rows', 'delete_database_cascade', 'ensure_table_exists');
```

Vous devriez voir trois lignes retournées avec `bulk_insert_rows`, `delete_database_cascade` et `ensure_table_exists`.

## Fix des tables existantes (après mise à jour ensure_table_exists)

Si vous avez des tables créées avant la correction du propriétaire, exécutez cette requête pour corriger les permissions :

```sql
-- Lister toutes les tables database_* et corriger leur propriétaire
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename LIKE 'database_%'
  LOOP
    EXECUTE format('ALTER TABLE %I OWNER TO postgres', tbl);
    EXECUTE format('GRANT ALL ON TABLE %I TO authenticated', tbl);
    EXECUTE format('GRANT ALL ON TABLE %I TO service_role', tbl);
    RAISE NOTICE 'Fixed permissions for table: %', tbl;
  END LOOP;
END $$;
```

## Test de la fonction

Pour tester la fonction RPC :

```sql
-- Créer une base de test (remplacez <existing_database_id> par un ID valide)
SELECT bulk_insert_rows(
  '<existing_database_id>',
  ARRAY['{"cells": {"col1": "Test", "col2": 123}}'::TEXT]
);
```

## Troubleshooting

### Erreur : "Database not found"
- Vérifiez que le `database_id` existe dans la table `document_databases`
- Assurez-vous que la table dynamique `database_<uuid>` a été créée

### Erreur : "Permission denied"
- La fonction utilise `SECURITY DEFINER`, assurez-vous que l'utilisateur qui l'exécute a les permissions appropriées

### Erreur : "Table does not exist"
- Vérifiez que la base de données a été créée via l'interface (ce qui crée automatiquement la table PostgreSQL)
