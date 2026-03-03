/**
 * Integration test that runs through all release notes for all versions.
 * Use while developing the release notes feature.
 *
 * Run with app already serving (e.g. pnpm dev):
 *   E2E_BASE_URL=http://localhost:3000 pnpm run it:release-notes
 *
 * Or use test:it:release-notes to build, preview, and run.
 */

import { chromium } from "playwright";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, mkdir } from "node:fs/promises";

import { testInitScript } from "./init-test.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const headless = process.env.PW_HEADLESS !== "false";
const outputDir = path.resolve(__dirname, "../../output/playwright");

const browser = await chromium.launch({ headless });
const page = await browser.newPage();
page.setDefaultTimeout(15000);

try {
  await page.addInitScript(testInitScript);

  const url = new URL(baseUrl);
  url.searchParams.set("release-tour", "1");
  await page.goto(url.toString(), { waitUntil: "networkidle" });

  await page.getByRole("heading", { name: "OctaCard" }).waitFor({ state: "visible" });

  const panel = page.getByTestId("release-notes-panel");
  await panel.waitFor({ state: "visible" });
  assert.ok(await panel.isVisible(), "Expected release notes panel to be visible");

  // Load expected structure from index
  const indexPath = path.resolve(__dirname, "../../public/release-notes/index.json");
  const indexData = JSON.parse(await readFile(indexPath, "utf-8"));
  const releases = indexData.releases ?? [];
  assert.ok(releases.length > 0, "Expected at least one release in index.json");

  let totalFeatures = 0;
  const featureCounts = [];
  for (const rel of releases) {
    const notesPath = path.resolve(__dirname, "../../public", rel.path.replace(/^\//, ""));
    const notes = JSON.parse(await readFile(notesPath, "utf-8"));
    const features = (notes.features ?? []).filter((f) => f.include !== false);
    featureCounts.push(features.length);
    totalFeatures += features.length;
  }

  console.log(`Running through ${releases.length} release(s), ${totalFeatures} feature(s) total`);

  let releaseIndex = 0;
  let featureIndex = 0;

  while (releaseIndex < releases.length) {
    const expectedFeatures = featureCounts[releaseIndex];
    const version = releases[releaseIndex].version;

    for (let f = 0; f < expectedFeatures; f++) {
      const featureTitle = await panel.locator("h3").first().textContent();
      assert.ok(featureTitle?.trim(), `Expected feature title for v${version} feature ${f + 1}`);

      const nextFeatureBtn = panel.getByRole("button", { name: "Next feature" });
      if (f < expectedFeatures - 1 && (await nextFeatureBtn.isEnabled().catch(() => false))) {
        await nextFeatureBtn.click();
        await page.waitForTimeout(150);
      }
      featureIndex++;
    }

    const nextReleaseBtn = panel.getByRole("button", { name: "Next release" });
    if (releaseIndex < releases.length - 1 && (await nextReleaseBtn.isEnabled().catch(() => false))) {
      await nextReleaseBtn.click();
      await page.waitForTimeout(300);
      releaseIndex++;
    } else {
      break;
    }
  }

  assert.equal(releaseIndex, releases.length - 1, "Expected to reach last release");
  assert.equal(featureIndex, totalFeatures, `Expected to traverse all ${totalFeatures} features`);

  const dismissBtn = panel.getByRole("button", { name: "Dismiss" });
  await dismissBtn.click();
  await page.waitForTimeout(200);
  await panel.waitFor({ state: "detached", timeout: 3000 }).catch(() => {});

  const formatButton = page.getByTestId("format-settings-button");
  assert.ok(await formatButton.isVisible(), "Expected app to be usable after tour dismiss");

  console.log("Release notes tour: OK");
} catch (error) {
  try {
    await mkdir(outputDir, { recursive: true });
    await page.screenshot({
      path: path.join(outputDir, "release-notes-tour-failure.png"),
      fullPage: true,
      timeout: 5000,
    });
  } catch (e) {
    console.error("Failed to capture screenshot:", e);
  }
  console.error("Release notes tour failed:", error);
  process.exitCode = 1;
} finally {
  await browser.close();
}

process.exit(process.exitCode ?? 0);
