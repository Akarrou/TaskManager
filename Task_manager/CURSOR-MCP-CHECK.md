# Vérification MCP dans Cursor

## Étapes pour vérifier que MCP Playwright est connecté

### 1. Configuration actuelle
Votre fichier `~/.cursor/mcp.json` contient maintenant :
```json
{
  "mcpServers": {
    "playwright": {
      "type": "stdio",
      "command": "/Users/jeromevalette/.nvm/versions/node/v22.16.0/bin/npx",
      "args": [
        "@playwright/mcp@latest",
        "--browser=chrome",
        "--caps=core"
      ],
      "env": {
        "DEBUG": "mcp:*"
      }
    }
  }
}
```

### 2. Redémarrage obligatoire
**IMPORTANT** : Vous DEVEZ redémarrer Cursor complètement :
1. Quittez Cursor (Cmd+Q sur Mac)
2. Attendez 10 secondes
3. Relancez Cursor
4. Ouvrez votre projet

### 3. Vérification dans Cursor

#### Option A : Via la palette de commandes
1. Appuyez sur `Cmd+Shift+P` (Mac) ou `Ctrl+Shift+P` (Windows/Linux)
2. Tapez "MCP" ou "Model Context Protocol"
3. Cherchez des commandes liées aux serveurs MCP

#### Option B : Dans les paramètres
1. Ouvrez les paramètres Cursor (Cmd+,)
2. Cherchez "MCP" ou "Model Context Protocol"
3. Vérifiez que "playwright" apparaît comme serveur connecté

#### Option C : Via l'interface de chat
1. Ouvrez une nouvelle conversation
2. Regardez si des outils sont disponibles dans l'interface
3. Cherchez des indications de serveurs MCP connectés

### 4. Test de fonctionnement

Une fois Cursor redémarré, essayez cette phrase exacte :
```
"Utilise MCP Playwright pour aller sur google.com et prendre une capture d'écran"
```

### 5. Signes que ça fonctionne

✅ **Bonnes signes** :
- L'assistant mentionne qu'il va utiliser des outils Playwright
- Vous voyez des appels de fonctions dans la réponse
- Une fenêtre de navigateur s'ouvre automatiquement
- Des fichiers sont créés dans `/tmp/playwright-mcp-output/`

❌ **Signes de problème** :
- Message "no tools available"
- L'assistant dit qu'il ne peut pas accéder aux outils MCP
- Aucune action de navigateur ne se produit

### 6. Debug avancé

Si le problème persiste, vérifiez les logs :

#### Logs Cursor (macOS)
```bash
tail -f ~/Library/Logs/Cursor/renderer.log
```

#### Test manuel du serveur
```bash
/Users/jeromevalette/.nvm/versions/node/v22.16.0/bin/npx @playwright/mcp@latest --browser=chrome --caps=core
```

### 7. Configurations alternatives à essayer

#### A. Avec plus de capacités :
```json
"args": [
  "@playwright/mcp@latest",
  "--browser=chrome", 
  "--caps=core,tabs,files"
]
```

#### B. Avec répertoire de sortie :
```json
"args": [
  "@playwright/mcp@latest",
  "--browser=chrome",
  "--caps=core",
  "--output-dir=/tmp/playwright-mcp-output"
]
```

#### C. Sans debug :
```json
"env": {}
```

### 8. Résolution des problèmes courants

**Problème** : "Command not found"
**Solution** : Vérifiez que le chemin vers npx existe :
```bash
ls -la /Users/jeromevalette/.nvm/versions/node/v22.16.0/bin/npx
```

**Problème** : "Permission denied"
**Solution** : Ajoutez les permissions d'exécution :
```bash
chmod +x /Users/jeromevalette/.nvm/versions/node/v22.16.0/bin/npx
```

**Problème** : Cursor ne détecte pas le serveur
**Solution** : Essayez de supprimer et recréer le fichier mcp.json

### 9. Derniers recours

1. **Redémarrer complètement le Mac**
2. **Réinstaller Cursor**
3. **Utiliser une configuration MCP différente**

---

**N'oubliez pas** : Le redémarrage complet de Cursor est OBLIGATOIRE après chaque modification du fichier mcp.json ! 