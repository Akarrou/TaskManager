# Task Manager

Une interface web moderne pour visualiser et gérer les tâches stockées dans Redis JSON. 
Le nom du projet est configurable via des variables d'environnement.

## 🚀 Fonctionnalités

- **Nom de projet configurable** via la variable `PROJECT_NAME`
- **Affichage en temps réel** des tâches depuis Redis JSON
- **Statistiques visuelles** avec tableaux de bord
- **Filtrage avancé** par statut, priorité, catégorie
- **Recherche textuelle** dans les titres, descriptions et tags
- **Gestion des statuts** avec mise à jour directe
- **Interface responsive** avec Tailwind CSS
- **Mode démo** si Redis n'est pas disponible

## 📋 Prérequis

- **Node.js** version 16 ou supérieure
- **Redis Stack** avec module JSON activé
- **Port 3001** disponible pour l'API
- **Port 6379** pour Redis (configuration par défaut)

## 🛠 Installation

### 1. Configuration du nom de projet

Définissez la variable d'environnement `PROJECT_NAME` :

```bash
# Pour AgroFlow (par défaut)
export PROJECT_NAME="AgroFlow"

# Pour un autre projet
export PROJECT_NAME="MonProjet"
```

Ou créez un fichier `.env` :

```bash
cp env.example .env
# Éditez le fichier .env avec votre nom de projet
```

### 2. Installation des dépendances

```bash
cd Task_manager
npm install
```

### 3. Vérification de Redis

Assurez-vous que Redis Stack est démarré avec le module JSON :

```bash
# Vérifier que Redis fonctionne
redis-cli ping
# Réponse attendue: PONG

# Vérifier que JSON est disponible
redis-cli JSON.GET tasks:index
```

### 4. Démarrage de l'application

```bash
# Mode production
PROJECT_NAME="MonProjet" npm start

# Mode développement (avec nodemon)
PROJECT_NAME="MonProjet" npm run dev
```

L'application sera disponible sur : **http://localhost:3001**

## 🐳 Déploiement Docker

### Méthode rapide avec le script

```bash
# Utiliser AgroFlow (par défaut)
./build.sh

# Utiliser un autre nom de projet
./build.sh "MonProjet"

# Ou avec variable d'environnement
PROJECT_NAME="MonProjet" ./build.sh
```

### Méthode manuelle

```bash
# Définir le nom du projet
export PROJECT_NAME="MonProjet"

# Build avec npm scripts
npm run docker:build
npm run docker:up

# Ou directement avec Docker
docker build -t monprojet-task-manager \
  -f task-manager.Dockerfile \
  --build-arg PROJECT_NAME="MonProjet" \
  ..

PROJECT_NAME="MonProjet" docker-compose -f docker-compose.task-manager.yml up -d
```

## 🔧 Configuration

### Variables d'environnement

| Variable | Défaut | Description |
|----------|--------|-------------|
| `PROJECT_NAME` | `AgroFlow` | Nom du projet affiché dans l'interface |
| `PORT` | `3001` | Port du serveur web |
| `REDIS_HOST` | `localhost` | Adresse Redis |
| `REDIS_PORT` | `6379` | Port Redis |
| `NODE_ENV` | `production` | Environnement Node.js |

### Personnalisation avancée

Modifiez `js/config.js` pour personnaliser :

- URL de l'API
- Intervalles de rafraîchissement
- Couleurs des statuts et priorités
- Icônes des catégories

## 📊 Structure des données Redis

L'application utilise le format de données suivant dans Redis :

### Tâches individuelles : `tasks:{ID}`

```json
{
  "id": 1,
  "title": "Titre de la tâche",
  "status": "À faire|En cours|Terminée|En attente|Annulée",
  "priority": "Haute|Moyenne|Basse",
  "assignee": "Jerome",
  "dueDate": "2024-12-31",
  "description": "Description détaillée",
  "category": "Frontend|Backend|Fullstack|Testing|OPS",
  "tags": ["tag1", "tag2"],
  "tasks": ["sous-tâche 1", "sous-tâche 2"],
  "problem": "Description du problème",
  "objective": "Objectif à atteindre",
  "source_file": "nom-du-fichier.mdc",
  "created_at": "2024-12-20",
  "updated_at": "2024-12-20",
  "completed_at": null
}
```

### Index des tâches : `tasks:index`

```json
{
  "total_tasks": 15,
  "status_breakdown": {
    "À faire": 8,
    "En cours": 3,
    "Terminée": 4
  },
  "priority_breakdown": {
    "Haute": 5,
    "Moyenne": 7,
    "Basse": 3
  },
  "category_breakdown": {
    "Frontend": 6,
    "Backend": 5,
    "Fullstack": 4
  },
  "task_ids": [1, 2, 3, 4, 5],
  "last_updated": "2024-12-20T10:30:00Z"
}
```

## 🌐 API Endpoints

L'application expose une API REST pour interagir avec Redis :

### Santé de l'API

```
GET /api/health
```

### Tâches

```
GET /api/tasks           # Toutes les tâches
GET /api/tasks/:id       # Tâche spécifique
GET /api/tasks/index     # Statistiques
PUT /api/tasks/:id/status # Mise à jour du statut
```

## 🎨 Interface utilisateur

### Tableau de bord

- **Cartes de statistiques** : Total, À faire, En cours, Terminées
- **Indicateur de connexion** : Redis connecté/déconnecté
- **Bouton actualiser** : Mise à jour manuelle

### Filtres

- **Recherche textuelle** : Titre, description, tags
- **Filtre par statut** : Tous, À faire, En cours, etc.
- **Filtre par priorité** : Haute, Moyenne, Basse
- **Filtre par catégorie** : Frontend, Backend, Fullstack, etc.

### Liste des tâches

- **Cartes visuelles** avec badges colorés
- **Boutons de changement de statut** intégrés
- **Clic pour voir les détails** complets
- **Affichage des tags et métadonnées**

### Modal de détails

- **Informations complètes** de la tâche
- **Sous-tâches** si définies
- **Historique** des dates
- **Tags** avec style

## 🔄 Synchronisation avec Redis

L'application se synchronise automatiquement avec Redis :

- **Rafraîchissement automatique** toutes les 30 secondes
- **Mise à jour immédiate** lors des modifications
- **Recalcul des statistiques** en temps réel
- **Persistance** garantie par Redis

## 🐛 Dépannage

### Redis non disponible

- L'application passe en **mode démo** avec des données d'exemple
- Vérifiez que Redis Stack est démarré
- Vérifiez la configuration des ports

### Problèmes de connexion

```bash
# Vérifier Redis
redis-cli ping

# Vérifier les modules
redis-cli MODULE LIST

# Vérifier les données
redis-cli KEYS tasks:*
```

### Logs du serveur

Les logs détaillés s'affichent dans la console :

- Connexions Redis
- Requêtes API
- Erreurs de traitement

## 📝 Développement

### Structure des fichiers

```
Task_manager/
├── index.html          # Interface utilisateur
├── server.js           # Serveur Express/API
├── package.json        # Dépendances Node.js
├── js/
│   ├── config.js       # Configuration
│   ├── api.js          # Communication API
│   └── app.js          # Logique interface
└── README.md           # Documentation
```

### Ajout de fonctionnalités

1. Modifiez `server.js` pour les nouveaux endpoints API
2. Étendez `api.js` pour les nouvelles requêtes
3. Mettez à jour `app.js` pour l'interface utilisateur
4. Adaptez `config.js` pour la configuration

## 🚀 Déploiement

Pour un déploiement en production :

1. **Variables d'environnement** appropriées
2. **Proxy inverse** (nginx, Apache)
3. **Gestionnaire de processus** (PM2, systemd)
4. **SSL/HTTPS** pour la sécurité

## 📄 Licence

MIT - Voir le fichier LICENSE pour plus de détails.

---

**Développé pour le projet AgroFlow** 🌱
