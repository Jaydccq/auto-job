import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Pick the "development" condition in package.json `exports` so
    // workspace deps (@career-ops/shared) resolve to TypeScript source
    // during tests — no `dist/` build needed for vitest.
    conditions: ["development", "import", "node", "default"],
  },
  test: {
    include: ["src/**/*.test.ts"],
    reporter: "verbose",
  },
});
