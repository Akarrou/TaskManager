# 5. Guide de Déploiement

## 🚢 Processus de Déploiement avec Docker

Le projet inclut un `Dockerfile` dans le dossier `OBS/` qui permet de construire une image Docker de l'application Angular pour la production.

### Construction de l'image Docker

1.  Placez-vous à la racine du projet (`TaskManager-Angular`).
2.  Exécutez la commande de build Docker :
    ```bash
    docker build . -f OBS/Dockerfile -t taskmanager-angular
    ```

### Lancement du conteneur

Une fois l'image construite, vous pouvez lancer un conteneur :

```bash
docker run -d -p 80:80 taskmanager-angular
```

L'application sera alors accessible sur le port 80 de votre machine hôte.

## 🔧 Variables d'Environnement

Pour que l'application en production puisse se connecter à Supabase, les variables d'environnement doivent être fournies au moment du build de l'image Docker. Le `Dockerfile` s'attend à recevoir les arguments `SUPABASE_URL` et `SUPABASE_KEY`.

Vous pouvez les passer lors du build :

```bash
docker build . -f OBS/Dockerfile \
  --build-arg SUPABASE_URL=VOTRE_URL_SUPABASE \
  --build-arg SUPABASE_KEY=VOTRE_CLE_SUPABASE \
  -t taskmanager-angular
```
