import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { defineConfig } from "vitest/config";

const HERE = dirname(fileURLToPath(import.meta.url));


export default defineConfig({
  resolve: {
    // Resolve the workspace types package to its SOURCE, not to `dist`.
    //
    // Two reasons, and the second is the one that made it necessary. First, a
    // unit suite should exercise the code in the repository rather than an
    // artefact of a previous build: with the alias there is nothing to be stale.
    // Second, the `pretest` that used to guarantee `dist` existed had both this
    // package and apps/indexer running `tsc -b` over the SAME project at the
    // same time, because `pnpm -r` runs packages in parallel - and two
    // concurrent builds writing one output directory race. That surfaced as
    // A10 passing on one run of `pnpm -r test` and failing on the next with
    // "Failed to resolve entry for package @zcashreveal/types", which is the
    // very error L2's finding F-02-1 asked HANDOFF-03 to eliminate.
    //
    // With the alias, `pnpm -r test` needs no build at all and cannot race.
    alias: {
      "@zcashreveal/types": resolve(HERE, "../../packages/zec-types/src/index.ts"),
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
