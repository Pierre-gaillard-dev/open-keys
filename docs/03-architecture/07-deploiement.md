# Open Keys — Architecture : Déploiement

[← Sommaire](./README.md)

## Topologie

Deux conteneurs orchestrés par un `docker-compose.yml`, déployé comme application compose dans Dokploy. **Il n'y a pas de conteneur de base de données** : SQLite est un fichier dans le volume de l'API (D5).

```mermaid
flowchart LR
  U([Navigateur]) -->|HTTPS| T[Traefik<br/>Dokploy]
  T -->|"/ (tout le reste)"| W[web<br/>nginx + PWA buildée]
  T -->|/api/*| A[api<br/>Node + Hono]
  A --- V[(volume data<br/>open-keys.db, midi/, covers/)]
```

- **Un seul domaine** : Traefik envoie `/api/*` vers `api` et tout le reste vers `web`. Le front et l'API ont donc la même origine : pas de CORS, et les cookies `SameSite=Lax` fonctionnent sans configuration particulière.
- Les deux services se déploient **indépendamment** : une modif du front ne redémarre pas l'API.

## Fichiers

| Fichier | Rôle |
|---|---|
| `docker-compose.yml` | Production : services `web` et `api`, volume `data`. Les domaines sont configurés dans Dokploy |
| `docker/web.Dockerfile` | Build Vite, puis `nginxinc/nginx-unprivileged` (port 8080, utilisateur non root) |
| `docker/api.Dockerfile` | Build tsdown, `pnpm deploy --prod`, puis `node:26-slim` (utilisateur `node`) |
| `docker/nginx/default.conf` | Repli SPA, cache, compression |
| `docker/nginx/security-headers.conf` | CSP et en-têtes de sécurité, inclus dans chaque `location` |
| `docker/compose.local.yml` + `docker/Caddyfile` | Production en local, avec Caddy dans le rôle de Traefik |
| `.dockerignore` | Contexte de build réduit aux sources |

## Services

| Service | Image | Rôle | Exposé |
|---|---|---|---|
| `web` | `docker/web.Dockerfile` | Sert `apps/web/dist` (PWA) | `/` via Traefik, port 8080 |
| `api` | `docker/api.Dockerfile` | API Hono, migrations, tâches différées | `/api` via Traefik, port 3000 |

### `web` (nginx)
- **Build multi-stage** : `pnpm fetch` (couche réutilisée tant que le lockfile ne change pas), installation hors ligne, `pnpm --filter @open-keys/web build`, puis copie de `dist/` dans nginx.
- **Repli SPA** : `try_files $uri /index.html`.
- **Cache** :
  - `assets/*` (fichiers hashés par Vite) et `samples/*` : `Cache-Control: public, max-age=31536000, immutable` ;
  - `index.html`, `sw.js`, `workbox-*.js` et `manifest.webmanifest` : `no-cache`, pour que les mises à jour de la PWA soient prises en compte.
- **Compression** gzip.
- **En-têtes de sécurité** posés ici pour les pages, et par Hono pour l'API :
  - `Content-Security-Policy` sans `unsafe-eval` ni script inline. Deux conséquences dans le code :
    - PixiJS est chargé avec `pixi.js/unsafe-eval`, qui remplace la génération de code des shaders. Sans lui, le rendu échoue.
    - zod est configuré en `jitless` (`main.tsx`).
    
    Firefox signale quand même une violation par chargement du lecteur : c'est le test interne de PixiJS (`new Function` dans un `try`), sans effet sur le rendu.
  - `img-src` autorise les vignettes de Cover Art Archive et Wikimedia (voir [sécurité](./08-securite.md)).
  - `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.

### `api` (Node + Hono)
- **Build multi-stage** : tsdown embarque `packages/*` dans `dist/index.mjs`, puis `pnpm deploy --prod` produit les seules dépendances de production. `better-sqlite3` et `sharp` utilisent leurs binaires précompilés (glibc), d'où l'image Debian slim et non Alpine.
- **Volume** `data` monté sur `/data` : `open-keys.db` (SQLite en mode WAL), `midi/`, `covers/`. Le dossier appartient à l'utilisateur `node` dans l'image, et le volume nommé hérite de ces droits à sa création.
- **Au démarrage** : migrations Drizzle appliquées, puis création de l'utilisateur initial à partir de `ADMIN_USERNAME`/`ADMIN_PASSWORD` s'il n'existe pas.
- **Healthcheck** : `GET /api/health`.
- **Arrêt propre** : sur `SIGTERM` (redéploiement Dokploy), le serveur arrête d'accepter des connexions et termine les requêtes en cours. Il est forcé au bout de 10 s (`stop_grace_period: 15s` dans le compose).
- **Une seule instance** : SQLite n'accepte qu'un seul processus qui écrit. On ne passe pas l'API à l'échelle horizontalement, et ce n'est pas un besoin.

## PWA (Service Worker)

- `vite-plugin-pwa` (Workbox, `generateSW`) génère `sw.js` et `manifest.webmanifest`.
- **Précache** (≈ 3,3 Mo) : shell de l'app (JS, CSS, HTML), polices latines et les 30 échantillons du piano. Les autres sous-ensembles de polices sont mis en cache à la première utilisation.
- **L'API n'est jamais servie par le Service Worker.** Les données hors ligne arrivent en phase 4, avec Dexie et l'outbox.
- **Mise à jour à la demande** (`registerType: "prompt"`) :
  - une nouvelle version attend que l'utilisateur clique sur « Mettre à jour », dans la bannière en haut des pages (jamais dans le lecteur, pour ne pas interrompre la pratique) ;
  - l'app vérifie la présence d'une nouvelle version toutes les heures.
- L'enregistrement est fait par l'app (`app/pwa/register-service-worker.ts`), sans script inline (CSP).

## Variables d'environnement (`api`)

| Variable | Défaut | Rôle |
|---|---|---|
| `NODE_ENV` | `development` (`production` dans l'image) | `production` exige `PUBLIC_URL` et active les cookies `Secure` |
| `PORT` | `3000` | |
| `APP_VERSION` | `dev` | Exposée par `/api/health` et dans le `User-Agent` sortant (argument de build) |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `DATA_DIR` | `./data` (`/data` dans l'image) | `open-keys.db`, `midi/`, `covers/` |
| `PUBLIC_URL` | — | Origine publique (`https://…`) : seule origine acceptée pour les envois de formulaire |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | — | Compte initial, créé au démarrage s'il n'existe aucun utilisateur (12 caractères minimum) |
| `COOKIE_SECURE` | `true` en production | Cookie de session HTTPS uniquement |
| `TRUST_PROXY` | `false` (`true` dans le compose) | `true` derrière Traefik : l'IP cliente vient de `X-Forwarded-For` |
| `MAX_MIDI_SIZE` / `MAX_COVER_SIZE` | 2 Mo / 10 Mo | Limites d'upload et de téléchargement |
| `MUSICBRAINZ_CONTACT` | URL du dépôt | Contact dans le `User-Agent` envoyé à MusicBrainz et Wikimedia (exigé par leurs règles) |

- Elles sont toutes validées par zod au démarrage (`config/env.ts`) : une valeur invalide empêche l'API de démarrer.
- **Une valeur vide compte comme absente** : le compose passe `${VAR:-}` sous forme de chaîne vide quand la variable n'est pas définie.
- Elles sont gérées dans Dokploy et jamais commitées. Le dépôt fournit un `.env.example`.

## Mise en place dans Dokploy

À faire une fois, dans l'interface de Dokploy :

1. **Créer l'application** : *Create Service* → *Compose*, type *Docker Compose*, source GitHub (dépôt `open-keys`, branche `main`, chemin `./docker-compose.yml`).
2. **Désactiver l'auto-deploy** de Dokploy : c'est la CI qui déclenche le déploiement, après les vérifications (voir plus bas).
3. **Variables** (onglet *Environment*) :
   ```dotenv
   PUBLIC_URL=https://keys.example.org
   ADMIN_USERNAME=pierre
   ADMIN_PASSWORD=<12 caractères minimum>
   APP_VERSION=1.0.0
   ```
   `ADMIN_*` ne sert qu'au premier démarrage, et peut être retiré ensuite.
4. **Domaines** (onglet *Domains*), avec le même hôte et HTTPS (Let's Encrypt) :

   | Service | Chemin | Port du conteneur | Strip path |
   |---|---|---|---|
   | `api` | `/api` | 3000 | non |
   | `web` | `/` | 8080 | non |

   Traefik choisit la règle la plus spécifique : `/api/*` va à l'API, le reste au web.
5. **DNS** : un enregistrement `A` du domaine vers l'IP du VPS.
6. **Premier déploiement** (*Deploy*), puis vérifier :
   - `https://<domaine>/api/health` répond `{"status":"ok",…}` ;
   - la connexion fonctionne depuis le PC et le Pixel 10.
7. **Sauvegardes** (onglet *Volume Backups*) : volume `data`, vers un stockage S3 (voir plus bas).
8. **Déploiement depuis la CI** : créer une clé d'API (*Settings* → *Profile* → *API/CLI*), puis ajouter trois secrets au dépôt GitHub (*Settings* → *Secrets and variables* → *Actions*) :

   | Secret | Valeur |
   |---|---|
   | `DOKPLOY_URL` | URL du panneau Dokploy, sans `/` final |
   | `DOKPLOY_API_KEY` | Clé d'API Dokploy |
   | `DOKPLOY_COMPOSE_ID` | Identifiant de l'application compose (dans l'URL de sa page) |

## Déploiement continu

`.github/workflows/ci.yml` :

| Job | Quand | Rôle |
|---|---|---|
| `verify` | PR et `main` | Lint, types, architecture, schéma, tests, build |
| `images` | PR et `main` | Build des deux images Docker : une erreur de Dockerfile est vue avant le merge |
| `deploy` | Push sur `main`, après `verify` et `images` | `POST /api/compose.deploy` sur Dokploy. Sans les secrets, le job est ignoré (avec une notice) |

Dokploy reconstruit les images sur le VPS et redémarre les services. Le volume `data` est conservé.

## Développement local

- `pnpm dev` : Vite (port 5173) avec un proxy `/api` vers Hono (port 3000). On garde ainsi la même origine qu'en production. Le Service Worker n'est pas actif en développement.
- **Production en local** :
  ```bash
  ADMIN_USERNAME=pierre ADMIN_PASSWORD='mot-de-passe-local' \
    docker compose -f docker-compose.yml -f docker/compose.local.yml up --build
  ```
  Ensuite, ouvrir http://localhost:8080. Caddy route comme Traefik, et `compose.local.yml` fixe `PUBLIC_URL=http://localhost:8080` et `COOKIE_SECURE=false`. Les navigateurs acceptent le Service Worker sur `localhost` sans HTTPS.

## Sauvegarde

Sauvegarde planifiée du volume `data` par Dokploy (*Volume Backups*, vers un stockage compatible S3). L'alternative est un cron `sqlite3 .backup` + rsync vers un stockage externe.
