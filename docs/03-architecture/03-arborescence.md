# Open Keys — Architecture : Arborescence

[← Sommaire](./README.md)

```
open-keys/
├── apps/
│   ├── web/                                  # PWA React
│   │   ├── public/
│   │   │   ├── samples/salamander/           # 30 échantillons MP3 (≈ 2 Mo) + LICENSE.md (CC-BY 3.0)
│   │   │   └── icons/                        # icônes de la PWA (SVG source + PNG 192/512, maskable, Apple)
│   │   ├── src/
│   │   │   ├── main.tsx                      # point d'entrée : CSS global + createApp()
│   │   │   ├── app/                          # assemblage de l'application
│   │   │   │   ├── create-app.ts             # QueryClient + routeur ; un 401 n'importe où renvoie à la connexion
│   │   │   │   ├── query-client.ts           # pas de nouvel essai sur 4xx, gestion du 401
│   │   │   │   ├── router.tsx                # routes typées (TanStack Router), garde d'authentification
│   │   │   │   ├── layout/AppShell.tsx       # barre du haut (pas de barre latérale) + page courante
│   │   │   │   ├── pwa/                      # Service Worker : enregistrement, store, bannière de mise à jour
│   │   │   │   ├── offline/                  # indicateur de synchro, favoris gardés sur l'appareil
│   │   │   │   ├── global.css                # Tailwind v4 : jetons de couleurs et polices
│   │   │   │   └── app-flows.test.tsx        # parcours complets : app réelle + API simulée
│   │   │   ├── features/
│   │   │   │   ├── auth/
│   │   │   │   │   ├── api/
│   │   │   │   │   │   ├── auth.api.ts       # appels HTTP (client fetch typé par les contrats)
│   │   │   │   │   │   └── auth.queries.ts   # hooks TanStack Query
│   │   │   │   │   ├── pages/LoginPage.tsx
│   │   │   │   │   └── index.ts              # API publique de la feature
│   │   │   │   ├── catalog/
│   │   │   │   │   ├── api/                  # catalog.api.ts, catalog.queries.ts (clés « songs »)
│   │   │   │   │   ├── catalog-search.ts     # état du catalogue dans l'URL → paramètres d'API
│   │   │   │   │   ├── components/           # SongCard, SongCover (couverture générée), CatalogFilters
│   │   │   │   │   ├── pages/                # CatalogPage, SongDetailPage
│   │   │   │   │   └── index.ts
│   │   │   │   ├── import/
│   │   │   │   │   ├── api/                  # import.api.ts, import.queries.ts (import, validation, couvertures)
│   │   │   │   │   ├── song-form.ts          # modèle du formulaire, validé par les contrats
│   │   │   │   │   ├── components/           # SongEditor, TrackHandsEditor, CoverPicker, TagsInput
│   │   │   │   │   ├── pages/                # ImportPage, ImportReviewPage, SongEditPage (même éditeur)
│   │   │   │   │   └── index.ts
│   │   │   │   ├── library/                  # statut et favori (mise à jour optimiste)
│   │   │   │   ├── player/
│   │   │   │   │   ├── api/player.queries.ts # MIDI → timeline (parsing core + répartition des mains), en cache
│   │   │   │   │   ├── engine/
│   │   │   │   │   │   ├── song-clock.ts     # horloge unique : ancre audio ↔ partition, compensation de latence
│   │   │   │   │   │   ├── note-scheduler.ts # programmation anticipée (150 ms), boucle, mains muettes
│   │   │   │   │   │   └── player-engine.ts  # façade : play / pause / seek / setRate / setLoop
│   │   │   │   │   ├── audio/piano-sampler.ts # Web Audio natif, échantillons Salamander (D17)
│   │   │   │   │   ├── renderer/
│   │   │   │   │   │   ├── falling-notes-renderer.ts # PixiJS : notes, clavier, repères C, mains masquables, zoom
│   │   │   │   │   │   └── keyboard-layout.ts        # géométrie des touches, plage visible (zoom)
│   │   │   │   │   ├── controller/player-controller.ts # seul point d'action de l'UI : moteur + rendu + store
│   │   │   │   │   ├── stores/player.store.ts         # état affiché (Zustand vanilla, ≤ 10 mises à jour/s)
│   │   │   │   │   ├── practice/session-tracker.ts    # temps de lecture effective, plage de vitesses
│   │   │   │   │   ├── runtime/browser-runtime.ts     # AudioContext + WebGL (remplacé par des faux en test)
│   │   │   │   │   ├── hooks/                # runtime, session, sauvegarde, masquage auto, wake lock, plein écran, raccourcis
│   │   │   │   │   ├── components/           # PlayerView, ControlsOverlay, ProgressBar, HandControl, LoopPanel
│   │   │   │   │   ├── pages/PlayerPage.tsx
│   │   │   │   │   ├── input/                # V2 : InputSource, WebMidiInput, ScreenKeyboardInput
│   │   │   │   │   └── index.ts
│   │   │   │   ├── practice/
│   │   │   │   │   ├── api/                  # practice.api.ts, practice.queries.ts
│   │   │   │   │   ├── components/           # PracticeSummary (statistiques, boucles)
│   │   │   │   │   └── index.ts
│   │   │   │   └── settings/
│   │   │   └── shared/
│   │   │       ├── api/http-client.ts        # apiRequest() : /api, réponses validées par zod, ApiError
│   │   │       ├── offline/
│   │   │       │   ├── offline-db.ts         # schéma Dexie : midiFiles, outbox, queryCache
│   │   │       │   ├── midi-cache.ts         # MIDI sur l'appareil + version du morceau
│   │   │       │   ├── outbox.ts             # file de PUT idempotents, rejeu, nombre en attente
│   │   │       │   ├── query-persistence.ts  # cache TanStack Query sauvegardé (requêtes gardées)
│   │   │       │   ├── connectivity.ts       # en ligne / hors-ligne partagé, sonde de /api/health
│   │   │       │   └── index.ts              # instances partagées (outbox, midiCache), clearOfflineData
│   │   │       ├── ui/                       # Button, Chip, SegmentedControl, TextField… (sans logique métier)
│   │   │       ├── lib/                      # cx (tailwind-merge), format, use-debounced-value
│   │   │       └── test/                     # (dans src/test) fake-api, fixtures, render-app
│   │   ├── index.html
│   │   └── vite.config.ts
│   │
│   └── server/                               # API Hono
│       ├── src/
│       │   ├── index.ts                      # démarrage : env → stockage → base + migrations → compte initial → serveur → maintenance
│       │   ├── services.ts                   # racine de composition : instancie tous les services (dépendances injectées)
│       │   ├── app.ts                        # middlewares, préfixes protégés, montage des routes, export AppType
│       │   ├── config/env.ts                 # variables d'environnement validées par zod
│       │   ├── db/
│       │   │   ├── client.ts                 # better-sqlite3 + Drizzle, pragmas, migrations au démarrage, types Executor/Transaction
│       │   │   ├── schema.ts                 # ré-exporte les *.schema.ts des features (drizzle-kit, client typé)
│       │   │   └── migrations/               # générées par drizzle-kit, copiées dans dist/ au build
│       │   ├── features/
│       │   │   ├── health/                   # GET /api/health
│       │   │   ├── auth/
│       │   │   │   ├── auth.routes.ts        # handlers HTTP, aussi fins que possible
│       │   │   │   ├── auth.service.ts       # connexion, sessions glissantes, compte initial
│       │   │   │   ├── auth.queries.ts       # accès à la base uniquement
│       │   │   │   ├── auth.schema.ts        # tables Drizzle (users, auth_sessions)
│       │   │   │   ├── auth.middleware.ts    # requireAuth → c.var.user
│       │   │   │   ├── password-hasher.ts    # argon2id (node:crypto), format PHC
│       │   │   │   ├── login-rate-limiter.ts # 5 échecs / 15 min par (client, identifiant)
│       │   │   │   ├── session-cookie.ts
│       │   │   │   └── *.test.ts
│       │   │   ├── songs/                    # catalogue : songs, song_tracks ; songs.mapper.ts (lignes → contrats)
│       │   │   ├── tags/                     # tags, song_tags
│       │   │   ├── imports/                  # fichier, URL, déduplication, brouillon, validation
│       │   │   ├── covers/
│       │   │   │   ├── covers.routes.ts      # monté sous /songs : /songs/:id/cover…
│       │   │   │   ├── covers.service.ts     # suggestions (cache 1 h), choix, upload, URL
│       │   │   │   ├── image-processor.ts    # sharp : validation, recadrage, WebP 720×720
│       │   │   │   └── providers/            # MusicBrainz + Cover Art Archive, Wikidata + Commons
│       │   │   ├── library/                  # user_songs (statut, favori, réglages), dernière écriture l'emporte
│       │   │   ├── practice/                 # loops, practice_sessions, statistiques
│       │   │   ├── maintenance/              # purges : brouillons, morceaux supprimés, sessions, tags, fichiers orphelins
│       │   │   └── mutopia/                  # V1.1 : index local + synchronisation
│       │   ├── shared/
│       │   │   ├── http/                     # app-env, errors, error-handler, validation, request-logger,
│       │   │   │                             # client-ip, safe-fetch (SSRF : IP vérifiée à la connexion)
│       │   │   ├── logger/                   # logger JSON à niveaux
│       │   │   ├── storage/file-storage.ts   # /data/midi/<sha256>.mid, /data/covers/<sha256>.webp (écriture atomique)
│       │   │   ├── jobs/periodic-job.ts      # tâche périodique sans chevauchement
│       │   │   └── runtime.ts                # Clock et générateur d'ULID injectables
│       │   └── test/                         # banc de test : serveur complet en mémoire, fixtures, logger mémoire
│       ├── scripts/generate-dbml.ts          # docs/database.dbml généré depuis le schéma Drizzle
│       ├── drizzle.config.ts
│       ├── tsdown.config.ts
│       └── vitest.config.ts
│
├── packages/
│   ├── core/                                 # TypeScript pur, sans DOM ni Node : testable partout
│   │   └── src/
│   │       ├── midi/
│   │       │   ├── analyze-midi.ts           # pistes, plages, durée, titre ; InvalidMidiError
│   │       │   ├── tonejs-midi.ts            # interop UMD/ESM de @tonejs/midi (Node et bundlers)
│   │       │   ├── midi-fixtures.ts          # MIDI de test construits en mémoire (export "@open-keys/core/testing")
│   │       │   └── midi.types.ts
│   │       ├── hands/
│   │       │   ├── suggest-hand-mapping.ts   # proposition automatique + handForNote
│   │       │   └── hands.types.ts
│   │       ├── ids/ulid.ts                   # ULID (source aléatoire injectée)
│   │       ├── timeline/                     # (phase 3) index temporel, recherche des notes dans une fenêtre
│   │       ├── music/                        # noms de notes, touches noires
│   │       ├── index.ts
│   │       └── testing.ts                    # helpers de test, jamais importés par du code de production
│   ├── contracts/                            # schémas zod des échanges avec l'API (entrées/sorties)
│   │   └── src/{auth,common,covers,error,health,imports,library,practice,songs,tags}.contract.ts
│   └── config/                               # tsconfig partagés (base, react, node)
│
├── e2e/                                      # Playwright (Chromium, Firefox) : build de production + vraie API
│   ├── playwright.config.ts
│   ├── tests/                                # playback.spec.ts, offline.spec.ts
│   └── support/                              # connexion et import par l'API
├── docs/
├── docker/
│   ├── web.Dockerfile                        # build Vite → nginx non root (port 8080)
│   ├── api.Dockerfile                        # build tsdown → node:26-slim
│   ├── nginx/                                # repli SPA, cache, compression ; CSP et en-têtes de sécurité
│   ├── compose.local.yml                     # production en local : + Caddy sur le port 8080
│   └── Caddyfile                             # reverse proxy local (rôle de Traefik)
├── docker-compose.yml                        # production (Dokploy) : web + api + volume data
├── .dockerignore
├── .github/workflows/ci.yml                  # lint, types, architecture, tests, build
├── .env.example
├── .nvmrc                                    # 26 (pour les outils qui le lisent : CI, éditeurs)
├── .dependency-cruiser.cjs                   # règles d'architecture (voir plus bas)
├── biome.json                                # lint + formatage, config unique
├── lefthook.yml                              # hooks Git : Biome, commitlint
├── vitest.config.ts                          # liste des projets de test
├── pnpm-workspace.yaml                       # workspaces, catalog, builds autorisés
├── package.json                              # scripts racine, devEngines (Node 26)
├── LICENSE                                   # MIT
└── README.md
```

## Dépendances autorisées entre modules

```mermaid
flowchart LR
  web[apps/web] --> contracts
  web --> core
  server[apps/server] --> contracts
  server --> core
  contracts -.-> core
```

- `packages/core` ne dépend de rien d'interne.
- Une feature n'importe une autre feature **que via son `index.ts`**. On n'importe jamais directement un fichier interne d'une autre feature. **Seule exception : les tables (`*.schema.ts`)**, importables partout pour les clés étrangères et les jointures.
- `shared/` n'importe jamais `features/`.

Ces règles sont **vérifiées en CI** par dependency-cruiser (`pnpm deps:check`, config dans `.dependency-cruiser.cjs`) :

| Règle | Interdit |
|---|---|
| `no-cross-feature-internals` | Importer un fichier interne d'une autre feature (seuls `index.ts` et les tables `*.schema.ts` sont autorisés) |
| `shared-does-not-import-features` | `shared/` qui dépend de `features/` |
| `core-is-pure` / `core-depends-on-nothing-internal` | Modules Node ou code interne dans `packages/core` (le DOM est exclu par son tsconfig) |
| `packages-do-not-import-apps` / `apps-are-isolated` | Un package qui importe une app ; `web` et `server` qui s'importent entre eux |
| `no-circular`, `not-to-unresolvable` | Cycles, imports introuvables |
| `not-to-dev-dep-in-production-code` | Une devDependency utilisée par du code de production |

