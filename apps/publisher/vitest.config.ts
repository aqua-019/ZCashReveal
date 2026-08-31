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
    // SCHEMA-PER-RUN, REUSING THE INDEXER'S GLOBAL SETUP, AND WITHOUT IT THIS
    // PACKAGE TRUNCATES THE SHARED DATABASE (gate round 1, HIGH).
    //
    // `snapshot-inputs.integration.test.ts` TRUNCATEs `pool_snapshots`, `blocks`,
    // `pool_nullifiers` and `pool_anchors` in `beforeEach`, and reads
    // `ZR_TEST_SCHEMA` to scope itself. That variable is set by
    // `apps/indexer/test/global-setup.ts` - which this config did not run - so
    // the suite's comment claiming it matched the indexer's isolation was true
    // of the READING code and false of the RUN: with no schema, `search_path`
    // stayed at `public` and the TRUNCATEs hit the shared tables. Reproduced: a
    // marker row in `public.blocks` was gone after `pnpm --filter
    // @zcashreveal/publisher test`, and the fixture rows survived the run, so a
    // locally-run publisher would then read five fabricated Orchard snapshots
    // and publish a drain from them.
    //
    // That is LEDGER-06 Q6 reintroduced, through exactly the door
    // `_setup.ts` names: "the one connection that forgot to opt in". The setup
    // module creates a schema, applies all six migrations into it and drops it
    // at teardown, so pointing this package at the same file makes the isolation
    // a property of the run rather than of a comment.
    globalSetup: ["../indexer/test/global-setup.ts"],
    // The integration suite shares one database across files; concurrent
    // `beforeEach` TRUNCATEs from different files race. Same reason, same
    // setting, as apps/indexer.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
