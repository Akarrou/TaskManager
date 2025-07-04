# 4. Guide de Démarrage Rapide

## 📋 Prérequis

- **Node.js**: v20.11.0 ou supérieure
- **pnpm**: `npm install -g pnpm`

## 🚀 Lancement en Développement

1.  **Cloner le repository** :

    ```bash
    git clone <URL_DU_REPO>
    cd TaskManager-Angular
    ```

2.  **Installer les dépendances** :

    ```bash
    pnpm install
    ```

3.  **Configurer les variables d'environnement** :

    - Créer un fichier `src/environments/environment.ts` et `src/environments/environment.development.ts` en vous basant sur `src/environments/environment.example.ts`.
    - Renseigner vos clés d'API Supabase :
      ```typescript
      export const environment = {
        production: false,
        supabaseUrl: "VOTRE_URL_SUPABASE",
        supabaseKey: "VOTRE_CLE_ANON_SUPABASE",
      };
      ```

4.  **Lancer le serveur de développement** :
    ```bash
    pnpm start
    ```

## ✅ Vérification

L'application doit être accessible sur `http://localhost:4200`.
