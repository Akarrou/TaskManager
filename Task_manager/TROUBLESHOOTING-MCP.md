# Dépannage MCP Playwright

## Problème : "Failed to create client" ou "no tools"

### Étape 1 : Vérifier la configuration de base

Votre configuration actuelle dans `~/.cursor/mcp.json` :

```json
{
  "mcpServers": {
    "playwright": {
      "type": "stdio", 
      "command": "bash",
      "args": [
        "-c",
        "export NVM_DIR=\"$HOME/.nvm\" && [ -s \"$NVM_DIR/nvm.sh\" ] && \\. \"$NVM_DIR/nvm.sh\" && nvm use 22 && npx @playwright/mcp@latest --browser=chrome --caps=core --output-dir=/tmp/playwright-mcp-output"
      ],
      "env": {}
    }
  }
}
```

### Étape 2 : Redémarrer complètement Cursor

1. Fermez complètement Cursor (Cmd+Q sur Mac)
2. Attendez 5 secondes
3. Relancez Cursor
4. Ouvrez votre projet

### Étape 3 : Vérifier les serveurs MCP dans Cursor

1. Dans Cursor, ouvrez la palette de commandes (Cmd+Shift+P)
2. Cherchez "MCP" ou "Model Context Protocol"
3. Vérifiez que "playwright" apparaît dans la liste des serveurs

### Étape 4 : Diagnostic manuel

Testez la commande manuellement dans le terminal :

```bash
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" && nvm use 22 && npx @playwright/mcp@latest --browser=chrome --caps=core --output-dir=/tmp/playwright-mcp-output
```

Cette commande doit démarrer le serveur sans erreur.

### Étape 5 : Configuration alternative

Si le problème persiste, essayez cette configuration plus directe :

```json
{
  "mcpServers": {
    "playwright": {
      "type": "stdio",
      "command": "/Users/jeromevalette/.nvm/versions/node/v22.16.0/bin/npx",
      "args": [
        "@playwright/mcp@latest",
        "--browser=chrome",
        "--caps=core",
        "--output-dir=/tmp/playwright-mcp-output"
      ],
      "env": {
        "NODE_VERSION": "22"
      }
    }
  }
}
```

### Étape 6 : Debug avec logs

Ajoutez des logs pour diagnostiquer :

```json
{
  "mcpServers": {
    "playwright": {
      "type": "stdio",
      "command": "bash",
      "args": [
        "-c",
        "export NVM_DIR=\"$HOME/.nvm\" && [ -s \"$NVM_DIR/nvm.sh\" ] && \\. \"$NVM_DIR/nvm.sh\" && nvm use 22 && npx @playwright/mcp@latest --browser=chrome --caps=core --output-dir=/tmp/playwright-mcp-output"
      ],
      "env": {
        "DEBUG": "mcp:*"
      }
    }
  }
}
```

### Étape 7 : Vérifications système

1. **Node.js 22 disponible** :
   ```bash
   nvm list | grep v22
   ```

2. **Package MCP Playwright installable** :
   ```bash
   npx @playwright/mcp@latest --version
   ```

3. **Dossier de sortie accessible** :
   ```bash
   mkdir -p /tmp/playwright-mcp-output && echo "OK"
   ```

### Solutions communes

#### Solution A : Réinstaller le package
```bash
npm cache clean --force
npx clear-npx-cache
npx @playwright/mcp@latest --version
```

#### Solution B : Permissions
```bash
chmod 755 /tmp/playwright-mcp-output
```

#### Solution C : Version de Node.js
Si Node.js 22 pose problème, essayez avec Node.js 20 :
```json
"nvm use 20 && npx @playwright/mcp@latest..."
```

### Test final

Une fois configuré, redémarrez Cursor et testez en me demandant :
```
"Utilise MCP Playwright pour naviguer sur Google"
```

Si je réponds avec des actions Playwright, c'est que ça fonctionne !

### Logs utiles

- Logs Cursor : `~/Library/Logs/Cursor/`
- Logs MCP : Variables d'environnement `DEBUG=mcp:*`
- Logs Playwright : Variables d'environnement `DEBUG=playwright:*` 