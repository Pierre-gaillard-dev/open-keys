# Open Keys — Architecture : Flux principaux

[← Sommaire](./README.md)

## Import

```mermaid
sequenceDiagram
  participant W as Web
  participant A as API
  participant C as core
  participant F as Stockage
  participant D as SQLite
  W->>A: POST /api/imports (fichier | url)
  A->>A: validation (taille, MThd, SSRF)
  A->>C: analyzeMidi(octets)
  C-->>A: analyse + suggestHandMapping
  A->>F: écrit <sha256>.mid
  A->>D: songs(state=draft) + song_tracks
  A-->>W: brouillon (pistes, proposition)
  W->>W: écran de vérification + aperçu
  W->>A: GET /api/songs/:id/cover-suggestions?title&composer
  A->>A: MusicBrainz/CAA + Wikidata (en parallèle, timeout 5 s)
  A-->>W: candidats (vignettes, source, crédit)
  W->>A: POST /api/imports/:id/confirm (métadonnées, mapping, couverture choisie)
  A->>A: téléchargement + sharp → WebP 720×720
  A->>F: écrit covers/<sha256>.webp
  A->>D: songs(state=ready, cover_*), tags
  A-->>W: morceau
```

## Synchronisation hors-ligne

```mermaid
sequenceDiagram
  participant UI
  participant QC as Cache des requêtes<br/>(sauvegardé dans IndexedDB)
  participant OB as Outbox (IndexedDB)
  participant A as API
  UI->>QC: écriture appliquée tout de suite (réglages, boucle, session)
  UI->>OB: PUT { chemin, corps } (remplace un PUT en attente sur le même chemin)
  OB->>A: PUT idempotent, dans l'ordre
  alt accepté
    A-->>OB: 2xx → retiré de la file, données rafraîchies
  else réseau injoignable
    OB->>OB: hors-ligne, nouvel essai (retour en ligne, démarrage, toutes les 60 s)
  else 5xx, 408, 429
    OB->>OB: gardé, nouvel essai plus tard
  else 401
    OB->>UI: retour à la connexion, écritures gardées
  else autre 4xx (rejeté)
    OB->>OB: abandonné (ne bloque pas la file)
  end
```

- **Écriture** : toujours locale d'abord, en ligne comme hors-ligne. Une boucle est supprimée par un `PUT` avec `deletedAt` (suppression logique) : l'outbox ne contient que des `PUT`.
- **Connectivité** : partagée avec TanStack Query (`onlineManager`). Une requête qui n'atteint pas l'API passe l'app hors-ligne : les requêtes se mettent en pause et gardent leurs données. Une sonde de `/api/health` toutes les 15 s, ou l'événement `online` du navigateur, la repasse en ligne.
- **Lecture hors-ligne** : le cache des requêtes est restauré avant le premier rendu (la garde d'authentification voit l'utilisateur). Les MIDI viennent de `midiFiles`. Les favoris y sont téléchargés en arrière-plan quand on est en ligne.
