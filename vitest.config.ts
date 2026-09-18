import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // `server-only` throws outside the React Server bundle; tests run server code directly.
      "server-only": path.resolve(import.meta.dirname, "tests/support/server-only.ts"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          setupFiles: ["tests/support/integration-setup.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          // Not part of the default run: seeds a large dataset (pnpm test:perf).
          name: "perf",
          include: ["tests/perf/**/*.test.ts"],
          environment: "node",
          setupFiles: ["tests/support/integration-setup.ts"],
          fileParallelism: false,
          testTimeout: 600_000,
          hookTimeout: 300_000,
        },
      },
    ],
  },
});
