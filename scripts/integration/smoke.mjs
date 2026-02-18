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
  });

  await page.goto(baseUrl, { waitUntil: "networkidle" });

  await page.getByRole("heading", { name: "OctaCard" }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Convert" }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "About" }).waitFor({ state: "visible" });
  await page.locator("#main-layout").waitFor({ state: "visible" });
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll("button")).find((el) => el.textContent?.includes("Select Directory"));
    if (!button) throw new Error("Select Directory button not found");
    button.click();
  });

  const sourceSelect = page.getByTestId("browse-folder-source");
  const destSelect = page.getByTestId("browse-folder-dest");
  await sourceSelect.waitFor({ state: "visible" });
  await destSelect.waitFor({ state: "visible" });

  const sourcePopup = await sourceSelect.getAttribute("aria-haspopup");
  const destPopup = await destSelect.getAttribute("aria-haspopup");
  assert.ok(!sourcePopup, "Select folder should not be a popup trigger (source).");
  assert.ok(!destPopup, "Select folder should not be a popup trigger (dest).");

  await page.evaluate(() => {
    const button = document.querySelector('[data-testid="browse-folder-source"]');
    if (!(button instanceof HTMLButtonElement)) throw new Error("Source browse button not found");
    button.click();
  });

  const selectedFolderNode = page.getByTestId("tree-node-source-_Alpha");
  const siblingFolderNode = page.getByTestId("tree-node-source-_Beta");
  await selectedFolderNode.waitFor({ state: "visible" });
  await siblingFolderNode.waitFor({ state: "visible" });

  assert.equal(
    await selectedFolderNode.getAttribute("data-selected"),
    "true",
    "Selected folder should be selected visually.",
  );
  assert.equal(
    await selectedFolderNode.getAttribute("data-expanded"),
    "true",
    "Selected folder should be expanded.",
  );

  const title = await page.title();
  assert.ok(title.includes("OctaCard"), "Expected the page title to include OctaCard.");
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
