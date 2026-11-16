# Open Keys — Architecture : Stratégie de test

[← Sommaire](./README.md)

| Niveau | Cible | Outil |
|---|---|---|
| Unitaires | `packages/core` (analyse, heuristiques des mains, timeline) : **priorité n°1** | Vitest + MIDI de test du domaine public |
| Unitaires | services du serveur, `clock`/`transport` du lecteur | Vitest |
| Intégration | routes de l'API sur une base SQLite en mémoire | Vitest + `app.request()` de Hono |
| E2E | import → lecture → boucle → hors-ligne | Playwright (Firefox **et** Chromium) |
| Manuel | synchro son/image, fluidité | Pixel 10, checklist dans la roadmap |
