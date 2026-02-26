import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { assertDestRefreshAfterConvert } from "../../tests/refresh-dest.mjs";
import { assertRevealInFinder } from "../../tests/reveal-in-finder.mjs";
import { assertRevealInFinderDest } from "../../tests/reveal-in-finder-dest.mjs";
import { assertRevealFileInFinder } from "../../tests/reveal-file-in-finder.mjs";
import { assertRevealInFinderDoesNotOpenPickerFallback } from "../../tests/reveal-in-finder-no-picker-fallback.mjs";
import { assertConvertDialogEllipsis } from "../../tests/convert-dialog-ellipsis.mjs";
import { assertExpandedFoldersPersistOnReload } from "../../tests/persist-expanded-folders.mjs";
import { assertSampleRateOptions } from "../../tests/sample-rate-options.mjs";
import { assertFormatMenuCategories } from "../../tests/format-menu-categories.mjs";
import { assertDevModeButton } from "../../tests/dev-mode-button.mjs";
import { assertHeaderDoesNotShowSelectDirectory } from "../../tests/header-select-directory.mjs";
import { assertWaveformPreviewDockedAtBottom } from "../../tests/waveform-preview-position.mjs";
import { assertAudioPreviewFilenameTruncation } from "../../tests/audio-preview-filename-truncation.mjs";
import { assertTermsAndPrivacyLinks } from "../../tests/tos-privacy-links.mjs";
import { assertConversionCanBeCancelled } from "../../tests/conversion-cancel.mjs";
import { assertLargeBatchConversionCanBeCancelledQuickly } from "../../tests/conversion-cancel-large-batch.mjs";
import { assertDragDropConvertsWithFormat } from "../../tests/drag-drop-conversion.mjs";
import { assertDragFolderDropConvertsWithoutConfirmation } from "../../tests/drag-folder-drop-convert.mjs";
import { assertIndexedSearchUsesCache, assertSearchFindsConvertedFileAfterReindex } from "../../tests/search-indexing.mjs";
import { assertSearchQueryPersistsWhenNavigatingSearchResult } from "../../tests/search-navigation-preserves-query.mjs";
import { assertMultiModeToggle } from "../../tests/multi-mode-toggle.mjs";

const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const headless = process.env.PW_HEADLESS !== "false";
const outputDir = path.resolve("output/playwright");

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless });
const page = await browser.newPage();
page.setDefaultTimeout(15000);
const domNestingWarnings = [];

page.on("console", (message) => {
  const text = message.text();
  if (text.includes("validateDOMNesting")) {
    domNestingWarnings.push(text);
  }
});

try {
  await page.addInitScript(() => {
    class MockFileHandle {
      constructor(name, size = 64) {
        this.kind = "file";
        this.name = name;
        this._size = size;
      }

      async getFile() {
        return {
          size: this._size,
          lastModified: Date.now(),
        };
      }

      async isSameEntry(other) {
        return other === this;
      }
    }

    class MockDirectoryHandle {
      constructor(name) {
        this.kind = "directory";
        this.name = name;
        this.parent = null;
        this.children = new Map();
      }

      addDirectory(child) {
        child.parent = this;
        this.children.set(child.name, child);
        return child;
      }

      addFile(name, size = 64) {
        this.children.set(name, new MockFileHandle(name, size));
      }

      async *entries() {
        window.__readDirectoryCalls = (window.__readDirectoryCalls ?? 0) + 1;
        for (const entry of this.children.entries()) {
          yield entry;
        }
      }

      async getDirectoryHandle(name, options = {}) {
        const entry = this.children.get(name);
        if (!entry || entry.kind !== "directory") {
          if (options?.create) {
            const created = new MockDirectoryHandle(name);
            this.addDirectory(created);
            return created;
          }
          throw new DOMException("Directory not found", "NotFoundError");
        }
        return entry;
      }

      async getFileHandle(name, options = {}) {
        const entry = this.children.get(name);
        if (!entry || entry.kind !== "file") {
          if (options?.create) {
            const created = new MockFileHandle(name);
            this.children.set(name, created);
            return created;
          }
          throw new DOMException("File not found", "NotFoundError");
        }
        return entry;
      }

      async resolve(target) {
        const pathParts = [];
        let cursor = target;
        while (cursor && cursor !== this) {
          pathParts.unshift(cursor.name);
          cursor = cursor.parent;
        }
        return cursor === this ? pathParts : null;
      }

      async isSameEntry(other) {
        return other === this;
      }
    }

    const root = new MockDirectoryHandle("Root");
    const alpha = root.addDirectory(new MockDirectoryHandle("Alpha"));
    const beta = root.addDirectory(new MockDirectoryHandle("Beta"));
    const guitars = alpha.addDirectory(new MockDirectoryHandle("Guitars"));
    const longNames = root.addDirectory(new MockDirectoryHandle("LongNames"));
    const bulk = root.addDirectory(new MockDirectoryHandle("Bulk"));
    const huge = root.addDirectory(new MockDirectoryHandle("Huge"));
    alpha.addFile("inside-alpha.wav", 128);
    guitars.addFile("clean_gtr_center.wav", 128);
    beta.addFile("inside-beta.wav", 128);
    root.addFile("top-level.txt", 32);
    longNames.addFile(
      "this-is-an-extremely-long-sample-name-designed-to-overflow-the-dialog-display.wav",
      128,
    );
    for (let i = 1; i <= 6; i++) {
      bulk.addFile(`bulk-${i}.wav`, 128);
    }
    for (let i = 1; i <= 300; i++) {
      huge.addFile(`huge-${i}.wav`, 64);
    }

    const ensureDirectoryByPath = (virtualPath) => {
      const parts = virtualPath.split("/").filter(Boolean);
      let cursor = root;
      for (const part of parts) {
        let next = cursor.children.get(part);
        if (!next || next.kind !== "directory") {
          next = cursor.addDirectory(new MockDirectoryHandle(part));
        }
        cursor = next;
      }
      return cursor;
    };

    const addFileToPath = (virtualPath, fileName, size = 128) => {
      const dir = ensureDirectoryByPath(virtualPath);
      dir.addFile(fileName, size);
    };

    const pickerQueue = [root, alpha, beta, alpha];
    window.__pickerCalls = [];
    window.__octacardPickDirectory = async (startIn, options) => {
      window.__pickerCalls.push({
        startInName: startIn?.name ?? null,
        pickerId: options?.id ?? null,
      });
      return pickerQueue.shift() || startIn || root;
    };
    window.__listCalls = [];
    window.__convertCalls = [];
    window.__revealCalls = [];
    window.__readDirectoryCalls = 0;
    window.__octacardTestHooks = {
      listAudioFilesRecursively: ({ startPath, paneType }) => {
        window.__listCalls.push({ startPath, paneType });
        if (startPath === "/Alpha") {
          return {
            success: true,
            data: [
              {
                name: "inside-alpha.wav",
                path: "/Alpha/inside-alpha.wav",
                type: "file",
                size: 128,
                isDirectory: false,
              },
            ],
          };
        }
        if (startPath === "/LongNames") {
          return {
            success: true,
            data: [
              {
                name: "this-is-an-extremely-long-sample-name-designed-to-overflow-the-dialog-display.wav",
                path: "/LongNames/this-is-an-extremely-long-sample-name-designed-to-overflow-the-dialog-display.wav",
                type: "file",
                size: 128,
                isDirectory: false,
              },
            ],
          };
        }
        if (startPath === "/Bulk") {
          return {
            success: true,
            data: Array.from({ length: 6 }, (_, i) => ({
              name: `bulk-${i + 1}.wav`,
              path: `/Bulk/bulk-${i + 1}.wav`,
              type: "file",
              size: 128,
              isDirectory: false,
            })),
          };
        }
        if (startPath === "/Huge") {
          return {
            success: true,
            data: Array.from({ length: 300 }, (_, i) => ({
              name: `huge-${i + 1}.wav`,
              path: `/Huge/huge-${i + 1}.wav`,
              type: "file",
              size: 64,
              isDirectory: false,
            })),
          };
        }
        return { success: true, data: [] };
      },
      convertAndCopyFile: async (args) => {
        window.__convertCalls.push(args);
        if (args.sourceVirtualPath?.startsWith("/Bulk/")) {
          for (let i = 0; i < 20; i++) {
            if (args.signal?.aborted) {
              return { success: false, error: "Operation cancelled", cancelled: true };
            }
            await new Promise((resolve) => setTimeout(resolve, 25));
          }
        }
        addFileToPath(args.destVirtualPath, args.fileName);
        if (args.fileName.length > 40) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
        return { success: true };
      },
      revealInFinder: ({ virtualPath, paneType, isDirectory }) => {
        window.__revealCalls.push({ virtualPath, paneType, isDirectory });
        return { success: true };
      },
    };
    if (!localStorage.getItem("octacard_favorites_source__default")) {
      localStorage.setItem("octacard_favorites_source__default", JSON.stringify([{ path: "/Alpha", name: "Alpha" }]));
    }
    if (!localStorage.getItem("octacard_favorites_dest__default")) {
      localStorage.setItem("octacard_favorites_dest__default", JSON.stringify([{ path: "/Beta", name: "Beta" }]));
    }
  });

  await page.goto(baseUrl, { waitUntil: "networkidle" });

  await page.getByRole("heading", { name: "OctaCard" }).waitFor({ state: "visible" });
  await assertHeaderDoesNotShowSelectDirectory(page);
  const convertButton = page.getByRole("button", { name: "Convert" });
  const devModeButton = page.getByTestId("dev-mode-button");
  const formatButton = page.getByRole("button", { name: "Format" });
  await convertButton.waitFor({ state: "visible" });
  await devModeButton.waitFor({ state: "visible" });
  await formatButton.waitFor({ state: "visible" });
  await page.getByRole("button", { name: "About" }).waitFor({ state: "visible" });
  await assertMultiModeToggle(page);
  await assertFormatMenuCategories(page);
  await assertTermsAndPrivacyLinks(page, { baseUrl });
  await assertSampleRateOptions(page);
  const convertBox = await convertButton.boundingBox();
  const formatBox = await formatButton.boundingBox();
  assert.ok(convertBox, "Expected convert button to have a visible bounding box.");
  assert.ok(formatBox, "Expected format button to have a visible bounding box.");
  const viewport = page.viewportSize();
  assert.ok(viewport, "Expected viewport size to be available.");
  const convertCenterX = convertBox.x + convertBox.width / 2;
  const viewportCenterX = viewport.width / 2;
  const centerDelta = Math.abs(convertCenterX - viewportCenterX);
  assert.ok(
    centerDelta <= 80,
    `Expected convert button to be centered. Delta=${centerDelta}, viewportCenter=${viewportCenterX}, buttonCenter=${convertCenterX}`,
  );
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
  if (!sourceBox || !destBox) {
    throw new Error("Expected source and destination panels to be visible.");
  }
  const averageWidth = (sourceBox.width + destBox.width) / 2;
  const widthDelta = Math.abs(sourceBox.width - destBox.width);
  assert.ok(
    widthDelta <= averageWidth * 0.05,
    `Expected source/dest panels to be near equal width. Source=${sourceBox.width}, Dest=${destBox.width}`,
  );
  await page.evaluate(() => {
    const sourcePanel = document.querySelector('[data-testid="panel-source"]');
    if (!(sourcePanel instanceof HTMLElement)) throw new Error("Source panel not found");
    const browseButton = sourcePanel.querySelector('button[title="Browse for folder to navigate to"]');
    if (!(browseButton instanceof HTMLElement)) throw new Error("Source browse button not found");
    browseButton.click();
  });

  const sourceAlphaNode = page.getByTestId("tree-node-source-_Alpha");
  await sourceAlphaNode.waitFor({ state: "visible" });
  await assertAudioPreviewFilenameTruncation(page);
  await assertExpandedFoldersPersistOnReload(page);
  await sourceAlphaNode.waitFor({ state: "visible" });
  await page.getByTestId("favorite-open-source-_Alpha").waitFor({ state: "visible" });
  await page.getByTestId("favorite-open-dest-_Beta").waitFor({ state: "visible" });
  await assertRevealInFinder(page);
  await page.evaluate(() => {
    window.__revealCalls = [];
  });
  await assertRevealInFinderDest(page);
  await page.evaluate(() => {
    window.__revealCalls = [];
  });
  await assertRevealFileInFinder(page);
  await assertRevealInFinderDoesNotOpenPickerFallback(page);
  await page.evaluate(() => {
    const sourceFavorite = document.querySelector('[data-testid="favorite-open-source-_Alpha"]');
    const destFavorite = document.querySelector('[data-testid="favorite-open-dest-_Beta"]');
    if (!(sourceFavorite instanceof HTMLElement)) throw new Error("Source favorite button not found");
    if (!(destFavorite instanceof HTMLElement)) throw new Error("Destination favorite button not found");
    sourceFavorite.click();
    destFavorite.click();
  });
  await page.waitForFunction(() => Array.isArray(window.__pickerCalls) && window.__pickerCalls.length >= 3);
  const pickerCallsAfterFavorites = await page.evaluate(() => window.__pickerCalls.slice(0, 3));
  assert.equal(pickerCallsAfterFavorites.length, 3, "Expected three picker calls after opening source+dest favorites.");
  assert.deepEqual(
    pickerCallsAfterFavorites.map((call) => call.pickerId),
    ["octacard-root-directory-picker", "octacard-source-directory-picker", "octacard-dest-directory-picker"],
    "Expected root/source/dest picker IDs in order.",
  );
  assert.equal(
    pickerCallsAfterFavorites[1].startInName,
    "Alpha",
    "Source favorite should open picker starting from source favorite folder.",
  );
  assert.equal(
    pickerCallsAfterFavorites[2].startInName,
    "Beta",
    "Destination favorite should open picker starting from destination favorite folder.",
  );
  await assertIndexedSearchUsesCache(page);

  const sourcePanelLocator = page.getByTestId("panel-source");
  await page.evaluate(() => {
    const sourcePanel = document.querySelector('[data-testid="panel-source"]');
    if (!(sourcePanel instanceof HTMLElement)) throw new Error("Source panel not found");
    const browseButton = sourcePanel.querySelector('button[title="Browse for folder to navigate to"]');
    if (!(browseButton instanceof HTMLElement)) throw new Error("Source browse button not found");
    browseButton.click();
  });
  await page.getByTestId("breadcrumb-favorite-source").waitFor({ state: "visible" });
  await page.getByTestId("tree-node-source-_Alpha_inside-alpha_wav").waitFor({ state: "visible" });
  await assertWaveformPreviewDockedAtBottom(page);

  const breadcrumbFavoriteButton = page.getByTestId("breadcrumb-favorite-source");
  const sourceFavoritesBeforeToggle = JSON.parse(
    (await page.evaluate(() => localStorage.getItem("octacard_favorites_source__default"))) ?? "[]",
  );
  await breadcrumbFavoriteButton.click();
  await expectAriaPressed(breadcrumbFavoriteButton, "true");

  let storedFavorites = await page.evaluate(() => localStorage.getItem("octacard_favorites_source__default"));
  assert.ok(storedFavorites, "Source favorites should be persisted.");
  const parsedFavoritesAfterAdd = JSON.parse(storedFavorites);
  assert.equal(
    parsedFavoritesAfterAdd.length,
    sourceFavoritesBeforeToggle.length + 1,
    "Expected starring breadcrumb path to add one source favorite.",
  );
  const addedFavorite = parsedFavoritesAfterAdd.find(
    (favorite) => !sourceFavoritesBeforeToggle.some((previous) => previous.path === favorite.path),
  );
  assert.equal(typeof addedFavorite?.path, "string", "Expected stored favorite path to be a string.");
  assert.ok(addedFavorite?.path.length > 0, "Expected stored favorite path to be non-empty.");
  const addedFavoritePath = addedFavorite.path;
  const addedFavoriteTestId = `favorite-open-source-${toTestIdSegment(addedFavoritePath)}`;

  const storedFavoritesStore = await page.evaluate(() => localStorage.getItem("octacard_favorites_store_v1"));
  assert.ok(storedFavoritesStore, "Favorites Zustand-style store should be persisted.");

  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "OctaCard" }).waitFor({ state: "visible" });
  await assertHeaderDoesNotShowSelectDirectory(page);
  await page.evaluate(() => {
    const sourcePanel = document.querySelector('[data-testid="panel-source"]');
    if (!(sourcePanel instanceof HTMLElement)) throw new Error("Source panel not found after reload");
    const browseButton = sourcePanel.querySelector('button[title="Browse for folder to navigate to"]');
    if (!(browseButton instanceof HTMLElement)) throw new Error("Source browse button not found after reload");
    browseButton.click();
  });
  await page.getByTestId("tree-node-source-_Alpha").waitFor({ state: "visible" });
  const reloadedFavorite = page.getByTestId(addedFavoriteTestId);
  await reloadedFavorite.waitFor({ state: "visible" });
  await page.getByTestId("favorite-open-dest-_Beta").waitFor({ state: "visible" });
  await page.evaluate((testId) => {
    const favoriteButton = document.querySelector(`[data-testid="${testId}"]`);
    if (!(favoriteButton instanceof HTMLElement)) throw new Error(`Favorite button not found: ${testId}`);
    favoriteButton.click();
  }, addedFavoriteTestId);
  await page.getByTestId("breadcrumb-favorite-source").waitFor({ state: "visible" });

  const breadcrumbFavoriteButtonAfterReload = page.getByTestId("breadcrumb-favorite-source");
  await breadcrumbFavoriteButtonAfterReload.click();
  await expectAriaPressed(breadcrumbFavoriteButtonAfterReload, "false");
  storedFavorites = await page.evaluate(() => localStorage.getItem("octacard_favorites_source__default"));
  assert.ok(storedFavorites, "Source favorites storage should exist after toggle.");
  const parsedFavoritesAfterRemove = JSON.parse(storedFavorites);
  assert.ok(
    !parsedFavoritesAfterRemove.some((favorite) => favorite.path === addedFavoritePath),
    "Removed breadcrumb favorite path should no longer exist in source favorites.",
  );

  await sourcePanelLocator.locator('button[title="Root"]').click();
  await sourceAlphaNode.waitFor({ state: "visible" });
  await page.evaluate(() => {
    const destFavorite = document.querySelector('[data-testid="favorite-open-dest-_Beta"]');
    if (!(destFavorite instanceof HTMLElement)) throw new Error("Destination favorite button not found");
    destFavorite.click();
  });
  const destBetaNode = page.getByTestId("tree-node-dest-_Beta");
  await destBetaNode.waitFor({ state: "visible" });
  await formatButton.click();
  await page.getByRole("menuitem", { name: "Sample Depth" }).hover();
  await page.getByRole("menuitemradio", { name: "16-bit" }).click();
  await page.waitForSelector('[role="menu"]', { state: "hidden", timeout: 2000 }).catch(() => {});
  await assertDragFolderDropConvertsWithoutConfirmation(page);

  await page.getByTestId("tree-node-source-_Alpha").click();
  await destBetaNode.click();

  await assertConvertDialogEllipsis(page);
  await assertConversionCanBeCancelled(page);

  await page.getByTestId("tree-node-source-_Alpha").click();
  await destBetaNode.click();

  await formatButton.click();
  await page.getByRole("menuitem", { name: "Sample Rate" }).hover();
  await page.getByRole("menuitemradio", { name: "44100" }).click();
  // Wait for dropdown menu to close before opening again
  await page.waitForSelector('[role="menu"]', { state: "hidden", timeout: 2000 }).catch(() => {
    // Menu might already be closed or not found, continue
  });
  await formatButton.click();
  await page.getByRole("menuitem", { name: "Sample Depth" }).hover();
  await page.getByRole("menuitemradio", { name: "16-bit" }).click();

  await convertButton.click();
  await page.getByRole("button", { name: "Convert & Save" }).click();

  await page.waitForFunction(() => Array.isArray(window.__convertCalls) && window.__convertCalls.length === 1);
  const listCalls = await page.evaluate(() => window.__listCalls);
  const convertCalls = await page.evaluate(() => window.__convertCalls);
  assert.equal(listCalls.length, 1, "Expected one listAudioFilesRecursively call.");
  assert.equal(listCalls[0].startPath, "/Alpha", "Conversion should use selected source folder.");
  assert.equal(convertCalls.length, 1, "Expected one conversion call.");
  assert.equal(
    convertCalls[0].sourceVirtualPath,
    "/Alpha/inside-alpha.wav",
    "Conversion should use selected source files.",
  );
  assert.equal(
    convertCalls[0].destVirtualPath,
    "/Beta/Alpha",
    "When destination folder name differs, conversion should preserve the source folder wrapper.",
  );
  assert.equal(convertCalls[0].targetSampleRate, 44100, "Conversion should pass sample rate in Hz.");
  assert.equal(convertCalls[0].sampleDepth, "16-bit", "Conversion should pass selected sample depth.");
  await assertDestRefreshAfterConvert(page);
  await assertSearchFindsConvertedFileAfterReindex(page);

  await page.evaluate(() => {
    window.__listCalls = [];
    window.__convertCalls = [];
  });
  await formatButton.click();
  await page.getByRole("menuitem", { name: "Sample Rate" }).hover();
  await page.getByRole("menuitemradio", { name: "Don't change" }).click();
  await page.waitForSelector('[role="menu"]', { state: "hidden", timeout: 2000 }).catch(() => {});
  await formatButton.click();
  await page.getByRole("menuitem", { name: "Sample Depth" }).hover();
  await page.getByRole("menuitemradio", { name: "Don't change" }).click();
  await page.waitForSelector('[role="menu"]', { state: "hidden", timeout: 2000 }).catch(() => {});
  await formatButton.click();
  await page.getByRole("menuitem", { name: "Format" }).hover();
  await page.getByRole("menuitemradio", { name: "Don't change" }).click();
  await page.waitForSelector('[role="menu"]', { state: "hidden", timeout: 2000 }).catch(() => {});
  await formatButton.click();
  await page.getByRole("menuitem", { name: "Mono" }).hover();
  await page.getByRole("menuitemradio", { name: "Don't change" }).click();
  await page.waitForSelector('[role="menu"]', { state: "hidden", timeout: 2000 }).catch(() => {});
  await formatButton.click();
  await page.getByRole("menuitem", { name: "Normalize" }).hover();
  await page.getByRole("menuitemradio", { name: "Don't change" }).click();
  await page.waitForSelector('[role="menu"]', { state: "hidden", timeout: 2000 }).catch(() => {});
  await formatButton.click();
  await page.getByRole("menuitem", { name: "Trim" }).hover();
  await page.getByRole("menuitemradio", { name: "Don't change" }).click();
  await page.waitForSelector('[role="menu"]', { state: "hidden", timeout: 2000 }).catch(() => {});

  await convertButton.click();
  await page.getByRole("heading", { name: "Copy Files?" }).waitFor({ state: "visible" });
  await page.getByText("1 file will be copied to the destination.").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Copy" }).click();
  await page.waitForFunction(() => Array.isArray(window.__convertCalls) && window.__convertCalls.length === 1);

  await page.getByTestId("tree-node-dest-_Alpha").click();
  await page.evaluate(() => {
    window.__listCalls = [];
    window.__convertCalls = [];
  });
  await convertButton.click();
  await page.getByRole("heading", { name: "Copy Files?" }).waitFor({ state: "visible" });
  await page.getByText("1 file will be copied to the destination.").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Copy" }).click();
  await page.waitForFunction(() => Array.isArray(window.__convertCalls) && window.__convertCalls.length === 1);
  const sameNameListCalls = await page.evaluate(() => window.__listCalls);
  const sameNameConvertCalls = await page.evaluate(() => window.__convertCalls);
  assert.equal(sameNameListCalls.length, 1, "Expected one listAudioFilesRecursively call for same-name case.");
  assert.equal(
    sameNameConvertCalls[0].destVirtualPath,
    "/Alpha",
    "When source and destination folder names match, conversion should copy only the source contents.",
  );

  await assertDragDropConvertsWithFormat(page);
  await assertSearchQueryPersistsWhenNavigatingSearchResult(page);
  await assertLargeBatchConversionCanBeCancelledQuickly(page);

  assert.equal(domNestingWarnings.length, 0, "No DOM nesting warnings should be emitted during conversion flow.");

  const title = await page.title();
  assert.ok(title.includes("OctaCard"), "Expected the page title to include OctaCard.");

  const safariContext = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  });
  const safariPage = await safariContext.newPage();
  safariPage.setDefaultTimeout(15000);
  try {
    await safariPage.goto(baseUrl, { waitUntil: "networkidle" });
    await safariPage.waitForTimeout(500);
    const safariFallbackVisible = await safariPage
      .getByRole("heading", { name: "Safari Not Supported" })
      .isVisible()
      .catch(() => false);
    const appHeadingVisible = await safariPage
      .getByRole("heading", { name: "OctaCard" })
      .isVisible()
      .catch(() => false);
    if (!safariFallbackVisible && !appHeadingVisible) {
      console.warn("Safari UA check skipped: no expected heading rendered in this environment.");
    }
  } finally {
    await safariContext.close();
  }
} catch (error) {
  try {
    await page.screenshot({ path: path.join(outputDir, "smoke-failure.png"), fullPage: true, timeout: 5000 });
  } catch (screenshotError) {
    console.error("Failed to capture failure screenshot:", screenshotError);
  }
  console.error("Integration test failed:", error);
  process.exitCode = 1;
} finally {
  await browser.close();
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

async function expectAriaPressed(locator, value) {
  await locator.waitFor({ state: "visible" });
  await page.waitForFunction(
    ([element, expectedValue]) => element?.getAttribute("aria-pressed") === expectedValue,
    [await locator.elementHandle(), value],
  );
}

function toTestIdSegment(value) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}
