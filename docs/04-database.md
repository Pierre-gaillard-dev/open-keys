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
Comptes. Le premier est créé au démarrage à partir des variables d'environnement, avec le rôle `admin` ; les suivants par invitation (V1.4), avec le rôle `member`. `note_naming` (`english` ou `latin`, `english` par défaut) choisit les noms des notes affichés à ce compte : c'est un réglage de la personne, pas de l'appareil, il la suit donc partout, et deux personnes qui partagent un appareil gardent chacune le leur. `role`, `note_naming` et `disabled_at` sont vérifiés par l'application, sans contrainte CHECK : en ajouter une à une table existante obligerait à la reconstruire. Identifiant unique sans tenir compte de la casse (vérifié à la création).

### `invitations` — feature `accounts` (D29)
Liens à usage unique créés par l'administrateur : `kind` = `account` (nouveau compte) ou `reset` (nouveau mot de passe pour `user_id`). Seul `token_hash` (SHA-256) est stocké. `used_at` est rempli à l'utilisation. Les liens utilisés ou expirés (7 jours) sont purgés par la maintenance.

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
| `source_type` | `upload` ou `url` (une bibliothèque en ligne télécharge aussi le fichier). `mutopia` est une valeur historique de la contrainte, inutilisée |
| `source_library` | Bibliothèque en ligne d'origine (UC-20), sinon null. **Sans contrainte CHECK** : en ajouter une imposerait de reconstruire la table (D24) |
| `source_piece_id` | `source_pieces.id` du morceau d'origine : affiche « Dans le catalogue » dans la recherche |
| `credit` | Arrangeur ou interprète, tel que la bibliothèque le crédite. Affiché sur la fiche |
| `cover_sha256` | Couverture en WebP 720×720 dans `/data/covers/<sha256>.webp`. Nullable : sans couverture, le client affiche une couverture générée (dégradé calculé à partir de l'id, titre et compositeur) |
| `cover_source` | `upload`, `url`, `musicbrainz` ou `wikidata` |
| `cover_credit` | Attribution affichée sur la fiche du morceau (obligatoire pour les images Wikimedia sous licence CC) |

Index : `(state, deleted_at)`, `(title)`, `(composer)`, `(source_piece_id)`.
Recherche texte : `LIKE` suffit dans le MVP. Table virtuelle FTS5 si le besoin apparaît.

### `song_tracks` — feature `songs`
Une ligne par piste MIDI contenant des notes, avec son assignation à une main (`channel` = canal principal de la piste).
Contrainte d'unicité : `(song_id, track_index)`.

### `song_hands` — feature `songs` (D28)
La main de chaque note d'un morceau, une ligne par morceau. Sans ligne, les mains viennent de `songs.hand_mode`.
- `hands` : un caractère par note (`l`, `r`, `-` pour une note d'une piste ignorée), dans l'ordre canonique des notes : piste, position en ticks, hauteur. Cet ordre ne dépend pas de la librairie qui lit le MIDI.
- `fingerprint` : empreinte (FNV-1a, 32 bits) de cette liste de notes. Le serveur la vérifie sur le fichier avant d'enregistrer, et le lecteur ne l'applique qu'à ces notes-là : sinon, il revient à `hand_mode`.
- `source` : `auto` (calculée par l'algorithme) ou `edited` (corrigée à la main). `version` : version de l'algorithme qui l'a calculée. Une nouvelle version ne modifie jamais une répartition enregistrée.
- Table à part plutôt qu'une colonne de `songs` : quelques kilo-octets par morceau, que les requêtes du catalogue n'ont pas à lire. Plutôt qu'une ligne par note : la liste est toujours lue et écrite en entier.
- En mode note par note, `songs.hand_mode` vaut `split` : c'est le repli si la liste ne correspond plus au fichier.

### `tags`, `song_tags` — feature `tags`
Tags libres, en minuscules et nettoyés (`trim`). La table de liaison a une clé primaire composite et des suppressions en cascade.

### `user_songs` — feature `library`
Relation entre un utilisateur et un morceau : statut, favori et **réglages du lecteur** (UC-12).

| Colonne | Note |
|---|---|
| `hands_settings` | JSON validé par zod : `{ left: { audible, visible, volume }, right: { … } }`. `volume` (0–1, V1.2) vaut 1 s'il est absent (réglages enregistrés avant) |
| `last_loop_id` | Dernière boucle active, nullable, `ON DELETE SET NULL` |
| `updated_at` | Arbitre la règle « la dernière écriture l'emporte » |

La ligne est créée à la première interaction (upsert).

### `loops` — feature `practice`
Boucles A-B nommées. Contrainte `CHECK (end_ms > start_ms)`.
`target_tempo_pct` : vitesse visée (null = 100 %). `best_tempo_pct` : plus haute vitesse jouée 3 tours de suite (V1.3, UC-26).
Index : `(user_id, song_id, deleted_at)`.

### `practice_sessions` — feature `practice`
Une ligne par session de lecture d'au moins 10 s effectives.

| Colonne | Note |
|---|---|
| `active_ms` | Temps de lecture effective (pauses exclues) |
| `min_tempo_pct` / `max_tempo_pct` | Plage de vitesses utilisée pendant la session |
| `mode` | `watch` (regarder, écouter), `wait` (au piano, mode attente) ou `rhythm` (au piano, en rythme), depuis la V1.5. Changer de mode ou de mains commence une nouvelle session. La contrainte CHECK a changé en V1.5 : la table a été reconstruite, ce qui est sans risque puisqu'aucune table ne la référence. `midi`, accepté avant mais jamais envoyé, est devenu `watch` |
| `accuracy`, `score` | Au piano seulement (V1.5). `score` est le nombre d'accords joués. `accuracy` est la part d'accords justes en rythme, ou joués sans faire attendre la lecture en mode attente. Les deux valent `null` sinon |

Index : `(user_id, song_id, started_at)`, `(user_id, started_at)` pour le tableau de bord.

### `source_pieces` — feature `sources` (V1.1)
Copie locale des index des **bibliothèques en ligne** (D24) : Mutopia Project, MAESTRO, xivmidi. Seulement les morceaux à **un seul fichier MIDI**. Chaque bibliothèque est reconstruite selon son propre rythme, jamais modifiée par l'utilisateur.

| Colonne | Note |
|---|---|
| `id` | PK : `<source>:<id dans la bibliothèque>` (`mutopia:37`, `xivmidi:<uuid>`, `maestro:<fichier>`) |
| `source` | `mutopia`, `maestro` ou `xivmidi` |
| `composer` | Compositeur, ou artiste pour un arrangement (tel que la bibliothèque l'écrit) |
| `instrument` | Instrumentation de la bibliothèque (« Piano », « Voice and Piano », « Cello, Piano »…) |
| `solo` | Jouable par un seul musicien tel quel : claviers seuls (Mutopia, MAESTRO), arrangement solo (xivmidi). Filtre par défaut |
| `license` | Forme courte (« Public Domain », « CC BY-SA 4.0 »), null quand la bibliothèque ne la donne pas. Reprise dans `songs.license` |
| `credit` | Arrangeur ou interprète, repris dans `songs.credit` |
| `midi_ref` | Où le fournisseur prend le fichier : une URL, ou un fichier de l'archive téléchargée (MAESTRO) |
| `page_url` | Page publique du morceau, reprise dans `songs.source_url` |
| `search_text` | Titre, compositeur, opus et crédit en minuscules, sans accents ni ponctuation : « gymnopedie » trouve « Gymnopédie ». Sert aussi au tri |
| `synced_at` | Synchronisation qui a vu la ligne. Les lignes d'une bibliothèque plus anciennes que sa dernière synchronisation complète sont supprimées |

Index : `(source, synced_at)`.

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
| V1.5 | `practice_sessions.mode` gagne `wait` et `rhythm` ; `accuracy` et `score` sont remplis au piano |
| V2 | Éventuellement une table `session_events` pour l'analyse détaillée des erreurs |
