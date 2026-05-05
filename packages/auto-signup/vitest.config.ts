import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    conditions: ["development", "import", "node", "default"],
  },
  test: {
    include: ["test/**/*.test.ts"],
    reporter: "verbose",
    testTimeout: 30_000,
  },
});
