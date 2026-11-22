// System (end-to-end) tests against a deployed CategorAIze (Prompt B).
// `pnpm test:e2e` runs this against SYSTEM_WEB_URL (default: production).
// Results: docs/testing/system/results/playwright.xml; screenshots, videos and
// traces: docs/testing/system/artifacts/playwright/.
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const root = path.resolve(import.meta.dirname, "../..");
const baseURL =
  process.env.SYSTEM_WEB_URL ?? "https://categoraize-35rdktlybq-eu.a.run.app";

export default defineConfig({
  testDir: "./__tests__/system",
  testMatch: "**/*.spec.ts",
  timeout: 60_000,
  retries: 0,
  workers: 2,
  outputDir: path.join(root, "docs/testing/system/artifacts/playwright"),
  reporter: [
    ["list"],
    [
      "junit",
      {
        outputFile: path.join(root, "docs/testing/system/results/playwright.xml"),
      },
    ],
  ],
  use: {
    baseURL,
    screenshot: "on",
    video: "retain-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, grepInvert: /@mobile/ },
    {
      name: "mobile-390",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: false },
      grep: /@mobile/,
    },
  ],
});
