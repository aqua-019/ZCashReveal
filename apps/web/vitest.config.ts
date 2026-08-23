/**
 * Unit test runner for @zcashreveal/web.
 *
 * Two suites live under `test/`, and they must never meet: `test/unit` is
 * vitest, `test/e2e` is Playwright against a built app. `include` is therefore
 * an allowlist, not a default - a Playwright spec picked up by vitest fails on
 * `test.describe` signatures rather than on anything real.
 *
 * `node` stays the DEFAULT environment, not the only one. Almost every unit
 * test here is a pure function and a DOM would be dead weight in it; a
 * `.test.tsx` file that renders a component opts in for itself with a
 * `@vitest-environment jsdom` docblock. Deliverable 8 names jsdom and
 * testing-library and a gate round found them absent - the estimate-rendering
 * check existed only in Playwright, which builds first and so does not fire
 * while a component is being edited.
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
    include: ["test/unit/**/*.test.ts", "test/unit/**/*.test.tsx"],
    exclude: ["node_modules/**", ".next/**", "test/e2e/**"],
  },
});
