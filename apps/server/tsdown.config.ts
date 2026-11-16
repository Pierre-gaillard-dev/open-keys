import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  platform: "node",
  target: "node26",
  outDir: "dist",
  clean: true,
  // Workspace packages are consumed as TypeScript sources: bundle them.
  noExternal: [/^@open-keys\//],
});
