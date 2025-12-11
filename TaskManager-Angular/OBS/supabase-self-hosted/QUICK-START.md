# 🚀 Démarrage Ultra-Rapide - Supabase Self-Hosted

## 💡 Installation en 3 Commandes (5 minutes)

### En Local (macOS/Linux)

```bash
# 1. Aller dans le dossier
cd TaskManager-Angular/OBS/supabase-self-hosted

# 2. Lancer le setup automatique
./setup.sh

# 3. C'est tout ! ✅
```

### Sur un VPS (Ubuntu/Debian)

```bash
# Une seule commande sur votre serveur (en tant que root)
wget -qO- https://VOTRE_REPO/deploy-vps.sh | bash
```

---

## 🔧 Setup Manuel (si scripts ne fonctionnent pas)

### Étape 1 : Générer les Clés (2 min)

```bash
cd scripts
npm install jsonwebtoken
node generate-keys.js
```

**Copier les 3 clés affichées** (JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY)

### Étape 2 : Configuration (1 min)

```bash
cd ..
cp .env.example .env
nano .env  # ou code .env
```

**Coller vos clés dans `.env`** aux lignes correspondantes

### Étape 3 : Démarrage (2 min)

```bash
docker compose up -d
```

Attendre 2-3 minutes que tous les services démarrent.

### Étape 4 : Vérification

```bash
docker compose ps
```

Tous les services doivent afficher **"healthy"**.

---

## ✅ Accès aux Services

| Service | URL | Description |
|---------|-----|-------------|
| **Studio** | http://localhost:3000 | Interface d'administration |
| **API** | http://localhost:8000 | API REST Supabase |
| **PostgreSQL** | localhost:5432 | Base de données |

---

## 🎨 Configuration Angular

### Fichier `src/environments/environment.ts`

```typescript
export const environment = {
  production: false,
  supabaseUrl: 'http://localhost:8000',
  supabaseAnonKey: 'VOTRE_ANON_KEY',  // Copier depuis keys.txt
};
```

**C'est tout !** Votre app Angular fonctionne maintenant avec Supabase local.

---

## 📦 Commandes Utiles

```bash
# Voir l'état
docker compose ps

# Voir les logs
docker compose logs -f

# Arrêter
docker compose stop

# Redémarrer
docker compose start

# Tout supprimer (⚠️ ATTENTION: supprime les données)
docker compose down -v
```

---

## 🆘 Dépannage Rapide

### Problème: Services ne démarrent pas

```bash
docker compose down
docker compose up -d
docker compose logs -f
```

### Problème: Erreur "Cannot connect to database"

```bash
# Vérifier que PostgreSQL est prêt
docker compose exec db pg_isready -U postgres
```

### Problème: Port déjà utilisé

Modifier les ports dans `docker-compose.yml` :
- `8000:8000` → `8001:8000`
- `3000:3000` → `3001:3000`

---

## 🔒 Sécurité Important!

⚠️ **NE JAMAIS commiter dans Git:**
- `.env`
- `keys.txt`
- Fichiers dans `volumes/db/data/`

Le fichier `.gitignore` est déjà configuré pour vous protéger.

---

## 📚 Besoin d'Aide?

- Documentation complète : [README-SETUP.md](README-SETUP.md)
- Documentation officielle : https://supabase.com/docs/guides/self-hosting/docker
- GitHub Supabase : https://github.com/supabase/supabase

---

**Bon développement avec Supabase Self-Hosted ! 🎉**
