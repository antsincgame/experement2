// Limits frontend Vitest runs to app-side tests so backend suites stay owned by the agent package.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["agent/**", "node_modules/**"],
  },
});
