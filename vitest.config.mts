import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The tests import the same modules the app does, so `@/*` — which
  // `tsconfig.json` points at the repo root — has to resolve here too.
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
});
