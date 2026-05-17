import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    environment: "node",
    globals: false,
    pool: "threads",
    testTimeout: 20_000,
    typecheck: { enabled: false },
  },
});
