/**
 * Unit test runner for @zcashreveal/web.
 *
 * Two suites live under `test/`, and they must never meet: `test/unit` is
 * vitest (pure functions, node environment, no DOM, no server), `test/e2e` is
 * Playwright against a built app. `include` is therefore an allowlist, not a
 * default - a Playwright spec picked up by vitest fails on `test.describe`
 * signatures rather than on anything real.
 *
 * The `@/` alias mirrors tsconfig.json `paths`, resolved from this file's own
 * URL so the config is independent of the process working directory (turbo and
 * pnpm both invoke it from places that are not apps/web).
 */
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { defineConfig } from "vitest/config";

const HERE = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": resolve(HERE, "src") },
  },
  // tsconfig.json sets `jsx: "preserve"` because Next.js compiles the JSX.
  // vitest has no Next.js in front of it, so the transform is named here; this
  // is what lets a test import a component module for its pure exports.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    globals: false,
    include: ["test/unit/**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", "test/e2e/**"],
  },
});
