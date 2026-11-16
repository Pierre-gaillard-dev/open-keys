/**
 * Architecture rules — see docs/03-architecture/03-arborescence.md and docs/06-conventions.md.
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: "no-cross-feature-internals",
      comment:
        "A feature may only import another feature through its public index.ts (docs/06-conventions.md §1).",
      severity: "error",
      from: { path: "^apps/([^/]+)/src/features/([^/]+)/" },
      to: {
        path: "^apps/$1/src/features/[^/]+/",
        pathNot: ["^apps/$1/src/features/$2/", "^apps/$1/src/features/[^/]+/index\\.ts$"],
      },
    },
    {
      name: "shared-does-not-import-features",
      comment: "shared/ is generic and must not depend on features/.",
      severity: "error",
      from: { path: "^apps/([^/]+)/src/shared/" },
      to: { path: "^apps/$1/src/features/" },
    },
    {
      name: "core-is-pure",
      comment: "packages/core has no I/O: no Node built-ins (DOM is excluded by its tsconfig lib).",
      severity: "error",
      from: { path: "^packages/core/" },
      to: { dependencyTypes: ["core"] },
    },
    {
      name: "core-depends-on-nothing-internal",
      comment: "packages/core does not depend on other workspace code.",
      severity: "error",
      from: { path: "^packages/core/" },
      to: { path: "^(apps|packages/(?!core/))" },
    },
    {
      name: "packages-do-not-import-apps",
      severity: "error",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },
    {
      name: "apps-are-isolated",
      comment: "web and server only share code through packages/.",
      severity: "error",
      from: { path: "^apps/([^/]+)/" },
      to: { path: "^apps/", pathNot: "^apps/$1/" },
    },
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "not-to-dev-dep-in-production-code",
      comment: "Production code must not import devDependencies.",
      severity: "error",
      from: { path: "^(apps|packages)/[^/]+/src/", pathNot: "\\.test\\.tsx?$|/src/test/" },
      to: { dependencyTypes: ["npm-dev"], dependencyTypesNot: ["type-only"] },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(^|/)(dist|coverage)/" },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "types", "default"],
      extensions: [".ts", ".tsx", ".js", ".json"],
    },
  },
};
