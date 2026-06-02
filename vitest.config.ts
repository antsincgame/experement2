// Limits frontend Vitest runs to app-side tests so backend suites stay owned by the agent package.
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["agent/**", "node_modules/**"],
  },
});
