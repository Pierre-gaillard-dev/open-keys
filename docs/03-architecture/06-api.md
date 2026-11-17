# Open Keys — Architecture : API (MVP)

[← Sommaire](./README.md)

Toutes les routes sont sous `/api`. Entrées et sorties sont validées par les schémas de `packages/contracts`.

- **Authentification** : la session est exigée pour tous les préfixes listés dans `PROTECTED_PREFIXES` (`app.ts`) : `/songs`, `/imports`, `/tags`, `/library`, `/loops`, `/practice-sessions`. Elle est appliquée par préfixe, donc aucune route ne peut être oubliée, et un test vérifie le 401 sur chacune. Seules `/health`, `/auth/login` et `/auth/logout` sont publiques.
- **Origine** : les envois de formulaire (multipart) venant d'une autre origine que `PUBLIC_URL` sont refusés (403). Les requêtes JSON d'un autre site sont de toute façon bloquées par CORS, que l'API n'accorde jamais.

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
| POST | `/imports/file` | Upload multipart (champ `file`) → brouillon (201), ou brouillon existant (200), ou 409 si déjà au catalogue |
| POST | `/imports/url` | `{ url }` → téléchargement via `safe-fetch` → brouillon (mêmes réponses) |
| POST | `/imports/:id/confirm` | Validation du brouillon : métadonnées, tags, mains, `coverSuggestionId` facultatif |
| GET | `/songs/:id/cover` | Couverture WebP (URL avec `?v=<16 premiers caractères du sha256>`, `Cache-Control: immutable`) |
| GET | `/songs/:id/cover-suggestions` | Candidats automatiques (`title`, `composer` en paramètres, pour pouvoir les modifier avant validation) |
| PUT | `/songs/:id/cover` | Remplacer : multipart (fichier), `{ url }` ou `{ suggestionId }` |
| DELETE | `/songs/:id/cover` | Retirer → couverture générée |
| GET | `/tags` | Tags utilisés par au moins un morceau, avec leur nombre |
| GET | `/library` | Les entrées `user_songs` de l'utilisateur |
| PUT | `/library/:songId` | Statut, favori, réglages (dernière écriture l'emporte) |
| GET | `/songs/:id/loops` | Boucles de l'utilisateur pour ce morceau |
| PUT | `/loops/:id` | Créer ou modifier une boucle (identifiant ULID fourni par le client) |
| DELETE | `/loops/:id` | Suppression logique |
| PUT | `/practice-sessions/:id` | Enregistrer une session (idempotent) |
| GET | `/practice-sessions` | Historique (`from`, `to` facultatif, 400 jours au plus) : sessions les plus récentes d'abord, avec le titre du morceau. Regroupées par jour côté client, dans son fuseau horaire |
| GET | `/songs/:id/practice-stats` | Temps total, nombre de sessions, dernière pratique |
| GET | `/health` | Sonde Dokploy |
| GET | `/sources/pieces` | Recherche dans les bibliothèques en ligne (`q`, `source` facultatif, `solo` = `true` par défaut) : 100 résultats au plus, `total`, état de chaque index, morceau déjà importé |
| GET | `/sources/pieces/:id/midi` | Le MIDI du morceau, pour l'écouter avant l'import (la page ne peut pas joindre les bibliothèques : CSP) |
| POST | `/sources/pieces/:id/import` | Brouillon avec titre, compositeur, licence et crédit pré-remplis (mêmes réponses que `/imports/url`) |

## Format des erreurs

Toute réponse non 2xx a le même corps, défini par `errorResponseSchema` (`packages/contracts`) :

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid json",
    "requestId": "5fbe1cc2-89f9-4630-a8c7-c1a010d7c97a",
    "details": [{ "path": "title", "message": "Too small: expected string to have >=1 characters" }]
  }
}
```

| Code | Statut | Quand |
|---|---|---|
| `BAD_REQUEST` | 400 | Requête mal formée (hors validation de schéma) |
| `VALIDATION_ERROR` | 400 | Entrée refusée par un schéma zod : `details` liste les champs invalides |
| `UNAUTHORIZED` | 401 | Pas de session valide |
| `FORBIDDEN` | 403 | Session valide, action interdite (par exemple un `Origin` invalide) |
| `NOT_FOUND` | 404 | Ressource ou route inconnue |
| `CONFLICT` | 409 | Doublon (par exemple un MIDI déjà importé) |
| `PAYLOAD_TOO_LARGE` | 413 | Fichier ou corps trop gros |
| `RATE_LIMITED` | 429 | Trop de tentatives (connexion) |
| `INTERNAL_ERROR` | 500 | Erreur inattendue : message générique, détail uniquement dans les logs |

- **Côté serveur** : on lève une `AppError(code, message, { details?, cause? })`. Le statut HTTP est déduit du code à un seul endroit (`shared/http/errors.ts`), et le gestionnaire global (`shared/http/error-handler.ts`) produit le corps de la réponse.
- **Le `message` d'une `AppError` est montré au client.** Une erreur non prévue ne l'est jamais : on la logue avec sa pile, et le client reçoit « An unexpected error occurred ».
- **Validation** : `validate("json" | "query" | "param" | …, schema)` (`shared/http/validation.ts`) enveloppe `@hono/zod-validator` et produit un `VALIDATION_ERROR`.
- **`requestId`** : il est repris de l'en-tête `X-Request-Id` s'il est fourni, sinon généré. Il est renvoyé dans cet en-tête et présent dans tous les logs de la requête : c'est lui qui relie un retour utilisateur à une ligne de log.

## Logs

- Une ligne JSON par événement : `level`, `time`, `message`, `service`, plus le contexte. Les erreurs sont sérialisées avec leur pile.
- Un **log d'accès** par requête : `method`, `path`, `status`, `durationMs`, `requestId`. Niveau `info`, `warn` pour un 4xx, `error` pour un 5xx, et `debug` pour `/api/health` (sondé en continu par Dokploy).
- Le niveau minimal se règle avec `LOG_LEVEL` (`debug` | `info` | `warn` | `error`, `info` par défaut).
- Dans un handler, `c.var.logger` est le logger lié à la requête.

