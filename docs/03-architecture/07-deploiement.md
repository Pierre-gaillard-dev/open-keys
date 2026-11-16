# Open Keys — Architecture : Déploiement

[← Sommaire](./README.md)

- **Dockerfile multi-stage** :
  1. installation pnpm ;
  2. build de `web` (fichiers statiques) et de `server` (build tsup/esbuild) ;
  3. image finale `node:22-slim` qui contient le serveur et `web/dist`, servi par Hono (`serveStatic`, repli SPA sur `index.html`).
- **Volume** `/data` : `open-keys.db` (SQLite en mode WAL), `midi/` et `covers/`.
- **Migrations** Drizzle appliquées au démarrage. L'utilisateur initial est créé à partir de `ADMIN_USERNAME`/`ADMIN_PASSWORD` s'il n'existe pas.
- **Variables d'environnement** : `DATA_DIR`, `SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `PUBLIC_URL`, `MAX_MIDI_SIZE`, `MUSICBRAINZ_CONTACT`.
- **Sauvegarde** : sauvegarde planifiée de `/data` par Dokploy, ou cron `sqlite3 .backup` + rsync.
