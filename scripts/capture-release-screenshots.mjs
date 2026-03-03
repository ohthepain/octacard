#!/usr/bin/env node
/**
 * Capture screenshots for release notes features.
 * Requires the app to be running at E2E_BASE_URL (default http://127.0.0.1:3010).
 *
 * Usage:
 *   pnpm run build && pnpm run preview:it &
 *   E2E_BASE_URL=http://127.0.0.1:3010 node scripts/capture-release-screenshots.mjs
 *
 * Or use: pnpm run release-screenshots (runs preview + capture)
 */

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3010";
const outputDir = path.resolve(projectRoot, "output/release-notes-screenshots");

// Minimal mock for file system - same structure as smoke.mjs
const initScript = `
(function() {
  class MockFileHandle {
    constructor(name, size = 64) {
      this.kind = "file";
      this.name = name;
      this._size = size;
    }
    async getFile() {
      return { size: this._size, lastModified: Date.now() };
    }
    async isSameEntry(other) { return other === this; }
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
      for (const entry of this.children.entries()) yield entry;
    }
    async getDirectoryHandle(name, options = {}) {
      const entry = this.children.get(name);
      if (!entry || entry.kind !== "directory") {
        if (options?.create) {
          const c = new MockDirectoryHandle(name);
          this.addDirectory(c);
          return c;
        }
        throw new DOMException("Directory not found", "NotFoundError");
      }
      return entry;
    }
    async getFileHandle(name, options = {}) {
      const entry = this.children.get(name);
      if (!entry || entry.kind !== "file") {
        if (options?.create) {
          const c = new MockFileHandle(name);
          this.children.set(name, c);
          return c;
        }
        throw new DOMException("File not found", "NotFoundError");
      }
      return entry;
    }
    async resolve(target) {
      const parts = [];
      let c = target;
      while (c && c !== this) {
        parts.unshift(c.name);
        c = c.parent;
      }
      return c === this ? parts : null;
    }
    async isSameEntry(other) { return other === this; }
  }
  const root = new MockDirectoryHandle("Root");
  const alpha = root.addDirectory(new MockDirectoryHandle("Alpha"));
  const beta = root.addDirectory(new MockDirectoryHandle("Beta"));
  alpha.addFile("inside-alpha.wav", 128);
  beta.addFile("inside-beta.wav", 128);
  const pickerQueue = [root, root];
  window.__octacardPickDirectory = async () => pickerQueue.shift() || root;
  window.__octacardTestHooks = {
    listAudioFilesRecursively: ({ startPath }) => ({
      success: true,
      data: startPath === "/Alpha" ? [{ name: "inside-alpha.wav", path: "/Alpha/inside-alpha.wav", type: "file", size: 128, isDirectory: false }] : []
    }),
    convertAndCopyFile: async (args) => {
      return { success: true };
    },
    revealInFinder: () => ({ success: true })
  };
  localStorage.setItem("octacard_favorites_source__default", JSON.stringify([{ path: "/Alpha", name: "Alpha" }]));
  localStorage.setItem("octacard_favorites_dest__default", JSON.stringify([{ path: "/Beta", name: "Beta" }]));
})();
`;

async function closeDialogs(page) {
  const done = page.getByRole("button", { name: "Done" });
  if (await done.isVisible().catch(() => false)) {
    await done.click();
    await page.waitForSelector('[role="dialog"]', { state: "hidden" }).catch(() => {});
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
}

const scenarios = [
  {
    name: "01-sample-depth-option",
    setup: async (page) => {
      await page.getByTestId("format-settings-button").click();
      await page.waitForSelector('[role="dialog"]', { state: "visible" });
    },
  },
  {
    name: "02-convert-button",
    setup: async (page) => {
      await closeDialogs(page);
    },
  },
  {
    name: "03-file-browser",
    setup: async (page) => {
      await closeDialogs(page);
      await page.getByTestId("breadcrumb-root-source").click();
      await page.getByTestId("tree-node-source-_Alpha").waitFor({ state: "visible" });
    },
  },
  {
    name: "04-search-and-preview",
    setup: async (page) => {
      await page.getByTestId("tree-node-source-_Alpha").click();
      await page.getByTestId("tree-node-source-_Alpha_inside-alpha_wav").waitFor({ state: "visible" });
      await page.getByTestId("tree-node-source-_Alpha_inside-alpha_wav").click();
      await page.waitForTimeout(500);
    },
  },
  {
    name: "05-format-settings",
    setup: async (page) => {
      await page.getByTestId("format-settings-button").click();
      await page.waitForSelector('[role="dialog"]', { state: "visible" });
    },
  },
];

async function main() {
  await mkdir(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);

  await page.addInitScript(initScript);
  await page.goto(baseUrl, { waitUntil: "networkidle" });

  await page.getByRole("heading", { name: "OctaCard" }).waitFor({ state: "visible" });

  // Select source and dest folders
  await page.evaluate(() => {
    const src = document.querySelector('[data-testid="panel-source"]');
    const browse = src?.querySelector('button[title="Browse for folder to navigate to"]');
    if (browse) browse.click();
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const dest = document.querySelector('[data-testid="panel-dest"]');
    const browse = dest?.querySelector('button[title="Browse for folder to navigate to"]');
    const selectFolder = dest?.querySelector('[data-testid="select-folder-dest"]');
    if (browse) browse.click();
    else if (selectFolder) selectFolder.click();
  });
  await page.waitForTimeout(500);
  await page.getByTestId("tree-node-source-_Alpha").waitFor({ state: "visible" }).catch(() => {});
  await page.getByTestId("tree-node-dest-_Beta").waitFor({ state: "visible" }).catch(() => {});

  for (const scenario of scenarios) {
    try {
      await scenario.setup(page);
      await page.waitForTimeout(300);
      const outPath = path.join(outputDir, `${scenario.name}.png`);
      await page.screenshot({ path: outPath, fullPage: false });
      console.log(`Captured: ${scenario.name}.png`);
    } catch (err) {
      console.error(`Failed ${scenario.name}:`, err.message);
    }
  }

  await browser.close();
  console.log(`Screenshots saved to ${outputDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
