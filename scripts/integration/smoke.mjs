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

    const pickerQueue = [root];
    window.__octacardPickDirectory = async () => pickerQueue.shift() || root;
    localStorage.removeItem("octacard_favorites_source__default");
    localStorage.removeItem("octacard_favorites_dest__default");
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

  const sourceAlphaNode = page.getByTestId("tree-node-source-_Alpha");
  await sourceAlphaNode.waitFor({ state: "visible" });

  await page.evaluate(() => {
    const node = document.querySelector('[data-testid="tree-node-source-_Alpha"]');
    if (!(node instanceof HTMLElement)) throw new Error("Source Alpha tree node not found");
    node.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }));
  });

  await page.evaluate(() => {
    const menuItems = Array.from(document.querySelectorAll('[role="menuitem"]'));
    const addFavorite = menuItems.find((item) => item.textContent?.trim() === "Add favourite");
    if (!(addFavorite instanceof HTMLElement)) throw new Error("Add favourite menu item not found");
    addFavorite.click();
  });

  const favoriteButton = page.getByTestId("favorite-open-source-_Alpha");
  await favoriteButton.waitFor({ state: "visible" });

  const storedFavorites = await page.evaluate(() => localStorage.getItem("octacard_favorites_source__default"));
  assert.ok(storedFavorites, "Source favorites should be persisted.");
  assert.ok(storedFavorites.includes('"/Alpha"'), "Stored source favorites should include /Alpha.");

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
