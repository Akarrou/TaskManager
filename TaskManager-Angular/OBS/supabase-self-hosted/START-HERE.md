# ✅ Supabase Self-Hosted - Installation Terminée !

## 🎉 Félicitations !

Votre instance Supabase Self-Hosted est en cours de démarrage.

---

## 📋 Résumé de l'Installation

### ✅ Ce qui a été fait

- [x] Clonage de la configuration Supabase officielle
- [x] Génération des clés de sécurité (JWT, ANON_KEY, SERVICE_ROLE_KEY)
- [x] Configuration du fichier `.env`
- [x] Copie du schéma de base de données
- [x] Démarrage de Docker Compose

### 🔧 Services en cours de démarrage

Docker Compose est en train de démarrer **15 services** :

1. **Kong** - API Gateway (port 8000)
2. **Studio** - Interface Admin (port 3000)
3. **PostgreSQL** - Base de données (port 5432)
4. **GoTrue** - Authentification
5. **PostgREST** - API REST auto-générée
6. **Realtime** - WebSockets temps réel
7. **Storage** - Stockage fichiers
8. **imgproxy** - Transformation images
9. **pg_meta** - Métadonnées PostgreSQL
10. **functions** - Edge Functions
11. **analytics** - Analytiques
12. **vector** - Logs
13. **pooler** - Connection pooling
14. Et d'autres...

⏱️ **Le démarrage complet prend 2-3 minutes**

---

## 🚀 Accès aux Services

Une fois le démarrage terminé (dans quelques minutes) :

### 📊 Supabase Studio (Interface Admin)
```
http://localhost:3000
```

### 🔌 API Supabase
```
http://localhost:8000
```

### 🗄️ PostgreSQL (Connexion directe)
```
Host: localhost
Port: 5432
Database: postgres
User: postgres
Password: V2xMj8N9pQrT6sKfH3nB4cYdL9vA
```

---

## 🎨 Configuration Angular

### Fichier à modifier : `src/environments/environment.ts`

```typescript
export const environment = {
  production: false,
  supabaseUrl: 'http://localhost:8000',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzY1NDA0NTc4LCJleHAiOjIwODA5ODA1Nzh9.uxmGgPIWxA4EjqomO-rNLt4T62qMoLQn4Kz2alLhP8w',
};
```

**C'est tout !** Aucune autre modification nécessaire dans votre code Angular.

---

## ✅ Vérification de l'Installation

### 1. Vérifier l'état des services

```bash
cd TaskManager-Angular/OBS/supabase-self-hosted
docker compose ps
```

**Tous les services doivent afficher "healthy"** (peut prendre 2-3 minutes)

### 2. Tester l'API

```bash
curl http://localhost:8000
```

Doit retourner une réponse JSON.

### 3. Ouvrir Supabase Studio

Ouvrir dans votre navigateur : **http://localhost:3000**

---

## 📁 Fichiers Importants

| Fichier | Description |
|---------|-------------|
| **CREDENTIALS.txt** | Tous vos mots de passe et clés API |
| **.env** | Configuration des services (NE PAS COMMITER) |
| **docker-compose.yml** | Configuration Docker |
| **volumes/db/init/01-schema.sql** | Votre schéma de BDD |

---

## 🛠️ Commandes Utiles

```bash
# Voir l'état
docker compose ps

# Voir les logs
docker compose logs -f

# Logs d'un service spécifique
docker compose logs -f kong
docker compose logs -f db

# Arrêter tous les services
docker compose stop

# Redémarrer
docker compose start

# Redémarrer un service spécifique
docker compose restart kong

# Tout supprimer (⚠️ ATTENTION: supprime les données)
docker compose down -v
```

---

## 🆘 Dépannage

### Problème : Services ne démarrent pas

```bash
# Redémarrer proprement
docker compose down
docker compose up -d

# Vérifier les logs
docker compose logs -f
```

### Problème : Port déjà utilisé (8000 ou 3000)

Modifier dans `docker-compose.yml` :
- Ligne avec `8000:8000` → `8001:8000`
- Ligne avec `3000:3000` → `3001:3000`

Puis dans Angular :
- `supabaseUrl: 'http://localhost:8001'`

### Problème : PostgreSQL ne démarre pas

```bash
# Vérifier les logs
docker compose logs db

# Vérifier que le port 5432 est libre
lsof -i :5432
```

---

## 📚 Documentation

- **Guide Rapide** : [QUICK-START.md](QUICK-START.md)
- **Guide Complet** : [README-SETUP.md](README-SETUP.md)
- **Documentation Officielle** : https://supabase.com/docs/guides/self-hosting

---

## 🔒 Sécurité - IMPORTANT !

⚠️ **NE JAMAIS** :
- Commiter `.env` dans Git (déjà dans .gitignore)
- Partager vos clés API publiquement
- Utiliser les mêmes clés en production

✅ **TOUJOURS** :
- Garder `CREDENTIALS.txt` en sécurité
- Régénérer de nouvelles clés pour la production
- Faire des backups réguliers

---

## 🎯 Prochaines Étapes

1. **Attendre 2-3 minutes** que tous les services démarrent
2. **Ouvrir Supabase Studio** : http://localhost:3000
3. **Mettre à jour Angular** avec les valeurs ci-dessus
4. **Lancer votre app** : `ng serve`
5. **Tester** : Login, CRUD, Upload fichiers

---

## ✨ Vous Avez Réussi !

Vous avez maintenant :
- ✅ Supabase complet en local
- ✅ Contrôle total de vos données
- ✅ Pas de frais Supabase Cloud
- ✅ Même API qu'avant (ZÉRO changement de code)

**Bon développement ! 🚀**
