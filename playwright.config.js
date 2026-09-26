// End-to-end tests: the real Chrome build of SwiftSkip on the local test
// pages (npm run test:e2e). Chrome only: Playwright can't load Firefox add-ons.

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "test/e2e",
  timeout: 60_000,
  // One browser at a time: each test launches Chrome with the extension.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  globalSetup: "./test/e2e/global-setup.js",
  webServer: {
    command: "node test/e2e/server.js",
    url: "http://localhost:8181/index.html",
    reuseExistingServer: !process.env.CI,
  },
  use: { trace: "retain-on-failure" },
});
