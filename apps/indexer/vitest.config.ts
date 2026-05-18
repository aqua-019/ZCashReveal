import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    environment: "node",
    globals: false,
    pool: "forks",
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
