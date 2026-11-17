# Open Keys — Architecture : Stratégie de test

[← Sommaire](./README.md)

| Niveau | Cible | Outil |
|---|---|---|
| Unitaires | `packages/core` (analyse, heuristiques des mains, timeline) : **priorité n°1** | Vitest + MIDI de test du domaine public |
| Unitaires | services du serveur, `clock`/`transport` du lecteur | Vitest |
| Intégration | routes de l'API sur une base SQLite en mémoire | Vitest + `app.request()` de Hono |
| Parcours | l'app complète (routeur, requêtes, composants) sur une API simulée, runtime du lecteur simulé, IndexedDB simulée | Vitest + Testing Library + `fake-indexeddb` |
| E2E | lecture → vitesse → boucle ; mode avion → favori joué → boucle → synchro → autre appareil | Playwright (Firefox **et** Chromium) |
| Manuel | synchro son/image, fluidité | Pixel 10, checklist dans la roadmap |

## Tests de bout en bout (`e2e/`)

- **Paquet du workspace** `@open-keys/e2e` : `playwright.config.ts`, `tests/*.spec.ts`, `support/` (connexion et import par l'API).
- **Ce qui tourne** : le build de production du web (`vite preview`, Service Worker compris) et une vraie API (`tsx`) sur une base vide dans un dossier temporaire, avec le compte créé au démarrage.
- **Morceaux** : MIDI générés par `@open-keys/core/testing`, avec un nom unique dans le fichier (l'API refuse les doublons). Aucun fichier sous droits d'auteur.
- **Hors-ligne** : `context.setOffline()`, rechargement de la page servie par le Service Worker, puis un second contexte joue « l'autre appareil ».
- **Commandes** : `pnpm e2e` (les deux navigateurs). La première fois : `pnpm --filter @open-keys/e2e exec playwright install chromium firefox`.
- **CI** : job `e2e`, rapport HTML gardé 7 jours en cas d'échec.
