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
