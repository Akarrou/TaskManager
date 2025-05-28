# Guide MCP Playwright 

## Configuration

Votre MCP Playwright est configuré dans `/Users/jeromevalette/.cursor/mcp.json` avec les paramètres suivants :

- **Navigateur** : Chrome
- **Mode** : Non-headless (visible) - par défaut
- **Résolution** : 1920x1080
- **Node.js** : Version 22 (via nvm)
- **Traces** : Sauvegardées automatiquement
- **Répertoire de sortie** : `/tmp/playwright-mcp-output`

## ⚠️ Configuration corrigée

**Problème résolu** : L'option `--headless=false` était incorrecte et causait l'erreur "Failed to create client".

**Configuration corrigée** :
```bash
npx @playwright/mcp@latest --browser=chrome --caps=core,tabs,pdf,history,wait,files,testing --isolated --save-trace --viewport-size=1920,1080 --ignore-https-errors --output-dir=/tmp/playwright-mcp-output
```

## Capacités activées

- `core` : Fonctionnalités de base
- `tabs` : Gestion des onglets
- `pdf` : Génération de PDF
- `history` : Historique de navigation
- `wait` : Attentes et synchronisation
- `files` : Gestion des fichiers
- `testing` : Outils de test

## Comment utiliser

### 1. Activer MCP Playwright dans Cursor

Assurez-vous que le serveur MCP Playwright est activé dans Cursor. Il devrait apparaître dans la liste des serveurs MCP disponibles.

### 2. Commandes de base

Une fois MCP Playwright activé, vous pouvez utiliser des commandes comme :

- **Naviguer vers Google et prendre une capture d'écran**
- **Faire une recherche sur Google**
- **Générer un PDF d'une page web**
- **Interagir avec des éléments de page**
- **Attendre le chargement de contenu**

### 3. Exemples d'utilisation

#### Navigation et capture d'écran
```
"Navigue sur Google et prends une capture d'écran"
```

#### Recherche
```
"Va sur Google, cherche 'MCP Playwright' et prends une capture des résultats"
```

#### Génération PDF
```
"Va sur https://example.com et génère un PDF de la page"
```

### 4. Fichiers de sortie

Tous les fichiers générés (captures d'écran, PDF, traces) sont sauvegardés dans :
```
/tmp/playwright-mcp-output/
```

### 5. Avantages du MCP Playwright

- ✅ Pas besoin d'installer Playwright dans le projet
- ✅ Version Node.js appropriée (22) automatiquement utilisée
- ✅ Configuration centralisée
- ✅ Traces automatiques pour le debugging
- ✅ Interface MCP standardisée
- ✅ Isolation des sessions

## Test rapide

Pour tester que tout fonctionne, vous pouvez demander à Cursor :
```
"Utilise MCP Playwright pour aller sur google.com et prendre une capture d'écran"
```

## Debugging

Si vous rencontrez des problèmes :

1. **Erreur "Failed to create client"** :
   - Vérifiez que la syntaxe des options est correcte
   - Pas de `--headless=false`, utilisez `--headless` ou omettez pour mode visible
   - Redémarrez Cursor après modification du mcp.json

2. **Vérifiez Node.js 22** : `nvm list`
3. **Testez manuellement** :
   ```bash
   export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" && nvm use 22 && npx @playwright/mcp@latest --help
   ```
4. **Vérifiez les logs** avec `DEBUG=playwright:api`
5. **Créez le dossier de sortie** : `mkdir -p /tmp/playwright-mcp-output` 