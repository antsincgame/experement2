import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@shared/plan-brief": path.join(repoRoot, "../src/shared/lib/plan-brief.ts"),
      "@shared/plan-brief.js": path.join(repoRoot, "../src/shared/lib/plan-brief.ts"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 10000,
  },
});
