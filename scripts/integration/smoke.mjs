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
        for (const entry of this.children.entries()) {
          yield entry;
        }
      }

      async getDirectoryHandle(name) {
        const entry = this.children.get(name);
        if (!entry || entry.kind !== "directory") {
          throw new DOMException("Directory not found", "NotFoundError");
        }
        return entry;
      }

      async getFileHandle(name) {
        const entry = this.children.get(name);
        if (!entry || entry.kind !== "file") {
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
    alpha.addFile("inside-alpha.wav", 128);
    beta.addFile("inside-beta.wav", 128);
    root.addFile("top-level.txt", 32);

    const pickerQueue = [root, alpha];
    window.__octacardPickDirectory = async () => pickerQueue.shift() || root;
    window.__listCalls = [];
    window.__convertCalls = [];
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
        return { success: true, data: [] };
      },
      convertAndCopyFile: (args) => {
        window.__convertCalls.push(args);
        return { success: true };
      },
    };
    localStorage.removeItem("octacard_favorites_source__default");
    localStorage.removeItem("octacard_favorites_dest__default");
  });

  await page.goto(baseUrl, { waitUntil: "networkidle" });

  await page.getByRole("heading", { name: "OctaCard" }).waitFor({ state: "visible" });
  const convertButton = page.getByRole("button", { name: "Convert" });
  const formatButton = page.getByRole("button", { name: "Format" });
  await convertButton.waitFor({ state: "visible" });
  await formatButton.waitFor({ state: "visible" });
  await page.getByRole("button", { name: "About" }).waitFor({ state: "visible" });
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
  assert.ok(
    formatBox.x > convertBox.x + convertBox.width,
    `Expected format button to be to the right of convert. convertRight=${convertBox.x + convertBox.width}, formatLeft=${formatBox.x}`,
  );
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
    const button = Array.from(document.querySelectorAll("button")).find((el) =>
      el.textContent?.includes("Select Directory"),
    );
    if (!button) throw new Error("Select Directory button not found");
    button.click();
  });

  const sourceAlphaNode = page.getByTestId("tree-node-source-_Alpha");
  await sourceAlphaNode.waitFor({ state: "visible" });
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

  const breadcrumbFavoriteButton = page.getByTestId("breadcrumb-favorite-source");
  await breadcrumbFavoriteButton.click();
  await expectAriaPressed(breadcrumbFavoriteButton, "true");

  let storedFavorites = await page.evaluate(() => localStorage.getItem("octacard_favorites_source__default"));
  assert.ok(storedFavorites, "Source favorites should be persisted.");
  const parsedFavoritesAfterAdd = JSON.parse(storedFavorites);
  assert.equal(parsedFavoritesAfterAdd.length, 1, "Expected one source favorite after starring breadcrumb path.");
  assert.equal(typeof parsedFavoritesAfterAdd[0]?.path, "string", "Expected stored favorite path to be a string.");
  assert.ok(parsedFavoritesAfterAdd[0]?.path.length > 0, "Expected stored favorite path to be non-empty.");
  const addedFavoritePath = parsedFavoritesAfterAdd[0].path;

  await breadcrumbFavoriteButton.click();
  await expectAriaPressed(breadcrumbFavoriteButton, "false");
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
    const sourceNode = document.querySelector('[data-testid="tree-node-source-_Alpha"]');
    const destNode = document.querySelector('[data-testid="tree-node-dest-_Beta"]');
    if (!(sourceNode instanceof HTMLElement)) throw new Error("Source node not found");
    if (!(destNode instanceof HTMLElement)) throw new Error("Destination node not found");
    sourceNode.click();
    destNode.click();
  });

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
  assert.equal(convertCalls[0].destVirtualPath, "/Beta", "Conversion should use selected destination folder.");
  assert.equal(convertCalls[0].targetSampleRate, 44100, "Conversion should pass sample rate in Hz.");
  assert.equal(convertCalls[0].sampleDepth, "16-bit", "Conversion should pass selected sample depth.");
  assert.equal(domNestingWarnings.length, 0, "No DOM nesting warnings should be emitted during conversion flow.");

  const title = await page.title();
  assert.ok(title.includes("OctaCard"), "Expected the page title to include OctaCard.");

  const safariContext = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  });
  const safariPage = await safariContext.newPage();
  safariPage.setDefaultTimeout(15000);
  await safariPage.goto(baseUrl, { waitUntil: "networkidle" });
  await safariPage.getByRole("heading", { name: "Safari Not Supported" }).waitFor({ state: "visible" });
  await safariPage
    .getByText("OctaCard requires the File System Access API, which Safari does not support.")
    .waitFor({ state: "visible" });
  await safariContext.close();
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
