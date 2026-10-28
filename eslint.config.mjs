import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Tesseract.js runtime copied from node_modules (scripts/copy-tesseract.mjs).
    "public/tesseract/**",
    // Retired Sprint 1 stack, kept for reference only — see docs/legacy-notes.md.
    // testcases/ is pre-existing CommonJS test code for that stack; left as-is
    // per instruction not to touch it, so it's out of scope for this config too.
    "legacy/**",
    "testcases/**",
  ]),
]);

export default eslintConfig;
