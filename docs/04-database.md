# Open Keys — Schéma de base de données

SQLite avec Drizzle ORM. Chaque table est définie dans le `*.schema.ts` de la feature qui la possède, puis ré-exportée par `apps/server/src/db/schema.ts`.

## 1. Conventions

- **Identifiants** : `text`, au format **ULID**. Ils peuvent être générés côté client, ce qui permet de créer des données hors-ligne et de rendre les `PUT` idempotents.
- **Dates** : `integer` en millisecondes epoch UTC (`created_at`, `updated_at`, `deleted_at`).
- **Suppression logique** (`deleted_at`) sur les données synchronisées et sur les morceaux.
- **Temps musicaux** : en **ms de temps de partition** (à 100 % de vitesse), suffixe `_ms`.
- **Vitesse** : entier en pourcentage, de 25 à 100, suffixe `_pct`.
- **Énumérations** : `text` avec une contrainte `CHECK`, et le type TypeScript dérivé dans `packages/contracts`.
- **Tables de données utilisateur** : une colonne `user_id` est obligatoire (préparation au multi-utilisateur, D3).
- **Pragmas** : `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`.

## 2. Schéma

Le schéma de référence est **[`database.dbml`](./database.dbml)**. Pour le voir sous forme de diagramme, colle-le dans [dbdiagram.io](https://dbdiagram.io).

> Le DBML est **généré à partir du schéma Drizzle** (`pnpm --filter @open-keys/server db:dbml`). La CI (`pnpm db:check`) échoue si le schéma a changé sans migration générée ou sans DBML régénéré. La doc ne peut donc pas diverger du code.

Résumé des relations :

```
users ─┬─< auth_sessions
       ├─< songs ─┬─< song_tracks
       │          ├─< song_tags >── tags
       ├─< user_songs >── songs
       ├─< loops >── songs
       └─< practice_sessions >── songs, loops?
```

## 3. Détail des tables

### `users` — feature `auth`
Comptes. Un seul dans le MVP, créé par le seed à partir des variables d'environnement.

### `auth_sessions` — feature `auth`
| Colonne | Note |
|---|---|
| `token_hash` | SHA-256 du jeton contenu dans le cookie. Le jeton en clair n'est jamais stocké |
| `expires_at` | Expiration glissante de 90 jours |

Index : `(user_id)`, `(expires_at)` pour la purge.

### `songs` — feature `songs`
Catalogue **commun** (D3 : un `created_by` permet un futur catalogue par utilisateur).

| Colonne | Note |
|---|---|
| `state` | `draft` à l'import, `ready` après validation. Les brouillons de plus de 24 h sont purgés. Réimporter un fichier d'un morceau supprimé le **restaure** en brouillon, avec son historique |
| `midi_sha256` | Unique : sert à dédoublonner les imports et donne le nom du fichier `/data/midi/<sha256>.mid` |
| `duration_ms`, `note_count`, `min_pitch`, `max_pitch` | Calculés à l'import (`analyzeMidi`) : affichage dans le catalogue, et zoom automatique en V1.1 |
| `hand_mode` | `tracks` : assignation par piste (`song_tracks.hand`). `split` : découpage par hauteur, `split_pitch` |
| `split_pitch` | Note MIDI de séparation. Les notes ≥ `split_pitch` vont à droite. Utilisé seulement si `hand_mode = split` |
| `license` | Texte libre (`Public Domain`, `CC-BY-SA 4.0`, `inconnue`…) |
| `cover_sha256` | Couverture en WebP 720×720 dans `/data/covers/<sha256>.webp`. Nullable : sans couverture, le client affiche une couverture générée (dégradé calculé à partir de l'id, titre et compositeur) |
| `cover_source` | `upload`, `url`, `musicbrainz` ou `wikidata` |
| `cover_credit` | Attribution affichée sur la fiche du morceau (obligatoire pour les images Wikimedia sous licence CC) |

Index : `(state, deleted_at)`, `(title)`, `(composer)`.
Recherche texte : `LIKE` suffit dans le MVP. Table virtuelle FTS5 si le besoin apparaît.

### `song_tracks` — feature `songs`
Une ligne par piste MIDI contenant des notes, avec son assignation à une main (`channel` = canal principal de la piste).
Contrainte d'unicité : `(song_id, track_index)`.

### `tags`, `song_tags` — feature `tags`
Tags libres, en minuscules et nettoyés (`trim`). La table de liaison a une clé primaire composite et des suppressions en cascade.

### `user_songs` — feature `library`
Relation entre un utilisateur et un morceau : statut, favori et **réglages du lecteur** (UC-12).

| Colonne | Note |
|---|---|
| `hands_settings` | JSON validé par zod : `{ left: { audible, visible }, right: { audible, visible } }` |
| `last_loop_id` | Dernière boucle active, nullable, `ON DELETE SET NULL` |
| `updated_at` | Arbitre la règle « la dernière écriture l'emporte » |

La ligne est créée à la première interaction (upsert).

### `loops` — feature `practice`
Boucles A-B nommées. Contrainte `CHECK (end_ms > start_ms)`.
Index : `(user_id, song_id, deleted_at)`.

### `practice_sessions` — feature `practice`
Une ligne par session de lecture d'au moins 10 s effectives.

| Colonne | Note |
|---|---|
| `active_ms` | Temps de lecture effective (pauses exclues) |
| `min_tempo_pct` / `max_tempo_pct` | Plage de vitesses utilisée pendant la session |
| `mode` | `watch` (MVP) ; `midi` (V2) |
| `accuracy`, `score` | Remplis en V2 seulement (D10 : enrichissement, pas remplacement) |

Index : `(user_id, song_id, started_at)`, `(user_id, started_at)` pour le tableau de bord.

### `mutopia_pieces` — feature `mutopia` (V1.1)
Copie locale de l'index du Mutopia Project : les morceaux avec une partie de piano et **un seul fichier MIDI** (D24). Reconstruite chaque semaine, jamais modifiée par l'utilisateur.

| Colonne | Note |
|---|---|
| `mutopia_id` | PK : l'identifiant de Mutopia (`piece-info.cgi?id=…`) |
| `composer` | Tel que Mutopia l'écrit (« E. Satie ») |
| `instrument` | Instrumentation de Mutopia (« Piano », « Voice and Piano »…) |
| `keyboard_solo` | Uniquement des claviers (piano, clavecin, clavicorde) : jouable tel quel. Filtre « Piano seul » par défaut |
| `license` | Forme courte (« Public Domain », « CC BY-SA 4.0 »), reprise dans `songs.license` à l'import |
| `search_text` | Titre, compositeur et opus en minuscules sans accents : « gymnopedie » trouve « Gymnopédie » |
| `synced_at` | Synchronisation qui a vu la ligne. Les lignes plus anciennes que la dernière synchronisation complète sont supprimées |

Index : `midi_url` (jointure avec `songs.source_url` pour afficher « Dans le catalogue »).

## 4. Règles de synchronisation

| Donnée | Écriture hors-ligne | Résolution des conflits |
|---|---|---|
| `songs`, `song_tracks`, `tags` | ❌ en ligne uniquement | — |
| `user_songs` | ✅ | `updated_at` le plus récent l'emporte : `INSERT … ON CONFLICT DO UPDATE … WHERE updated_at <= excluded.updated_at`, et le serveur renvoie toujours l'état retenu |
| `loops` | ✅ | idem, suppression logique propagée |
| `practice_sessions` | ✅ | ajout seul. `PUT` idempotent sur l'identifiant ULID |

## 5. Stockage local (IndexedDB, Dexie)

Base `open-keys` (`apps/web/src/shared/offline/offline-db.ts`) :

| Store | Clé | Contenu |
|---|---|---|
| `midiFiles` | `songId` | Octets du MIDI + dernière version connue du morceau (`SongDetail`), pour le catalogue hors-ligne |
| `outbox` | `id` (ULID), index `path`, `createdAt` | `{ path, body, createdAt, attempts, lastError }` : un `PUT` en attente, un seul par chemin |
| `queryCache` | `"query-cache"` | Cache de TanStack Query sauvegardé : utilisateur, fiches, bibliothèque, boucles, statistiques, tags (D23) |

- **Pas de copie des tables** `user_songs` ou `loops` : le cache des requêtes sauvegardé les contient déjà, et les écritures hors-ligne y sont appliquées immédiatement (D23).
- Le cache sauvegardé est ignoré par un nouveau build (identifiant de build), puis rechargé depuis l'API.
- **Déconnexion** : tout est effacé, y compris les écritures pas encore envoyées.

Les échantillons de piano, le shell de l'app et les **couvertures** sont gérés par le cache du Service Worker, pas par IndexedDB. Les couvertures sont en cache-first, et leur URL contient le hash, donc elles ne changent jamais.

## 5 bis. Fichiers sur disque

```
/data
├── open-keys.db           # SQLite (WAL)
├── midi/<sha256>.mid
└── covers/<sha256>.webp   # 720×720, qualité 80, environ 40 à 90 Ko
```

Un fichier qu'aucune ligne de `songs` ne référence plus est purgé par une tâche différée.

## 6. Évolutions prévues

| Version | Changement |
|---|---|
| V1.3 | Utilisation de `loops.target_tempo_pct` / `best_tempo_pct` (colonnes déjà présentes) |
| V2 | Remplissage de `practice_sessions.accuracy` / `score`. Éventuellement une table `session_events` pour l'analyse détaillée des erreurs |
| Multi-utilisateur | Rien à migrer pour les données personnelles. Seule décision à prendre : catalogue commun ou `songs.owner_id` |
