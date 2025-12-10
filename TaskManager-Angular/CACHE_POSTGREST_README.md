# Problème de Cache PostgREST - Base de Données

## 🔴 Problème Actuel

Les fonctions RPC sont créées dans PostgreSQL mais **PostgREST ne les voit pas** (erreur 404).

### Diagnostic
- ✅ Les 6 fonctions RPC existent dans PostgreSQL
- ✅ Les permissions sont correctes
- ❌ PostgREST retourne 404 sur les endpoints RPC

### Cause
PostgREST met en cache le schéma de la base de données. Quand on crée de nouvelles fonctions, le cache n'est pas rafraîchi automatiquement.

## ✅ Solutions

### Option 1 : Attendre (Simple)
Le cache PostgREST se rafraîchit automatiquement **toutes les heures**.

**Attends 1 heure** et recharge l'application. Les endpoints RPC devraient fonctionner.

### Option 2 : Forcer le rafraîchissement (Avancé)
Exécute dans Supabase SQL Editor :

```sql
NOTIFY pgrst, 'reload schema';
```

**Note** : Cette commande ne fonctionne pas toujours selon la configuration Supabase.

### Option 3 : Redémarrer le projet Supabase
Depuis le Dashboard Supabase :
1. Project Settings → General
2. Pause project
3. Attendre 30 secondes
4. Restore project

**Attention** : Cette méthode rend le projet indisponible pendant quelques minutes.

## 🎯 Prochaines Étapes

Une fois que le cache est rafraîchi :

1. **Recharge l'application** (F5)
2. **Ouvre un document**
3. **Tape "/" → "Base de données"**
4. **Vérifie que ça fonctionne** (pas d'erreur 404)

## 📝 Pour Éviter Ce Problème à l'Avenir

Toujours créer les fonctions RPC **avant** de déployer le code frontend qui les utilise.

Ou utiliser Supabase CLI avec migrations :
```bash
supabase db push
```

Le CLI force automatiquement le rafraîchissement du cache PostgREST.
