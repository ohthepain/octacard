import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineCoverageReporterConfig } from "@bgotink/playwright-coverage";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3010";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [
    ["list"],
    [
      "@bgotink/playwright-coverage",
      defineCoverageReporterConfig({
        sourceRoot: path.join(__dirname, "src"),
        resultDir: path.join(__dirname, "coverage", "e2e"),
        exclude: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}", "**/main.tsx"],
        reports: [
          ["text-summary", { file: null }],
          ["json", { file: "coverage-final.json" }],
        ],
      }),
    ],
  ],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.CI
    ? undefined
    : {
        command: "pnpm run preview:it",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
      },
});
