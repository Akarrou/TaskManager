# 🧪 Guide de Test - Fonctionnalité Base de Données

## ✅ Prérequis

Avant de tester, assurez-vous que :

1. ✅ Le script SQL a été exécuté dans Supabase (voir `SUPABASE_SETUP_GUIDE.md`)
2. ✅ L'application compile sans erreur
3. ✅ Vous êtes connecté à l'application

## 🚀 Étape 1 : Démarrer l'Application

```bash
cd TaskManager-Angular
npm start
```

Attendez le message :
```
✔ Application bundle generation complete.
➜  Local:   http://localhost:4200/
```

## 📝 Étape 2 : Ouvrir un Document

1. Ouvrez votre navigateur : http://localhost:4200
2. Connectez-vous si nécessaire
3. Naviguez vers **Documents** (menu de gauche ou URL `/documents`)
4. **Créez un nouveau document** OU **ouvrez un document existant**
5. **Vérifiez que le document est sauvegardé** (vous devriez voir "Dernière modification : XX:XX")

## 🎯 Étape 3 : Tester le Slash Menu

### Test 1 : Ouvrir le Menu

1. Dans l'éditeur, **tapez `/`** (slash)
2. **Résultat attendu** : Un menu apparaît avec plusieurs sections

### Test 2 : Vérifier les Sections

Le menu devrait afficher ces sections :

```
📄 Texte
  - Texte
  - Titre 1
  - Titre 2
  - Titre 3

📋 Listes
  - Liste à puces
  - Liste numérotée
  - Liste de tâches

✏️ Format
  - Gras
  - Italique
  - Barré
  - Code inline
  - Citation

🎨 Médias
  - Image
  - Tableau
  - Bloc de code
  - Base de données  ← 🎯 DEVRAIT ÊTRE ICI !

🏗️ Structure
  - 2 Colonnes
  - 3 Colonnes
  - Séparateur
  - Nouvelle page

✅ Tâches
  - Section de tâches
  - Lier une tâche
  - Créer une tâche

🔧 Utilitaires
  - Saut de ligne
  - Effacer format
```

### Test 3 : Sélectionner "Base de données"

1. **Faites défiler** jusqu'à la section **"Médias"**
2. **Cliquez sur "Base de données"** (icône `table_view`)
   - OU utilisez les **flèches ↑↓** pour naviguer + **Entrée**
   - OU tapez **Cmd+Shift+D** (Mac) / **Ctrl+Shift+D** (Windows/Linux)

## 🎬 Étape 4 : Vérifier la Création

### Ce qui devrait se passer :

#### Phase 1 : Insertion du Bloc (< 1 seconde)
```
┌─────────────────────────────────────┐
│ Base de données (chargement...)     │
│                                     │
│ [Bloc gris avec bordure pointillée]│
└─────────────────────────────────────┘
```

#### Phase 2 : Création de la Table (2-5 secondes)
```
┌─────────────────────────────────────┐
│ 🔄 Création de la base de données...│
│                                     │
│ [Spinner tournant]                  │
└─────────────────────────────────────┘
```

#### Phase 3 : Interface Complète (après création)
```
┌─────────────────────────────────────────────────┐
│ 📊 Nouvelle base de données                     │
│ 0 ligne(s) • 2 colonne(s)                       │
│                                                  │
│ [📊Table] [📋Kanban] [📅Calendar] [⏱Timeline]   │
│                         [+ Nouvelle ligne]      │
├─────────────────────────────────────────────────┤
│                                                  │
│ Vue tableau - En cours de développement         │
│ 0 ligne(s) chargée(s)                           │
│                                                  │
│ Colonnes :                                       │
│ [Nom (text)]  [Statut (select)]                 │
│                                                  │
│ [+ Ajouter une colonne]                         │
│                                                  │
└─────────────────────────────────────────────────┘
```

## 🔍 Étape 5 : Vérifier dans Supabase

### Console Browser (F12)

Ouvrez la console et cherchez :
```javascript
Database created: {databaseId: "db-...", tableName: "database_..."}
```

### Supabase Dashboard

1. Allez dans **Table Editor** (menu gauche)
2. **Vous devriez voir une nouvelle table** : `database_xxxxxxxx` (avec UUID aléatoire)
3. Cliquez dessus pour voir sa structure :
   ```
   Colonnes :
   - id (UUID, PRIMARY KEY)
   - row_order (INTEGER)
   - col_nom (TEXT)
   - col_status (TEXT)
   - created_at (TIMESTAMP)
   - updated_at (TIMESTAMP)
   ```

4. Vérifiez aussi la table `document_databases` :
   ```sql
   SELECT * FROM document_databases;
   ```
   Vous devriez voir une ligne avec :
   - `database_id` : l'UUID de votre base
   - `table_name` : le nom de la table créée
   - `config` : la configuration JSON (colonnes, vues)

## ✅ Étape 6 : Tester les Actions

### Test 1 : Ajouter une Ligne

1. Cliquez sur **[+ Nouvelle ligne]**
2. **Résultat attendu** : Le compteur passe à "1 ligne(s)"
3. **Vérifier dans Supabase** :
   ```sql
   SELECT * FROM database_xxxxxxxx;
   ```
   Vous devriez voir une ligne avec `row_order = 0`

### Test 2 : Ajouter Plusieurs Lignes

1. Cliquez 5 fois sur **[+ Nouvelle ligne]**
2. **Résultat attendu** : "6 ligne(s) • 2 colonne(s)"
3. **Vérifier dans Supabase** : 6 lignes avec `row_order` de 0 à 5

### Test 3 : Sauvegarder et Recharger

1. **Attendez 2 secondes** (autosave)
2. **Rechargez la page** (F5)
3. **Résultat attendu** : Le bloc de base de données réapparaît avec "6 ligne(s)"

### Test 4 : Supprimer le Bloc

1. **Cliquez sur le bloc** pour le sélectionner (bordure bleue)
2. **Appuyez sur Suppr ou Backspace**
3. **Résultat attendu** : Le bloc disparaît
4. **Vérifier dans Supabase** : La table `database_xxxxxxxx` devrait être supprimée

## ❌ Problèmes Courants

### Problème 1 : Le menu "/" n'affiche rien

**Cause** : Application pas compilée correctement

**Solution** :
```bash
# Arrêtez npm start (Ctrl+C)
# Supprimez node_modules et réinstallez
rm -rf node_modules
npm install
npm start
```

### Problème 2 : "Base de données" n'apparaît pas dans le menu

**Cause** : Composant SlashMenu pas mis à jour

**Solution** : Vérifiez que le fichier `slash-menu.component.ts` contient bien `'database'` dans la section Médias

### Problème 3 : Erreur "Sauvegardez le document d'abord"

**Cause** : Document pas encore sauvegardé

**Solution** :
1. Tapez quelque chose dans le titre
2. Attendez 2 secondes (autosave)
3. Vérifiez "Dernière modification : XX:XX"
4. Réessayez `/database`

### Problème 4 : Spinner infini "Création de la base de données..."

**Causes possibles** :
1. ❌ Script SQL pas exécuté dans Supabase
2. ❌ Pas de connexion Supabase
3. ❌ Permissions insuffisantes

**Solution** :
1. Ouvrez la **Console (F12)**
2. Cherchez les erreurs :
   ```javascript
   Failed to create database: ...
   ```
3. Si vous voyez `PGRST...` :
   - Code `PGRST116` : Fonction RPC introuvable → Exécutez le script SQL
   - Code `42501` : Permission denied → Vérifiez vos droits
4. Exécutez le script `supabase-rpc-functions.sql` (voir guide)

### Problème 5 : "Erreur lors du chargement de la base de données"

**Cause** : Problème de connexion Supabase ou table metadata manquante

**Solution** :
1. Vérifiez que la table `document_databases` existe :
   ```sql
   SELECT * FROM document_databases;
   ```
2. Si elle n'existe pas, réexécutez le script SQL

## 📊 Vérification Complète

Après tous les tests, voici ce que vous devriez avoir :

### Dans l'Application
- ✅ Menu slash affiche "Base de données" dans section "Médias"
- ✅ Bloc s'insère correctement
- ✅ Spinner apparaît pendant création
- ✅ Interface complète s'affiche après création
- ✅ Bouton "Nouvelle ligne" fonctionne
- ✅ Compteur de lignes/colonnes se met à jour

### Dans Supabase
- ✅ Table `document_databases` existe et contient des entrées
- ✅ Tables `database_xxxxxxxx` créées dynamiquement
- ✅ Fonctions RPC visibles dans SQL Editor
- ✅ Données persistent après rechargement

### Dans le Document
- ✅ Bloc sauvegardé dans `document.content`
- ✅ Réapparaît après rechargement page
- ✅ Undo/Redo fonctionne (Cmd+Z / Cmd+Shift+Z)

## 🎉 Succès !

Si tous les tests passent, le système de base de données est **100% fonctionnel** !

Prochaines étapes :
- Implémenter la vue tableau avec cellules éditables
- Implémenter les types de colonnes (select, multi-select, etc.)
- Implémenter les filtres et le tri
- Implémenter la vue kanban

---

**Besoin d'aide ?** Partagez-moi :
1. Le message d'erreur exact (console + screenshot)
2. L'étape où ça bloque
3. Le résultat de `SELECT * FROM document_databases;` dans Supabase
