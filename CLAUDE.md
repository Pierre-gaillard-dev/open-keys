# Open Keys

Application d'apprentissage du piano en mode *falling notes* (PWA React + API Hono/SQLite, monorepo pnpm).

## Documentation de référence — à lire avant toute tâche

- `docs/01-cadrage.md` — périmètre, décisions (D1…), risques
- `docs/02-use-cases.md` — cas d'utilisation (UC-xx)
- `docs/03-architecture/` — contexte, stack, **arborescence** et règles d'import, moteur du lecteur, flux, API, déploiement, sécurité, tests (sommaire dans `README.md`)
- `docs/04-database.md` + `docs/database.dbml` — schéma de base de données et règles de synchronisation
- `docs/05-roadmap.md` — phases et tâches (une PR = une fonctionnalité complète, pas une tâche isolée)
- `docs/06-conventions.md` — **conventions de code, à respecter strictement**

## Commandes

- `pnpm dev` : web (5173) + API (3000), avec `/api` proxifié.
- `pnpm verify` : lint, types, règles d'architecture, tests, build. **Doit passer avant toute PR.**
- `pnpm check` : corrige le formatage et les imports (Biome).
- Schéma de base modifié → `pnpm --filter @open-keys/server db:generate` (migration) puis `db:dbml` (doc). `pnpm db:check` (CI) vérifie que les deux sont à jour.

## Règles clés

- Découpage par feature ; un fichier = un rôle (`*.routes.ts`, `*.service.ts`, `*.queries.ts`, `*.schema.ts`…).
- `packages/core` reste pur (pas de DOM, pas de Node, pas d'I/O).
- Une feature n'importe une autre feature que via son `index.ts`.
- Lecteur : aucun état mis à jour à chaque image dans React ; une seule horloge (l'horloge audio).
- Toute décision d'architecture non triviale est reportée dans `docs/`.
- Tester sur Firefox **et** Chromium.
- Ne jamais commiter de secrets ni de MIDI sous droits d'auteur.
- Langue : la documentation est en français ; le code, les identifiants et les commits sont en anglais.
