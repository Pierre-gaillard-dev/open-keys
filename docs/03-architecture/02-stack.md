# Open Keys — Architecture : Stack

[← Sommaire](./README.md)

| Couche | Choix | Rôle |
|---|---|---|
| Runtime | **Node 26 LTS**, fourni par pnpm (`devEngines.runtime`) | Même version de Node pour tout le monde, sans gestionnaire de versions |
| Monorepo | **pnpm 12 workspaces** + **catalog** (versions partagées dans `pnpm-workspace.yaml`) | Applications et packages partagés ; pas de Turborepo tant que les builds restent rapides |
| Langage | **TypeScript 7** strict partout ; packages internes consommés en source (`exports` → `src/`) | Typage de bout en bout, sans étape de build intermédiaire |
| Front | **React 19 + Vite 8** | Interface (pas de rendu serveur : c'est une PWA) |
| Routage | **TanStack Router** | Routes typées |
| État serveur | **TanStack Query** | Cache et invalidation des données de l'API |
| État du lecteur | **Zustand** (store vanilla) | Lu par le renderer **hors du cycle de rendu React** |
| Rendu | **PixiJS v8** (WebGL) | Notes qui tombent et clavier |
| Audio | **Web Audio natif** : `PianoSampler` maison + échantillons Salamander | Lecture, vélocité, sustain. Pas de Tone.js, qui masque `outputLatency` et casse sous Firefox (D17) |
| Analyse MIDI | **@tonejs/midi** | Utilisé côté client et serveur via `packages/core` |
| Hors-ligne | **vite-plugin-pwa** (Workbox) + **Dexie** (IndexedDB) | Cache et file d'attente de synchronisation |
| Style | **Tailwind CSS** + composants maison | Thème sombre, cibles tactiles larges |
| API | **Hono** + `@hono/zod-validator` + client RPC `hc` | API typée, sans génération de code |
| Validation | **Zod** (schémas dans `packages/contracts`) | Schémas partagés entre le front et le back |
| Base de données | **SQLite** (`better-sqlite3`, binaires précompilés) + **Drizzle ORM 0.45 / drizzle-kit** | Schéma, migrations, requêtes typées. `node:sqlite` n'est supporté que par Drizzle 1.0 (RC) : à reconsidérer à sa sortie (D18) |
| Images | **sharp** | Conversion des couvertures en WebP 720×720 |
| Authentification | Sessions en base (jeton haché en SHA-256), cookie `httpOnly`, **argon2id natif** (`node:crypto`, Node 26) | Aucune dépendance native pour le hachage (D19) |
| Fetch sortant | **undici** (`Agent` avec résolution DNS contrôlée) + **ipaddr.js** | Imports par URL et couvertures sans SSRF |
| Build API | **tsdown** | Bundle de `apps/server`, avec les packages internes inclus (`deps.alwaysBundle`) et les migrations copiées dans `dist/` |
| Qualité | **Biome 2** (lint et formatage), `tsc --noEmit`, **dependency-cruiser** (règles d'architecture), **Vitest 5** (un projet par package), **Playwright** (e2e) | CI stricte |
| Hooks Git | **lefthook** (Biome au pre-commit) + **commitlint** (commits conventionnels) | Rien de non formaté ni de mal nommé n'arrive dans l'historique |
| Déploiement | docker-compose (`web` nginx + `api` Node), Dokploy (Traefik, HTTPS) | Deux conteneurs, un seul domaine, volume `/data` |
