# 🔧 Guide d'Installation Supabase - Système Base de Données

## Étape 1 : Accéder à Supabase

1. **Ouvrez votre navigateur** et allez sur : https://supabase.com/dashboard
2. **Connectez-vous** avec votre compte
3. **Sélectionnez votre projet** (celui utilisé pour TaskManager)

## Étape 2 : Ouvrir le SQL Editor

1. Dans le menu de gauche, cliquez sur **"SQL Editor"** (icône `</>`)
2. Cliquez sur le bouton **"New query"** en haut à droite

## Étape 3 : Copier le Script SQL

1. Ouvrez le fichier : `TaskManager-Angular/supabase-rpc-functions.sql`
2. **Sélectionnez TOUT le contenu** (Cmd+A ou Ctrl+A)
3. **Copiez** (Cmd+C ou Ctrl+C)

## Étape 4 : Coller et Exécuter

1. Dans l'éditeur SQL Supabase, **collez** le script (Cmd+V ou Ctrl+V)
2. Cliquez sur le bouton **"Run"** (en bas à droite, bouton vert)
3. Attendez quelques secondes...

## Étape 5 : Vérifier le Succès

Vous devriez voir :
```
✅ Success. No rows returned
```

Si vous voyez une erreur, lisez le message et contactez-moi avec le texte exact.

## Étape 6 : Vérifier que Tout est Créé

Dans le SQL Editor, créez une **nouvelle query** et exécutez :

```sql
-- Vérifier la table metadata
SELECT * FROM document_databases;

-- Vérifier les fonctions RPC
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
AND (
  routine_name LIKE '%dynamic_table%'
  OR routine_name LIKE '%column%'
  OR routine_name = 'update_updated_at_column'
  OR routine_name = 'create_update_trigger'
)
ORDER BY routine_name;
```

**Résultat attendu :**
```
routine_name
------------------------
add_column_to_table
change_column_type
create_dynamic_table
create_update_trigger
delete_column_from_table
delete_dynamic_table
rename_column_in_table
update_updated_at_column
```

## ✅ Installation Réussie !

Si vous voyez les 8 fonctions ci-dessus, l'installation est complète !

---

## 🆘 Résolution de Problèmes

### Erreur : "relation does not exist"
→ La table `documents` n'existe pas. Vérifiez votre schéma Supabase.

### Erreur : "permission denied"
→ Vous n'avez pas les droits admin. Contactez l'administrateur du projet.

### Erreur : "function already exists"
→ Pas de problème ! Cela signifie que le script a déjà été exécuté.
→ Vous pouvez ignorer cette erreur ou supprimer les fonctions avant de réexécuter :

```sql
DROP FUNCTION IF EXISTS create_dynamic_table CASCADE;
DROP FUNCTION IF EXISTS add_column_to_table CASCADE;
-- etc...
```

---

## 📞 Besoin d'Aide ?

Si vous rencontrez un problème :
1. Copiez le message d'erreur EXACT
2. Prenez une capture d'écran
3. Partagez-le avec moi
