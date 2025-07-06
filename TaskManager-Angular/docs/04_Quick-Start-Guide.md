# 4. Guide de Démarrage Rapide

## 📋 Prérequis

- **Node.js**: Il est recommandé d'utiliser `nvm` pour gérer la version de Node.js. Le projet est configuré pour utiliser la version `22.16.0`.
- **pnpm**: Le projet utilise `pnpm` comme gestionnaire de paquets.

## 🚀 Lancement en Développement

1.  **Clonez le repository** :

    ```bash
    git clone [URL_DU_REPO]
    ```

2.  **Placez-vous dans le bon dossier** :

    ```bash
    cd TaskManager-Angular
    ```

3.  **Configurez la bonne version de Node.js** [[memory:413473]]:

    ```bash
    nvm use 22.16.0
    ```

4.  **Installez les dépendances** [[memory:2254613]]:

    ```bash
    pnpm install
    ```

5.  **Configurez les variables d'environnement Supabase** :
    Créez un fichier `src/environments/environment.ts` et `src/environments/environment.prod.ts` en vous basant sur les fichiers `.example` et remplissez les clés d'API Supabase.

6.  **Lancez le serveur de développement** :
    ```bash
    pnpm start
    ```

## ✅ Vérification

L'application doit être accessible sur `http://localhost:4010`. Le hot-reloading est activé [[memory:413502]].
