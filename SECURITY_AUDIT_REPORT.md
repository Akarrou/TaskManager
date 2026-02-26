# Rapport d'Audit de Sécurité — Kodo TaskManager

**Date** : 26 février 2026
**Périmètre** : Serveur MCP (`kodo-mcp-server` v0.3.1), Application Angular (Angular 20), Base de données Supabase (68 migrations)
**Auditeur** : Claude Code (analyse statique automatisée multi-agents)

---

## Résumé Exécutif

Cet audit couvre l'ensemble de la stack Kodo TaskManager : le serveur MCP (83+ outils), l'application Angular frontend, et la couche base de données Supabase (68 migrations). **4 agents spécialisés** ont analysé en parallèle le code source, les configurations, et les dépendances.

### Tableau Récapitulatif Global

| Sévérité | MCP Server | Angular App | Supabase DB | Dépendances | Total |
|----------|-----------|-------------|-------------|-------------|-------|
| Critique | 2 | 2 | 2 | — | **6** |
| Haute | 7 | 4 | 6 | 23 | **40** |
| Moyenne | 10 | 7 | 8 | 11 | **36** |
| Basse | 5 | 5 | 3 | 3 | **16** |
| Info (+) | 2 | 8 | 2 | — | **12** |

### Score de Risque Global : **CRITIQUE**

Deux catégories de vulnérabilités critiques se cumulent :
1. **Injection SQL** via les fonctions SECURITY DEFINER (`add_column_to_table`, `create_dynamic_table`) — exécution de SQL arbitraire avec privilèges superuser
2. **Contournement d'autorisation complet** — le serveur MCP utilise la clé service role sans vérification d'identité, et les fonctions DB acceptent des `user_id` non vérifiés

---

## PARTIE 1 — SERVEUR MCP

### Critiques

#### C1. Clé Service Role bypasse toute sécurité RLS
- **Fichiers** : `mcp-server/src/supabase-client.ts:1-14`, `mcp-server/src/config.ts`
- **Description** : Le serveur utilise `SUPABASE_SERVICE_ROLE_KEY` qui contourne **toutes** les politiques RLS. Aucune isolation des données entre utilisateurs.
- **Impact** : Accès complet à toutes les données de tous les utilisateurs.
- **Correction** : JWT par utilisateur ou vérifications d'autorisation applicatives systématiques.

#### C2. Aucune vérification d'identité — race condition sur le contexte utilisateur
- **Fichiers** : `mcp-server/src/services/user-auth.ts:28,88-97`
- **Description** : Le `currentRequestUser` est stocké comme **variable globale mutable**. En HTTP multi-utilisateurs, les requêtes concurrentes écrasent ce contexte — l'utilisateur A peut exécuter des opérations en tant qu'utilisateur B.
- **Impact** : Escalade de privilèges silencieuse sous charge.
- **Correction** : Utiliser `AsyncLocalStorage` (Node.js) pour un contexte par requête thread-safe.

### Hautes

| # | Vulnérabilité | Fichier(s) |
|---|---------------|------------|
| H1 | **Auth désactivée par défaut** — `.env` contient `AUTH_ENABLED=false` et `AUTH_PASSWORD=changeme` | `.env:8-10` |
| H2 | **Tools utilisateurs exposent toutes les données** — `list_users`, `get_user` retournent les emails de tous les utilisateurs sans contrôle d'accès | `users.ts:19-89` |
| H3 | **Aucune vérification de propriété** sur `get_project`, `update_project`, `delete_project`, `archive_project`, `restore_project` | `projects.ts:97-409` |
| H4 | **Stockage OAuth en mémoire** — tokens, codes d'autorisation et clients dans des `Map` sans persistence ni limite de taille | `services/oauth.ts:66-69` |
| H5 | **10 vulnérabilités de dépendances** — 3 hautes (hono JWT confusion, qs DoS), 5 modérées (hono XSS/SSRF/redirect, ajv ReDoS) | `package.json` |
| H6 | **add_comment permet l'usurpation** — accepte `user_id` en paramètre au lieu d'utiliser `getCurrentUserId()` | `comments.ts:87-146` |
| H7 | **Resources MCP sans filtrage utilisateur** — `kodo://projects`, `kodo://project/{id}` retournent les données de tous les utilisateurs | `resources/index.ts:9-270` |

### Moyennes

| # | Vulnérabilité | Fichier(s) |
|---|---------------|------------|
| M1 | Registration OAuth client sans authentification — création illimitée de clients | `routes/oauth.ts:658-708` |
| M2 | Support PKCE `plain` (devrait être uniquement `S256`) | `services/oauth.ts:236-238` |
| M3 | `readBody()` OAuth sans limite de taille (bypass du `MAX_BODY_SIZE` du serveur HTTP) | `routes/oauth.ts:29-35` |
| M4 | Headers `X-Forwarded-*` acceptés sans validation du proxy | `routes/oauth.ts:46-49` |
| M5 | Noms de tables dynamiques construits depuis des données utilisateur | Multiples fichiers tools |
| M6 | `cleanup_snapshots` supprime les snapshots de tous les utilisateurs | `snapshots.ts:82-106` |
| M7 | `delete_comment` sans vérification de propriété | `comments.ts:160-208` |
| M8 | `DEFAULT_USER_ID` dans `.env` accorde l'accès complet quand auth est off | `.env:14` |
| M9 | Aucun audit logging | Tous les fichiers |
| M10 | Erreurs Supabase parfois exposées (noms de tables, colonnes) | Divers |

### Basses

| # | Vulnérabilité |
|---|---------------|
| L1 | Refresh tokens OAuth sans expiration ni nettoyage |
| L2 | Rate limiting IP-only (pas per-user) |
| L3 | Pas de rate limiting spécifique pour échecs d'authentification |
| L4 | Pas d'enforcement HTTPS |
| L5 | Source maps en production |

---

## PARTIE 2 — APPLICATION ANGULAR

### Critiques

#### C3. Package `xlsx` (SheetJS) — Prototype Pollution + ReDoS, aucun patch disponible
- **Fichier** : `package.json` — `xlsx` v0.18.5
- **Description** : 2 vulnérabilités HIGH sans correctif (`<0.0.0`). SheetJS est passé en closed-source. Un fichier Excel crafté peut déclencher un prototype pollution ou un DoS dans le navigateur.
- **Correction** : Migrer vers `exceljs` ou `SheetJS Pro`.

#### C4. `@angular/ssr` SSRF et Header Injection
- **Fichier** : `package.json` — `@angular/ssr` <20.3.17
- **Description** : Vulnérabilité SSRF directement exploitable car l'app a SSR configuré (`app.config.server.ts`, `main.server.ts`).
- **Correction** : `pnpm update @angular/ssr` vers >=20.3.17.

### Hautes

#### H8. XSS via Angular core/compiler — SVG Script Attributes
- **Fichier** : `@angular/core` et `@angular/compiler` <20.3.16
- **Description** : Le sanitizer Angular ne nettoie pas les attributs script dans les SVG.
- **Correction** : `pnpm update @angular/core @angular/compiler` vers >=20.3.16.

#### H9. XSS dans le tooltip Mindmap via `[innerHTML]`
- **Fichiers** : `mindmap-block.component.html:303`, `mindmap-block.component.ts:712-731`
- **Description** : `buildTooltipContent()` convertit du contenu utilisateur (Markdown) en HTML **sans échappement préalable**. Les event handlers (`onerror`, `onload`) ne sont pas supprimés par `[innerHTML]`.
- **Correction** : Échapper les entités HTML avant les transformations Markdown, ou utiliser `DomSanitizer.sanitize()`.

#### H10. XSS dans le Rich Text Editor via `javascript:` URLs
- **Fichiers** : `rich-text-editor.component.html:125`, `rich-text-editor.component.ts:228`
- **Description** : La regex de conversion des liens Markdown génère `<a href="$2">` sans valider le schéma URL. `[click me](javascript:alert(1))` passe.
- **Correction** : Valider que les URLs commencent par `http://` ou `https://`.

#### H11. Pas de Content Security Policy ni headers de sécurité
- **Fichiers** : `OBS/nginx.conf`, `OBS/Caddyfile`
- **Description** : Aucun header de sécurité (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy).
- **Correction** : Ajouter les headers dans la configuration Caddy.

### Moyennes

| # | Vulnérabilité | Fichier(s) |
|---|---------------|------------|
| M11 | Pas de politique de force de mot de passe au signup | `login.component.ts:48-75` |
| M12 | `document.write()` avec contenu Mindmap non sanitisé | `document-export.service.ts:23,322` |
| M13 | MCP Basic Auth utilise le mot de passe réel de l'utilisateur | `profile-page.component.ts:113-118` |
| M14 | Validation MIME des uploads côté client uniquement | `file-dropzone.component.ts`, `file-upload.component.ts` |
| M15 | Formulaire login utilise `FormsModule` au lieu de `ReactiveFormsModule` | `login.component.ts:12` |
| M16 | Données sensibles dans SignalStore accessibles via DevTools | Fichiers stores |
| M17 | Pas de timeout de session / inactivité | `supabase.service.ts` |

### Basses

| # | Vulnérabilité |
|---|---------------|
| L6 | 319 occurrences de `console.log/error/warn` dans 45+ fichiers |
| L7 | `err: any` dans catch blocks (viole strict mode) |
| L8 | Pas de rate limiting côté Caddy |
| L9 | IP du VPS hardcodée dans le script de deploy |
| L10 | Credentials en plaintext dans `/root/supabase-credentials.txt` sur le VPS |

### Points Positifs (Angular)

| Observation |
|-------------|
| Aucun usage de `bypassSecurityTrust*` trouvé dans le codebase |
| OAuth state correctement validé dans `GoogleCalendarAuthService` |
| Auth guard appliqué systématiquement sur toutes les routes protégées |
| Injection d'environnement runtime en production (via Docker entrypoint) |
| Noms de fichiers sanitisés dans `StorageService.generateUniqueFileName()` |
| Dialog de liens externes valide le schéma URL (`http://`/`https://`) |
| HTML correctement échappé dans `DocumentExportService.escapeHtml()` |
| Pas de CSRF traditionnel grâce à l'auth JWT Supabase (pas de cookies) |

---

## PARTIE 3 — BASE DE DONNÉES SUPABASE

### Critiques

#### C5. Injection SQL via `column_type` dans `add_column_to_table`
- **Fichier** : `20251211000001_add_add_column_to_table.sql:17`
- **Description** : Le paramètre `column_type` utilise `%s` (non échappé) dans `EXECUTE format()` dans une fonction SECURITY DEFINER. Un attaquant peut exécuter du SQL arbitraire avec les privilèges `postgres` :
  ```sql
  EXECUTE format('ALTER TABLE %I ADD COLUMN %I %s', table_name, column_name, column_type);
  -- Payload: column_type = 'TEXT; DROP TABLE projects CASCADE; --'
  ```
- **Impact** : **Exécution de SQL arbitraire** avec privilèges superuser.
- **Correction** : Valider `column_type` contre une whitelist (`TEXT`, `NUMERIC`, `DATE`, `BOOLEAN`, `TIMESTAMPTZ`, `JSONB`).

#### C6. Injection SQL via `col->>'type'` dans `create_dynamic_table`
- **Fichier** : `20251212000006_add_create_dynamic_table.sql:28`
- **Description** : Même vulnérabilité — le type de colonne du JSONB est concaténé sans validation :
  ```sql
  column_def := quote_ident(col->>'name') || ' ' || (col->>'type');
  ```
- **Correction** : Valider le type contre une whitelist avant la concaténation.

### Hautes

| # | Vulnérabilité | Fichier(s) |
|---|---------------|------------|
| H12 | **`delete_dynamic_table` peut DROP n'importe quelle table** — tout utilisateur authentifié peut supprimer `projects`, `documents`, etc. via RPC | `20251212000008_add_delete_dynamic_table.sql:5-27` |
| H13 | **`add/delete_column_to_table` sans restriction** — peut modifier le schéma de n'importe quelle table | `20251211000001`, `20251211000002` |
| H14 | **`mcp_snapshots` RLS `USING(true)`** — tout utilisateur peut lire/modifier tous les snapshots | `20260222000001_create_mcp_snapshots.sql:22-26` |
| H15 | **`validate_api_token` accessible à `anon`** — permet le brute-force de tokens API sans authentification | `20251230000001_create_user_api_tokens.sql:260` |
| H16 | **`reload_schema_cache` accessible à `anon`** — DoS par rechargements PostgREST répétés | `20251216000001_add_reload_schema_cache.sql:17` |
| H17 | **`delete_database_cascade` sans vérification de propriété** | `20251211000005_add_delete_database_cascade.sql` |

### Moyennes

| # | Vulnérabilité | Fichier(s) |
|---|---------------|------------|
| M18 | Tables dynamiques (`ensure_table_exists`) sans RLS — accès cross-utilisateur | `20260227000002_enable_realtime_dynamic_tables.sql` |
| M19 | `block_comments` INSERT/UPDATE/DELETE sans vérifier l'accès au document | `20251217000001`, `20251222000001` |
| M20 | Buckets storage sans scoping par utilisateur — tout authentifié peut lire/écrire/supprimer | `20251214000002`, `20251214000003` |
| M21 | Fonctions SECURITY DEFINER accessibles via PUBLIC par défaut | Multiples migrations |
| M22 | `soft_delete_item` — `p_item_table` contrôlable par le client | `20260226000001_fix_security_and_types.sql:153-235` |
| M23 | `notify_invitation_email` expose le service_role_key dans une requête HTTP | `20251212140000_add_email_notification_trigger.sql:35` |
| M24 | Google OAuth tokens — encryption côté app seulement, pas de vérification DB | `20260224000001_create_google_calendar_tables.sql:13-14` |
| M25 | Soft-deleted records visibles via RLS (pas de filtre `deleted_at IS NULL`) | Multiples tables |

### Basses

| # | Vulnérabilité |
|---|---------------|
| L11 | `documents.user_id` nullable — documents potentiellement orphelins |
| L12 | `projects.owner_id` nullable — projets potentiellement invisibles |
| L13 | `schema_migrations` sans RLS — fuite d'information sur l'infrastructure |

---

## PARTIE 4 — AUDIT DES DÉPENDANCES

### Application Angular — 28 vulnérabilités

| Sévérité | Package | Vulnérabilité | Patch |
|----------|---------|---------------|-------|
| **CRITICAL** | `@angular/ssr` | SSRF + Header Injection | >=20.3.17 |
| **HIGH** | `xlsx` (x2) | Prototype Pollution + ReDoS | **Aucun** |
| **HIGH** | `@angular/core` | XSS via SVG | >=20.3.16 |
| **HIGH** | `@angular/compiler` | XSS via SVG | >=20.3.16 |
| **HIGH** | `@modelcontextprotocol/sdk` (x2) | ReDoS + Data leak | >=1.26.0 |
| **HIGH** | `tar` (x4) | Path traversal, symlink poisoning | >=7.5.8 |
| **HIGH** | `rollup` | Path traversal file write | >=4.59.0 |
| **HIGH** | `@isaacs/brace-expansion` | Resource exhaustion | >=5.0.1 |
| **HIGH** | `qs` | DoS memory exhaustion | >=6.14.1 |
| **HIGH** | `minimatch` (x3) | ReDoS | >=3.1.3 / 9.0.6 / 10.2.1 |
| MODERATE | `lodash-es` | Prototype Pollution | >=4.17.23 |
| MODERATE | `markdown-it` | ReDoS | >=14.1.1 |
| MODERATE | `ajv` (x2) | ReDoS | >=6.14.0 / 8.18.0 |
| MODERATE | `@angular/ssr` | Open Redirect | >=20.3.17 |
| LOW | `qs` | DoS comma parsing | >=6.14.2 |

### Serveur MCP — 10 vulnérabilités

| Sévérité | Package | Vulnérabilité | Patch |
|----------|---------|---------------|-------|
| **HIGH** | `hono` (x2) | JWT algorithm confusion + token forgery | >=4.11.4 |
| **HIGH** | `qs` | DoS memory exhaustion | >=6.14.1 |
| MODERATE | `hono` (x4) | XSS, cache deception, IPv4 bypass, key read | >=4.11.7 |
| MODERATE | `ajv` | ReDoS | >=8.18.0 |
| LOW | `qs` | DoS comma parsing | >=6.14.2 |
| LOW | `hono` | Timing attack basicAuth/bearerAuth | >=4.11.10 |

### Actions immédiates

1. **Angular** : `pnpm update @angular/core @angular/compiler @angular/ssr` (corrige 3 vulns critiques/hautes)
2. **Angular** : Remplacer `xlsx` par `exceljs` (2 vulns hautes sans patch)
3. **MCP** : `pnpm update hono` vers >=4.11.10 (corrige 6 vulns)
4. **MCP** : Mettre à jour `@modelcontextprotocol/sdk` (corrige `qs` et `ajv` transitives)

---

## PLAN DE REMÉDIATION PRIORITAIRE

### Phase 1 — Immédiat (Critiques + Hautes critiques)

| # | Action | Effort |
|---|--------|--------|
| 1 | **Corriger les injections SQL** : valider `column_type` et `col->>'type'` contre whitelist dans les fonctions SECURITY DEFINER | 1h |
| 2 | **Restreindre `delete_dynamic_table`** à `service_role` + validation de préfixe de table | 30min |
| 3 | **Corriger la race condition** `currentRequestUser` avec `AsyncLocalStorage` dans le MCP | 2h |
| 4 | **Mettre à jour les dépendances** : Angular core/ssr, hono, remplacer xlsx | 2h |
| 5 | **Activer l'auth MCP** : `AUTH_ENABLED=true` par défaut, supprimer le mot de passe par défaut | 30min |
| 6 | **Corriger RLS `mcp_snapshots`** : restreindre au service_role | 15min |
| 7 | **Révoquer `anon`** sur `validate_api_token` et `reload_schema_cache` | 15min |
| 8 | **Ajouter ownership checks** aux fonctions DB SECURITY DEFINER (`search_all`, `get_dashboard_stats`, `restore_project`, etc.) | 2h |

### Phase 2 — Court terme (1-2 semaines)

| # | Action | Effort |
|---|--------|--------|
| 9 | Ajouter des vérifications de propriété à tous les outils MCP (projects, comments, resources) | 4h |
| 10 | Ajouter les headers CSP, HSTS, X-Frame-Options, X-Content-Type-Options dans Caddy | 1h |
| 11 | Corriger les XSS : mindmap tooltip, rich-text-editor links, document-export | 2h |
| 12 | Configurer TipTap Link pour restreindre les protocoles URL | 30min |
| 13 | Ajouter `REVOKE EXECUTE FROM PUBLIC` sur toutes les fonctions SECURITY DEFINER | 1h |
| 14 | Activer RLS sur les tables dynamiques dans `ensure_table_exists` | 1h |
| 15 | Ajouter des restrictions de chemin aux politiques storage buckets | 1h |

### Phase 3 — Moyen terme (1-2 mois)

| # | Action | Effort |
|---|--------|--------|
| 16 | Implémenter un rate limiter per-user dans le MCP | 3h |
| 17 | Migrer le stockage OAuth vers Redis/DB persistant | 4h |
| 18 | Ajouter `AND deleted_at IS NULL` aux politiques RLS | 2h |
| 19 | Centraliser la gestion d'erreurs (ne pas exposer les détails internes) | 3h |
| 20 | Implémenter un audit trail en base de données | 4h |
| 21 | Ajouter des limites `.max()` sur les tableaux Zod et la pagination | 2h |
| 22 | Implémenter un timeout de session/inactivité | 2h |
| 23 | Valider les variables d'environnement au démarrage | 1h |

### Phase 4 — Long terme

| # | Action | Effort |
|---|--------|--------|
| 24 | Supprimer les `console.log` en production (logging service) | 2h |
| 25 | Politique de force de mot de passe au signup | 1h |
| 26 | Désactiver les source maps en production | 15min |
| 27 | Rate limiting côté Caddy pour l'authentification | 1h |
| 28 | Migrer MCP Basic Auth vers le système de tokens API | 2h |

---

## Annexe : Méthodologie

- **Type d'analyse** : Analyse statique automatisée multi-agents du code source
- **Agents déployés** :
  1. Agent Serveur MCP — analyse de tous les fichiers `mcp-server/src/`
  2. Agent Application Angular — analyse de tous les fichiers `TaskManager-Angular/src/`
  3. Agent Base de données Supabase — analyse des 68 fichiers de migration SQL
  4. Agent Dépendances — `pnpm audit` + `npm audit`
- **Couverture** : ~100% des fichiers sources, configurations, et scripts de déploiement
- **Limites** : Analyse statique uniquement. Un test de pénétration dynamique est recommandé pour :
  - Valider les injections SQL identifiées dans un environnement sandbox
  - Tester les contournements RLS avec différents rôles Supabase
  - Vérifier l'exploitabilité des XSS dans les navigateurs cibles
  - Mesurer l'impact réel des vulnérabilités de dépendances

---

*Rapport généré par Claude Code (4 agents parallèles) — 26 février 2026*
