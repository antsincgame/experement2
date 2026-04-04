// Limits ESLint to the Expo app so lint stays deterministic and does not wander into backend/generated code.
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    rules: {
      "unicode-bom": "off",
    },
  },
  {
    ignores: [
      "agent/**",
      "workspace/**",
      ".expo/**",
      "dist/**",
      "node_modules/**",
    ],
  }
]);
