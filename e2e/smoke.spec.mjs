import { test } from "@bgotink/playwright-coverage";
import assert from "node:assert/strict";
import { testInitScript } from "../scripts/integration/init-test.mjs";
import { assertHeaderDoesNotShowSelectDirectory } from "../tests/header-select-directory.mjs";
import { assertMultiModeToggle } from "../tests/multi-mode-toggle.mjs";
import { assertWaveformButtonOpensEmptyState } from "../tests/waveform-button-opens-empty-state.mjs";
import { assertFormatMenuCategories } from "../tests/format-menu-categories.mjs";
import { assertTermsAndPrivacyLinks } from "../tests/tos-privacy-links.mjs";
import { assertSampleRateOptions } from "../tests/sample-rate-options.mjs";
import { assertSp404Mk2PresetDefaults } from "../tests/sp404mkii-preset.mjs";
import { assertFilenameShortener } from "../tests/filename-shortener.mjs";
import { assertDevModeButton } from "../tests/dev-mode-button.mjs";
import { assertFilePaneKeyboardNavigation } from "../tests/filepane-keyboard-navigation.mjs";
import { assertSearchModesAllFoldersFiles } from "../tests/search-modes-all-folders-files.mjs";
import { assertRevealInFinder } from "../tests/reveal-in-finder.mjs";
import { assertRevealFileInFinder } from "../tests/reveal-file-in-finder.mjs";
import { assertRevealInFinderDoesNotOpenPickerFallback } from "../tests/reveal-in-finder-no-picker-fallback.mjs";
import { assertSearchQueryPersistsWhenNavigatingSearchResult } from "../tests/search-navigation-preserves-query.mjs";
import { waitForPageCondition } from "../tests/wait-utils.mjs";
import { ensureMockDestRoot } from "../tests/integration-fs-helpers.mjs";

const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3010";

const mockAuthSession = {
  user: { id: "test-user", email: "test@example.com", name: "Test User" },
  session: {
    id: "test-session",
    userId: "test-user",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  },
};

test.beforeEach(async ({ context, page }) => {
  await context.addInitScript(testInitScript);
  await page.route("**/api/auth/**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockAuthSession),
    });
  });
});

test("full smoke flow", async ({ page }) => {
  page.setDefaultTimeout(15000);
  await page.goto("/", { waitUntil: "networkidle" });

  await page.getByRole("heading", { name: "OctaCard" }).waitFor({ state: "visible" });
  await assertHeaderDoesNotShowSelectDirectory(page);
  const convertButton = page.getByTestId("convert-button");
  const localModeButton = page.getByRole("button", { name: "Local files mode" });
  if (await localModeButton.isVisible().catch(() => false)) {
    await localModeButton.click();
  }
  const formatButton = page.getByTestId("format-settings-button");
  await convertButton.waitFor({ state: "visible" });
  await page.getByTestId("user-menu").waitFor({ state: "visible" });
  await formatButton.waitFor({ state: "visible" });
  await page.getByRole("button", { name: "About" }).waitFor({ state: "visible" });
  await assertMultiModeToggle(page);
  await assertWaveformButtonOpensEmptyState(page);
  await assertFormatMenuCategories(page);
  await assertTermsAndPrivacyLinks(page, { baseUrl });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "OctaCard" }).waitFor({ state: "visible" });
  if (await localModeButton.isVisible().catch(() => false)) {
    await localModeButton.click();
  }
  await convertButton.waitFor({ state: "visible" });
  await page.getByTestId("user-menu").waitFor({ state: "visible" });
  await formatButton.waitFor({ state: "visible" });
  await assertSampleRateOptions(page);
  await assertSp404Mk2PresetDefaults(page);
  await assertFilenameShortener(page);
  const convertBox = await convertButton.boundingBox();
  const formatBox = await formatButton.boundingBox();
  assert.ok(convertBox, "Expected convert button to have a visible bounding box.");
  assert.ok(formatBox, "Expected format button to have a visible bounding box.");
  const viewport = page.viewportSize();
  assert.ok(viewport, "Expected viewport size to be available.");
  // Header is asymmetric (wide left toolbar + flex spacers); Convert is not viewport-centered.
  assert.ok(
    convertBox.x + convertBox.width <= formatBox.x + 2,
    `Expected convert before format controls. convertRight=${convertBox.x + convertBox.width}, formatLeft=${formatBox.x}`,
  );
  assert.ok(convertBox.x >= 0, "Expected convert button to remain inside the viewport.");
  assert.ok(convertBox.x + convertBox.width <= viewport.width, "Expected convert button to remain fully visible.");
  await assertDevModeButton(page, { convertButton, formatButton });
  await page.locator("#main-layout").waitFor({ state: "visible" });
  const sourcePanel = page.getByTestId("panel-source");
  await sourcePanel.waitFor({ state: "visible" });
  const editorPanel = page.getByTestId("panel-editor");
  await editorPanel.waitFor({ state: "visible" });
  const sourceBox = await sourcePanel.boundingBox();
  const editorBox = await editorPanel.boundingBox();
  assert.ok(sourceBox && editorBox, "Expected source navigation and editor panels to be visible.");
  assert.ok(sourceBox.width > 80 && editorBox.width > 80, "Expected reasonable panel widths.");
  await sourcePanel.locator('button[title="Browse for folder to navigate to"]').click();
  const sourceAlphaNode = page.getByTestId("tree-node-source-_Alpha");
  await sourceAlphaNode.waitFor({ state: "visible" });
  await ensureMockDestRoot(page);
  await assertFilePaneKeyboardNavigation(page);
  await assertSearchModesAllFoldersFiles(page);
  await sourceAlphaNode.waitFor({ state: "visible" });
  await page.getByTestId("favorite-open-source-_Alpha").waitFor({ state: "visible" });
  await assertRevealInFinder(page);
  await page.evaluate(() => { window.__revealCalls = []; });
  await assertRevealFileInFinder(page);
  await assertRevealInFinderDoesNotOpenPickerFallback(page);
  await page.evaluate(() => {
    const sourceFavorite = document.querySelector('[data-testid="favorite-open-source-_Alpha"]');
    if (sourceFavorite instanceof HTMLElement) sourceFavorite.click();
  });
  // Browse source + ensureMockDestRoot; favorite navigates without opening a directory picker.
  await waitForPageCondition(page, "Array.isArray(window.__pickerCalls) && window.__pickerCalls.length >= 2");
  const pickerCalls = await page.evaluate(() => window.__pickerCalls);
  assert.ok(
    pickerCalls.length >= 2,
    "Expected mock picker calls for source browse and destination root (see ensureMockDestRoot).",
  );
  const pickerIds = pickerCalls.map((c) => c.pickerId);
  assert.ok(
    pickerIds.includes("octacard-source-directory-picker"),
    "Expected at least one source directory picker call.",
  );
  assert.ok(
    pickerIds.includes("octacard-dest-directory-picker"),
    "Expected dest directory picker call (mock destination root).",
  );
  await sourcePanel.locator('button[title="Root"]').click();
  await page.getByTestId("tree-node-source-_Alpha").waitFor({ state: "visible" });
  await formatButton.click();
  await page.locator('label[for="sample-depth-16-bit"]').click();
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("dialog", { name: "Format Settings" }).waitFor({ state: "hidden" });
  await assertSearchQueryPersistsWhenNavigatingSearchResult(page);
  const title = await page.title();
  assert.ok(title.includes("OctaCard"), "Expected the page title to include OctaCard.");
});
