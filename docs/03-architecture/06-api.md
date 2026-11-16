# Open Keys — Architecture : API (MVP)

[← Sommaire](./README.md)

Toutes les routes sont sous `/api` et exigent une session, sauf `POST /auth/login`. Entrées et sorties sont validées par les schémas de `packages/contracts`.

| Méthode | Route | Rôle |
|---|---|---|
| POST | `/auth/login` | Connexion |
| POST | `/auth/logout` | Déconnexion |
| GET | `/auth/me` | Utilisateur courant |
| GET | `/songs` | Liste (`q`, `tags`, `status`, `favorite`, `difficulty`, `sort`) |
| GET | `/songs/:id` | Détail, avec les pistes et l'assignation des mains |
| GET | `/songs/:id/midi` | Fichier MIDI (ETag = sha256, `Cache-Control: immutable`) |
| PATCH | `/songs/:id` | Métadonnées et assignation des mains |
| DELETE | `/songs/:id` | Suppression logique |
| POST | `/imports` | Upload (multipart) ou `{ url }` → brouillon |
| POST | `/imports/:id/confirm` | Validation du brouillon |
| GET | `/songs/:id/cover` | Couverture WebP (URL avec `?v=<sha256>`, `Cache-Control: immutable`) |
| GET | `/songs/:id/cover-suggestions` | Candidats automatiques (`title`, `composer` en paramètres, pour pouvoir les modifier avant validation) |
| PUT | `/songs/:id/cover` | Remplacer : multipart (fichier), `{ url }` ou `{ suggestionId }` |
| DELETE | `/songs/:id/cover` | Retirer → couverture générée |
| GET | `/tags` | Tags existants |
| GET | `/library` | Les entrées `user_songs` de l'utilisateur |
| PUT | `/library/:songId` | Statut, favori, réglages (dernière écriture l'emporte) |
| GET | `/songs/:id/loops` | Boucles de l'utilisateur pour ce morceau |
| PUT | `/loops/:id` | Créer ou modifier une boucle (identifiant ULID fourni par le client) |
| DELETE | `/loops/:id` | Suppression logique |
| PUT | `/practice-sessions/:id` | Enregistrer une session (idempotent) |
| GET | `/songs/:id/practice-stats` | Temps total, nombre de sessions, dernière pratique |
| GET | `/health` | Sonde Dokploy |
