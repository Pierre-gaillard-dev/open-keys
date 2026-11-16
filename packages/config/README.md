# @open-keys/config

Configurations TypeScript partagées :

| Fichier | Usage |
|---|---|
| `tsconfig.base.json` | Base stricte, sans DOM ni Node (utilisée par `packages/core` et `packages/contracts`) |
| `tsconfig.react.json` | Base + DOM + JSX (`apps/web`) |
| `tsconfig.node.json` | Base + types Node (`apps/server`) |

La configuration Biome est unique, à la racine du dépôt (`biome.json`).
