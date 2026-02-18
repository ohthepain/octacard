import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const headless = process.env.PW_HEADLESS !== "false";
const outputDir = path.resolve("output/playwright");

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless });
const page = await browser.newPage();
page.setDefaultTimeout(15000);

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });

  await page.getByRole("heading", { name: "OctaCard" }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Convert" }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "About" }).waitFor({ state: "visible" });
  await page.locator("#main-layout").waitFor({ state: "visible" });

  const sourceSelect = page.getByTestId("select-folder-source");
  const destSelect = page.getByTestId("select-folder-dest");
  await sourceSelect.waitFor({ state: "visible" });
  await destSelect.waitFor({ state: "visible" });

  const sourcePopup = await sourceSelect.getAttribute("aria-haspopup");
  const destPopup = await destSelect.getAttribute("aria-haspopup");
  assert.ok(!sourcePopup, "Select folder should not be a popup trigger (source).");
  assert.ok(!destPopup, "Select folder should not be a popup trigger (dest).");

  const title = await page.title();
  assert.ok(title.includes("OctaCard"), "Expected the page title to include OctaCard.");
} catch (error) {
  await page.screenshot({ path: path.join(outputDir, "smoke-failure.png"), fullPage: true });
  console.error("Integration test failed:", error);
  process.exitCode = 1;
} finally {
  await browser.close();
}

if (process.exitCode) {
  process.exit(process.exitCode);
}
