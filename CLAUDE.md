# Kodo - TaskManager

## Build & Dev

- **pnpm obligatoire** (pas npm/yarn) : `pnpm install`, `pnpm ng serve`, `pnpm ng build`
- Node 22.16.0 via NVM : `nvm use` avant toute commande
- MCP Server : `cd mcp-server && npm run build` (TypeScript compilation)
- Migrations Supabase : `TaskManager-Angular/supabase/migrations/`

## Stack

- Angular 20, Angular Material 20, Tailwind CSS, Zoneless (`provideZonelessChangeDetection`)
- NgRx Store classique (projects, documents) + NgRx SignalStore (calendar, document-tabs, dashboard-stats, fab)
- Supabase (auth, DB, storage), TipTap 3 (rich-text editor), FullCalendar 6 (calendrier)
- Cytoscape (mindmaps), HyperFormula (spreadsheets), Chart.js (graphiques)
- MCP Server : `kodo-mcp-server` v0.3.0 (83 outils, Supabase service role, OAuth 2.0)

## Code Style

- Composants : TOUJOURS `standalone: true`, fichiers separés (.ts, .html, .scss) — JAMAIS `template:` ou `styles:` inline
- JAMAIS de type `any` — strict mode obligatoire
- Injection via `inject()`, pas de constructor injection
- Imports : Angular > RxJS > Libs externes > Projet > Relatifs
- Tailwind CSS en priorite, Angular Material apparence `outline` pour `mat-form-field`
- JAMAIS de manipulation DOM directe avec `ElementRef`

## State Management

- **NgRx SignalStore** est le pattern prefere pour tout nouveau store
- NgRx Store classique (projects, documents) existe mais ne doit pas etre etendu — migrer vers SignalStore si modification majeure
- SignalStores existants : `core/stores/` (dashboard-stats, fab), `features/calendar/store/`, `features/documents/store/document-tabs.store.ts`
- Les composants interagissent UNIQUEMENT avec le store, jamais directement avec les services Supabase

## Supabase

- Un service dedie par table dans `core/services/` ou `features/*/services/`
- JAMAIS d'appel direct `supabase.from(...)` depuis un composant
- Formulaires : `ReactiveFormsModule` avec `FormControl` types, validation `Validators`

## Git

- Messages de commit en anglais : `feat:`, `fix:`, `refactor:`, `docs:`
- Feature branches + PR vers `main`

## Outils Claude Code

- IMPORTANT : Utiliser **Glob** (pas `find`/`ls`), **Read** (pas `cat`/`head`/`tail`), **Grep** (pas `grep`/`rg`), **Edit** (pas `sed`/`awk`), **Write** (pas `echo`/`cat <<EOF`)
- Reserver Bash aux commandes systeme uniquement : build, deploy, docker, git, pnpm, node

## Langue

- Code et commits : anglais
- Communication avec l'utilisateur : francais
