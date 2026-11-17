import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  platform: "node",
  target: "node26",
  outDir: "dist",
  clean: true,
  deps: {
    // Workspace packages are consumed as TypeScript sources: bundle them, with their own dependencies.
    alwaysBundle: [/^@open-keys\//, "@tonejs/midi"],
    onlyBundle: [/^@open-keys\//, "@tonejs/midi"],
  },
  // SQL migrations are applied at startup, from dist/migrations.
  copy: [{ from: "src/db/migrations", to: "dist" }],
});
