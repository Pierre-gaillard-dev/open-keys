# Open Keys — Conventions de code

Une rigueur proche du Clean Code, sans dogmatisme. Ce document est la référence pour le code généré par IA comme pour les revues.

## 1. Découpage

- **Découpage par feature**, côté front comme côté back (voir `03-architecture/03-arborescence.md`). Une feature contient tout ce qui la concerne.
- **Un fichier = une responsabilité**. Le rôle apparaît dans le suffixe du nom :

| Suffixe | Contenu | Côté |
|---|---|---|
| `*.routes.ts` | Handlers HTTP Hono : validation, appel du service, réponse. Aucune logique métier | server |
| `*.service.ts` | Logique métier, orchestration | server |
| `*.queries.ts` | Accès à la base (Drizzle) **uniquement** : pas de règles métier | server |
| `*.schema.ts` | Tables Drizzle | server |
| `*.contract.ts` | Schémas zod des entrées/sorties de l'API | packages/contracts |
| `*.api.ts` | Appels du client RPC | web |
| `*.queries.ts` | Hooks TanStack Query (clés, invalidations) | web |
| `*.store.ts` | Store Zustand | web |
| `*.schema.ts` | Schéma zod d'un formulaire | web |
| `*.types.ts` | Types sans implémentation | partout |
| `*.test.ts` | Tests, à côté du fichier testé | partout |

- **`index.ts` = API publique** d'une feature ou d'un package. Ce qu'il n'exporte pas est privé.
- Règles d'import : voir `03-architecture/03-arborescence.md`. `core` est pur (pas de DOM, pas de Node, pas d'I/O).

## 1 bis. Outils qui font respecter ces règles

| Règle | Outil | Quand |
|---|---|---|
| Formatage, imports triés, règles de code (pas de `any`, pas de `!`, pas d'`enum`, pas d'export par défaut, `import type`, complexité limitée, noms de fichiers…) | Biome (`biome.json`) | Pre-commit (lefthook) + CI |
| Frontières entre features, pureté de `core`, isolation des apps, absence de cycles | dependency-cruiser (`.dependency-cruiser.cjs`) | CI (`pnpm deps:check`) |
| Rigueur des types (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `erasableSyntaxOnly`…) | TypeScript (`packages/config`) | CI (`pnpm typecheck`) |
| Commits conventionnels | commitlint | Hook `commit-msg` |
| Dépendances déclarées dans chaque package, versions alignées | Biome `noUndeclaredDependencies` + catalog pnpm | Pre-commit + CI |

`pnpm verify` lance localement toute la chaîne de la CI.

## 2. Nommage

- Fichiers en `kebab-case` (sauf composants React en `PascalCase.tsx`).
- Fonctions nommées par un verbe (`suggestHandMapping`), booléens en `is`/`has`/`should`.
- Unités dans les noms : `_ms`, `_pct`, `pitch` (numéro de note MIDI).
- Pas d'abréviations obscures.
- Imports relatifs **sans extension** (`./note-name`) ; un dossier s'importe par son `index.ts`.

## 3. TypeScript

- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- Pas de `any` ni de `as` non justifiés (un commentaire est obligatoire s'il le faut vraiment).
- Les types des données de l'API sont dérivés des schémas zod (`z.infer`), sans duplication.
- Erreurs métier : `throw new AppError(code, message)` (codes dans `packages/contracts`), converties en statut HTTP à un seul endroit (`shared/http/errors.ts`). Jamais de `c.json(…, 4xx)` construit à la main dans une route. Le format est décrit dans `03-architecture/06-api.md`.
- Validation des entrées : toujours `validate(cible, schéma)`, avec un schéma de `packages/contracts`.
- Logs : `c.var.logger` dans une requête, jamais `console`.

## 4. React

- Les composants **affichent**. La logique vit dans des hooks, des services ou des stores.
- Pas de fetch dans les composants : on passe par les hooks `*.queries.ts`.
- **Lecteur** : aucun état qui change à chaque image dans React. Le renderer lit le store et l'horloge directement.
- Composants réutilisables sans logique métier dans `shared/ui`.

## 5. Base de données

- Toute évolution passe par une migration drizzle-kit commitée. On ne modifie jamais une migration déjà appliquée.
- Les requêtes multi-tables qui modifient des données se font en transaction.
- Conventions de colonnes : voir `04-database.md` §1.

## 6. Tests

- `packages/core` : tests unitaires obligatoires sur toute fonction publique.
- Serveur : un test d'intégration par route (succès + erreur principale).
- Correction d'un bug = un test qui le reproduit.
- Les MIDI de test sont exclusivement du domaine public (dossier `fixtures/`).

## 7. Git et PR

- Commits conventionnels (`feat(player): …`, `fix(import): …`).
- Une PR = une tâche de la roadmap, référencée dans sa description.
- CI verte obligatoire : lint, vérification des types, tests, build.
- Tout choix d'architecture non trivial est documenté (mise à jour de `docs/`, ou une ligne dans le tableau des décisions de `01-cadrage.md`).

## 8. Interdits

- Secrets, jetons, `.env` réels dans le dépôt.
- MIDI sous droits d'auteur dans le dépôt.
- Logique métier dans les routes ou les composants.
- Import direct d'un fichier interne d'une autre feature.
- Dépendance ajoutée sans justification dans la PR.
