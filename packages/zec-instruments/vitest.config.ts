import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { defineConfig } from "vitest/config";

const HERE = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    // The same alias apps/indexer, apps/gateway and packages/zebra-rpc use:
    // resolve the workspace types package to its SOURCE. A unit suite should
    // exercise the code in the repository rather than an artefact of a previous
    // build, and with the alias `pnpm -r test` needs no prior build here and
    // cannot race one (LEDGER-03, finding F-02-1).
    alias: { "@zcashreveal/types": resolve(HERE, "../zec-types/src/index.ts") },
  },
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    environment: "node",
    globals: false,
    // These suites carry fast-check properties whose default budgets are set
    // per-property in the tests themselves; the 5s vitest default is not enough
    // for the 300-run properties HANDOFF-08 and -09 wrote. The indexer's config
    // set 20s for the same reason and these files came from there, so the number
    // moves with them rather than being re-chosen here.
    testTimeout: 20_000,
  },
});
