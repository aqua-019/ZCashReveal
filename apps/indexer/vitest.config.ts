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
      // Same reasoning for the RPC client package, which HANDOFF-05 moved out
      // of this app: the block-decoder suite imports `RpcBlock` from it.
      "@zcashreveal/zebra-rpc": resolve(HERE, "../../packages/zebra-rpc/src/index.ts"),
      // AND THE ESTIMATORS, which HANDOFF-09a moved OUT of this app. Six suites
      // here import `@zcashreveal/instruments`; without this line they resolve
      // to `packages/zec-instruments/dist` and never load a source file from the
      // branch. `pnpm -r test` does not run turbo, so nothing rebuilds that dist
      // first and the suite asserts on whatever artefact is on disk.
      //
      // THIS IS THE SECOND SITE OF A ONE-SITE FIX. Gate round 2 found the same
      // defect in `apps/publisher/vitest.config.ts` and fixed it there; the move
      // added the dependency to BOTH apps and only one alias list gained a line.
      // Proven: with `unprovableZat` mutated in the package source, the
      // publisher suite went red and `audit-records.test.ts` here stayed at
      // 5 passed - a file whose import block the same commit had just edited.
      "@zcashreveal/instruments": resolve(HERE, "../../packages/zec-instruments/src/index.ts"),
      // Same shape, pre-existing: `analysis/__tests__/toolkit.test.ts` imports
      // this package and had no alias either.
      "@zcashreveal/content": resolve(HERE, "../../packages/content/src/index.ts"),
    },
  },
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    environment: "node",
    globals: false,
    pool: "forks",
    // Gives this RUN its own Postgres schema and drops it afterwards, so two
    // concurrent vitest processes on one database cannot truncate each other's
    // rows. See the header of test/global-setup.ts for why schema-per-run was
    // chosen over an advisory lock or a database per worker.
    globalSetup: ["./test/global-setup.ts"],
    // Disable cross-file parallelism: integration tests share a single
    // Postgres database, so concurrent beforeEach TRUNCATEs from different
    // files race and wipe each other's mid-test rows. Sequential file
    // execution + per-file forked processes gives clean DB state per file
    // while still allowing parallel test execution WITHIN a file when safe.
    fileParallelism: false,
    testTimeout: 20_000,
    typecheck: { enabled: false },
  },
});
