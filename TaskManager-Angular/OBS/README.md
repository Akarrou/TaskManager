# OBS - Conteneurisation de TaskManager-Angular

Ce dossier contient tout le nécessaire pour builder et servir l'application Angular dans un container Docker avec **pnpm** et **Node.js 22.16.0**.

## Prérequis
- Docker installé

## Build de l'image

```sh
docker build -t taskmanager-angular -f OBS/Dockerfile .
```

## Lancer le container

```sh
docker run --rm -p 8080:80 taskmanager-angular
```

L'application sera accessible sur [http://localhost:8080](http://localhost:8080)

## Détails techniques
- Utilise `pnpm` pour l'installation et le build (plus rapide et fiable).
- Utilise `node:22.16.0` pour le build.
- Utilise `nginx` pour servir le build Angular (production ready).
- Le build Angular est fait dans `/app/dist/TaskManager-Angular` puis copié dans nginx.

## Personnalisation nginx (optionnel)
Vous pouvez ajouter un fichier `nginx.conf` dans ce dossier et décommenter la ligne correspondante dans le Dockerfile pour une configuration avancée. 