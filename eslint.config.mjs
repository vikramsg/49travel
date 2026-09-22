import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    // Default ignores of eslint-config-next.
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Not frontend source: the Python project, its virtualenv, the gitignored
    // MOTIS install, and agent tooling output.
    "python/**",
    ".motis/**",
    ".agents/**",
    ".playwright-cli/**",
  ]),
]);

export default eslintConfig;
