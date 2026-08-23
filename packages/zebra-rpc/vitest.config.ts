import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { defineConfig } from "vitest/config";

const HERE = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    // The same alias apps/gateway and apps/indexer use: resolve the workspace
    // types package to its SOURCE. A unit suite should exercise the code in the
    // repository rather than an artefact of a previous build, and with the alias
    // `pnpm -r test` needs no prior build here and cannot race one (LEDGER-03,
    // finding F-02-1).
    alias: { "@zcashreveal/types": resolve(HERE, "../zec-types/src/index.ts") },
  },
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    environment: "node",
    globals: false,
  },
});
