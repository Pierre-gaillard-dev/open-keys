# Open Keys — Architecture : Stack

[← Sommaire](./README.md)

| Couche | Choix | Rôle |
|---|---|---|
| Monorepo | **pnpm workspaces** + Turborepo (facultatif) | Applications et packages partagés |
| Langage | **TypeScript strict** partout | Typage de bout en bout |
| Front | **React 19 + Vite** | Interface (pas de rendu serveur : c'est une PWA) |
| Routage | **TanStack Router** | Routes typées |
| État serveur | **TanStack Query** | Cache et invalidation des données de l'API |
| État du lecteur | **Zustand** (store vanilla) | Lu par le renderer **hors du cycle de rendu React** |
| Rendu | **PixiJS v8** (WebGL) | Notes qui tombent et clavier |
| Audio | **Tone.js** (`Sampler`, `Transport`) | Lecture, tempo, boucles |
| Analyse MIDI | **@tonejs/midi** | Utilisé côté client et serveur via `packages/core` |
| Hors-ligne | **vite-plugin-pwa** (Workbox) + **Dexie** (IndexedDB) | Cache et file d'attente de synchronisation |
| Style | **Tailwind CSS** + composants maison | Thème sombre, cibles tactiles larges |
| API | **Hono** + `@hono/zod-validator` + client RPC `hc` | API typée, sans génération de code |
| Validation | **Zod** (schémas dans `packages/contracts`) | Schémas partagés entre le front et le back |
| Base de données | **SQLite** (`better-sqlite3`) + **Drizzle ORM / drizzle-kit** | Schéma, migrations, requêtes typées |
| Images | **sharp** | Conversion des couvertures en WebP 720×720 |
| Authentification | Sessions en base, cookie `httpOnly`, hash **argon2id** | Un seul utilisateur, prêt pour plusieurs |
| Qualité | **Biome** (lint et formatage), `tsc --noEmit`, **Vitest**, **Playwright** (e2e) | CI stricte |
| Déploiement | Dockerfile multi-stage, Dokploy (Traefik, HTTPS) | Un seul conteneur, volume `/data` |
