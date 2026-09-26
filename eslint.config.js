// ESLint: catches mistakes (unused variables, undefined names, …).
// Formatting is Prettier's job (see .prettierrc.json), not ESLint's.

import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "dist/",
      "dist-e2e/",
      "web-ext-artifacts/",
      "node_modules/",
      ".profiles/",
      "test/fixtures/media/",
      "playwright-report/",
      "test-results/",
    ],
  },
  js.configs.recommended,
  {
    files: ["src/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        // Replaced at build time (scripts/build.js).
        __BROWSER__: "readonly",
        __DEV__: "readonly",
        __DEV_RELOAD__: "readonly",
      },
    },
  },
  {
    files: ["scripts/**/*.js", "test/**/*.js", "*.config.js"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Page scripts in the e2e tests run in the browser.
    files: ["test/e2e/**/*.js"],
    languageOptions: { globals: { ...globals.browser, ...globals.webextensions } },
  },
  {
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },
];
