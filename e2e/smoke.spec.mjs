import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "@bgotink/playwright-coverage";
import assert from "node:assert/strict";
import { assertHeaderDoesNotShowSelectDirectory } from "../tests/header-select-directory.mjs";
import { assertMultiModeToggle } from "../tests/multi-mode-toggle.mjs";
import { assertWaveformButtonOpensEmptyState } from "../tests/waveform-button-opens-empty-state.mjs";
import { assertExportPromptsFilenameInEmptyState } from "../tests/export-prompts-filename-empty-state.mjs";
import { assertFormatMenuCategories } from "../tests/format-menu-categories.mjs";
import { assertTermsAndPrivacyLinks } from "../tests/tos-privacy-links.mjs";
import { assertSampleRateOptions } from "../tests/sample-rate-options.mjs";
import { assertSp404Mk2PresetDefaults } from "../tests/sp404mkii-preset.mjs";
import { assertFilenameShortener } from "../tests/filename-shortener.mjs";
import { assertDevModeButton } from "../tests/dev-mode-button.mjs";
import { assertFilePaneKeyboardNavigation } from "../tests/filepane-keyboard-navigation.mjs";
import { assertSearchModesAllFoldersFiles } from "../tests/search-modes-all-folders-files.mjs";
import { assertSourceFolderDoesNotAutoSelectDest } from "../tests/source-folder-does-not-auto-select-dest.mjs";
import { assertExpandedFoldersPersistOnReload } from "../tests/persist-expanded-folders.mjs";
import { assertRevealInFinder } from "../tests/reveal-in-finder.mjs";
import { assertRevealInFinderDest } from "../tests/reveal-in-finder-dest.mjs";
import { assertRevealFileInFinder } from "../tests/reveal-file-in-finder.mjs";
import { assertRevealInFinderDoesNotOpenPickerFallback } from "../tests/reveal-in-finder-no-picker-fallback.mjs";
import { assertSearchQueryPersistsWhenNavigatingSearchResult } from "../tests/search-navigation-preserves-query.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3010";

test.beforeEach(async ({ context }) => {
  await context.addInitScript({
    path: path.join(__dirname, "../scripts/integration/browser-init.js"),
  });
});

test("full smoke flow", async ({ page }) => {
  page.setDefaultTimeout(15000);
  await page.goto("/", { waitUntil: "networkidle" });

  await page.getByRole("heading", { name: "OctaCard" }).waitFor({ state: "visible" });
  await assertHeaderDoesNotShowSelectDirectory(page);
  const convertButton = page.getByRole("button", { name: "Convert" });
  const devModeButton = page.getByTestId("dev-mode-button");
  const formatButton = page.getByTestId("format-settings-button");
  await convertButton.waitFor({ state: "visible" });
  await devModeButton.waitFor({ state: "visible" });
  await formatButton.waitFor({ state: "visible" });
  await page.getByRole("button", { name: "About" }).waitFor({ state: "visible" });
  await assertMultiModeToggle(page);
  await assertWaveformButtonOpensEmptyState(page);
  await assertExportPromptsFilenameInEmptyState(page);
  await assertFormatMenuCategories(page);
  await assertTermsAndPrivacyLinks(page, { baseUrl });
  await assertSampleRateOptions(page);
  await assertSp404Mk2PresetDefaults(page);
  await assertFilenameShortener(page);
  const convertBox = await convertButton.boundingBox();
  const formatBox = await formatButton.boundingBox();
  assert.ok(convertBox, "Expected convert button to have a visible bounding box.");
  assert.ok(formatBox, "Expected format button to have a visible bounding box.");
  const viewport = page.viewportSize();
  assert.ok(viewport, "Expected viewport size to be available.");
  const convertCenterX = convertBox.x + convertBox.width / 2;
  const viewportCenterX = viewport.width / 2;
  const centerDelta = Math.abs(convertCenterX - viewportCenterX);
  assert.ok(centerDelta <= 80, `Expected convert button to be centered. Delta=${centerDelta}`);
  assert.ok(convertBox.x >= 0, "Expected convert button to remain inside the viewport.");
  assert.ok(convertBox.x + convertBox.width <= viewport.width, "Expected convert button to remain fully visible.");
  await assertDevModeButton(page, { convertButton, formatButton });
  await page.locator("#main-layout").waitFor({ state: "visible" });
  const sourcePanel = page.getByTestId("panel-source");
  const destPanel = page.getByTestId("panel-dest");
  await sourcePanel.waitFor({ state: "visible" });
  await destPanel.waitFor({ state: "visible" });
  const sourceBox = await sourcePanel.boundingBox();
  const destBox = await destPanel.boundingBox();
  assert.ok(sourceBox && destBox, "Expected source and destination panels to be visible.");
  const averageWidth = (sourceBox.width + destBox.width) / 2;
  const widthDelta = Math.abs(sourceBox.width - destBox.width);
  assert.ok(widthDelta <= averageWidth * 0.05, `Expected panels near equal width.`);
  await sourcePanel.locator('button[title="Browse for folder to navigate to"]').click();
  const sourceAlphaNode = page.getByTestId("tree-node-source-_Alpha");
  await sourceAlphaNode.waitFor({ state: "visible" });
  await assertFilePaneKeyboardNavigation(page);
  await assertSearchModesAllFoldersFiles(page);
  await assertSourceFolderDoesNotAutoSelectDest(page);
  await assertExpandedFoldersPersistOnReload(page);
  await sourceAlphaNode.waitFor({ state: "visible" });
  await page.getByTestId("favorite-open-source-_Alpha").waitFor({ state: "visible" });
  await page.getByTestId("favorite-open-dest-_Beta").waitFor({ state: "visible" });
  await assertRevealInFinder(page);
  await page.evaluate(() => { window.__revealCalls = []; });
  await assertRevealInFinderDest(page);
  await page.evaluate(() => { window.__revealCalls = []; });
  await assertRevealFileInFinder(page);
  await assertRevealInFinderDoesNotOpenPickerFallback(page);
  await page.evaluate(() => {
    const sourceFavorite = document.querySelector('[data-testid="favorite-open-source-_Alpha"]');
    const destFavorite = document.querySelector('[data-testid="favorite-open-dest-_Beta"]');
    if (sourceFavorite instanceof HTMLElement) sourceFavorite.click();
    if (destFavorite instanceof HTMLElement) destFavorite.click();
  });
  await page.waitForFunction(() => Array.isArray(window.__pickerCalls) && window.__pickerCalls.length >= 3);
  const pickerCalls = await page.evaluate(() => window.__pickerCalls.slice(0, 3));
  assert.equal(pickerCalls.length, 3, "Expected three picker calls.");
  assert.deepEqual(
    pickerCalls.map((c) => c.pickerId),
    ["octacard-root-directory-picker", "octacard-source-directory-picker", "octacard-dest-directory-picker"]
  );
  assert.equal(pickerCalls[1].startInName, "Alpha", "Source favorite should open from Alpha.");
  assert.equal(pickerCalls[2].startInName, "Beta", "Dest favorite should open from Beta.");
  await sourcePanel.locator('button[title="Root"]').click();
  await destPanel.locator('button[title="Root"]').click();
  await page.getByTestId("tree-node-source-_Alpha").waitFor({ state: "visible" });
  await page.getByTestId("tree-node-dest-_Beta").waitFor({ state: "visible" });
  await formatButton.click();
  await page.locator('label[for="sample-depth-16-bit"]').click();
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("dialog", { name: "Format Settings" }).waitFor({ state: "hidden" });
  await assertSearchQueryPersistsWhenNavigatingSearchResult(page);
  const title = await page.title();
  assert.ok(title.includes("OctaCard"), "Expected the page title to include OctaCard.");
});
