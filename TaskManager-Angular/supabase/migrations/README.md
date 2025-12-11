# Migrations Supabase

## Ordre d'Exécution des Migrations

Les migrations DOIVENT être appliquées dans cet ordre :

1. `20251211000000_add_update_updated_at_helper.sql` - Helper function (PREREQUIS)
2. `20251211000001_add_add_column_to_table.sql` - Ajout de colonnes dynamiques
3. `20251211000002_add_delete_column_from_table.sql` - Suppression de colonnes
4. `20251211000003_add_ensure_table_exists.sql` - Lazy creation de tables
5. `20251211000004_add_bulk_insert_rows.sql` - Import CSV batch
6. `20251211000005_add_delete_database_cascade.sql` - Suppression en cascade

**IMPORTANT** : La migration 1 (helper function) DOIT être exécutée en premier car elle est utilisée par les triggers de toutes les tables dynamiques.

## Fonctions RPC Disponibles

Après application des migrations, les fonctions suivantes sont disponibles :

| Fonction | Description | Utilisée par |
|----------|-------------|--------------|
| `update_updated_at_column()` | Helper pour triggers updated_at | Toutes les tables dynamiques |
| `add_column_to_table()` | Ajoute une colonne dynamiquement | `database.service.ts` |
| `delete_column_from_table()` | Supprime une colonne | `database.service.ts` |
| `ensure_table_exists()` | Lazy creation de table | `database.service.ts` |
| `bulk_insert_rows()` | Import CSV par batch | `csv-import-dialog.component.ts` |
| `delete_database_cascade()` | Suppression cascade | `database.service.ts` |

## Migrations disponibles

### 1. Helper Function - `20251211000000_add_update_updated_at_helper.sql`

Crée la fonction helper `update_updated_at_column()` utilisée par tous les triggers pour mettre à jour automatiquement le champ `updated_at`. **Cette migration est un prerequis obligatoire**.

### 2. Ajout de Colonne - `20251211000001_add_add_column_to_table.sql`

Ajoute la fonction RPC `add_column_to_table` pour ajouter dynamiquement une colonne à une table database existante.

### 3. Suppression de Colonne - `20251211000002_add_delete_column_from_table.sql`

Ajoute la fonction RPC `delete_column_from_table` pour supprimer dynamiquement une colonne d'une table database.

### 4. Lazy Creation - `20251211000003_add_ensure_table_exists.sql`

Ajoute la fonction RPC `ensure_table_exists` pour créer la table PostgreSQL dynamique uniquement au premier usage (lazy creation). Évite les délais d'attente lors de l'insertion d'un bloc database vide.

### 5. Import CSV - `20251211000004_add_bulk_insert_rows.sql`

Ajoute la fonction RPC `bulk_insert_rows` pour l'import en batch de lignes CSV.

### 6. Suppression en Cascade - `20251211000005_add_delete_database_cascade.sql`

Ajoute la fonction RPC `delete_database_cascade` pour supprimer proprement une base de données et sa table PostgreSQL dynamique en cascade.

## Étape 1 : Appliquer les migrations RPC

Les migrations doivent être appliquées à votre base de données Supabase **dans l'ordre suivant** :

1. `20251211000000_add_update_updated_at_helper.sql` (Helper function - PREREQUIS)
2. `20251211000001_add_add_column_to_table.sql` (Ajout de colonnes)
3. `20251211000002_add_delete_column_from_table.sql` (Suppression de colonnes)
4. `20251211000003_add_ensure_table_exists.sql` (Lazy creation)
5. `20251211000004_add_bulk_insert_rows.sql` (Import CSV)
6. `20251211000005_add_delete_database_cascade.sql` (Suppression cascade)

### Option A : Via le Dashboard Supabase (Recommandé)

1. Connectez-vous à [app.supabase.com](https://app.supabase.com)
2. Sélectionnez votre projet
3. Allez dans **SQL Editor** (dans la barre latérale)
4. Pour chaque migration dans l'ordre :
   - Créez une nouvelle requête
   - Copiez-collez le contenu du fichier de migration
   - Cliquez sur **Run** pour exécuter la migration
   - Attendez la confirmation de succès avant de passer à la suivante

### Option B : Via CLI Supabase

Si vous avez le CLI Supabase installé :

```bash
# Depuis le répertoire TaskManager-Angular
supabase db push
```

### Option C : Migration manuelle

Copiez le contenu du fichier SQL et exécutez-le directement dans votre base de données PostgreSQL.

## Vérification Complète

Pour vérifier que toutes les fonctions ont été créées correctement :

```sql
-- Vérifier que toutes les fonctions RPC existent
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'update_updated_at_column',
    'add_column_to_table',
    'delete_column_from_table',
    'ensure_table_exists',
    'bulk_insert_rows',
    'delete_database_cascade'
  )
ORDER BY routine_name;
```

Vous devriez voir **6 lignes** retournées :
- `add_column_to_table` (FUNCTION)
- `bulk_insert_rows` (FUNCTION)
- `delete_column_from_table` (FUNCTION)
- `delete_database_cascade` (FUNCTION)
- `ensure_table_exists` (FUNCTION)
- `update_updated_at_column` (FUNCTION)

Si vous voyez moins de 6 lignes, une ou plusieurs migrations n'ont pas été appliquées correctement.

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
