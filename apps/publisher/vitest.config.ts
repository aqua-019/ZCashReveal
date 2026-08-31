import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { defineConfig } from "vitest/config";

const HERE = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    // Resolve the workspace packages to their SOURCE, not to `dist`.
    //
    // The same two reasons apps/gateway's config records, and the second one is
    // the one that made it necessary there: a unit suite should exercise the
    // code in the repository rather than an artefact of a previous build, and a
    // `pretest` that guaranteed `dist` existed would have several packages
    // running `tsc -b` over the SAME project concurrently under `pnpm -r test`,
    // which races on the output directory.
    alias: {
      "@zcashreveal/types": resolve(HERE, "../../packages/zec-types/src/index.ts"),
      // ADDED IN HANDOFF-09a, AND ITS ABSENCE MADE THE HANDOFF'S OWN ASSERTIONS
      // TEST AN ARTEFACT. This app gained a fourth workspace dependency in the
      // commit that wired the real estimators, and the alias did not gain a
      // line, so `instruments-wired.test.ts` - the suite written to prove the
      // four panels are non-null because the REAL estimators run - resolved
      // `@zcashreveal/instruments` to `packages/zec-instruments/dist/index.js`
      // and never loaded a source file from the branch. A wrong edit in that
      // package was invisible to `pnpm --filter @zcashreveal/publisher test` and
      // to `pnpm -r test`, neither of which builds, until someone rebuilt.
      "@zcashreveal/instruments": resolve(HERE, "../../packages/zec-instruments/src/index.ts"),
      "@zcashreveal/zebra-rpc": resolve(HERE, "../../packages/zebra-rpc/src/index.ts"),
      "@zcashreveal/content": resolve(HERE, "../../packages/content/src/index.ts"),
    },
  },
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    environment: "node",
    globals: false,
  },
});
