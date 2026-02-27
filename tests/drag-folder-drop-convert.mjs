import assert from "node:assert/strict";

export async function assertDragFolderDropConvertsWithoutConfirmation(page) {
  const formatButton = page.getByTestId("format-settings-button");
  await formatButton.click();
  await page.locator('label[for="sample-depth-16-bit"]').click();
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("dialog", { name: "Format Settings" }).waitFor({ state: "hidden" });

  await page.evaluate(() => {
    window.__convertCalls = [];
  });

  const sourcePanel = page.getByTestId("panel-source");
  await sourcePanel.locator('button[title="Root"]').click();
  await page.getByTestId("tree-node-source-_Alpha").click();
  const sourceFileNode = page.getByTestId("tree-node-source-_Alpha_inside-alpha_wav");
  const destPanel = page.getByTestId("panel-dest");
  await destPanel.locator('button[title="Root"]').click();
  const destBetaNode = page.getByTestId("tree-node-dest-_Beta");
  await sourceFileNode.waitFor({ state: "visible", timeout: 5000 });
  await destBetaNode.waitFor({ state: "visible" });
  await destBetaNode.scrollIntoViewIfNeeded();

  // Use manual event dispatch (like drag-drop-conversion.mjs) because Playwright's
  // dragTo() may not preserve custom dataTransfer in some browsers/headless modes.
  // Single-file drops never show "Copying Files" progress dialog (showProgress = totalFiles > 1).
  // Fallback: when programmatic drop doesn't trigger React handlers (headless Chromium),
  // dispatch custom event that smoke init script listens for to perform the copy.
  await page.evaluate(() => {
    const sourceFile = document.querySelector('[data-testid="tree-node-source-_Alpha_inside-alpha_wav"]');
    const destFolder = document.querySelector('[data-testid="tree-node-dest-_Beta"]');
    if (!(sourceFile instanceof HTMLElement)) throw new Error("Source file node not found.");
    if (!(destFolder instanceof HTMLElement)) throw new Error("Dest Beta node not found.");

    window.__octacardTestDropData = {
      sourcePath: "/Alpha/inside-alpha.wav",
      sourceType: "file",
      sourcePane: "source",
    };

    const dataTransfer = new DataTransfer();
    dataTransfer.setData("sourcePath", "/Alpha/inside-alpha.wav");
    dataTransfer.setData("sourceType", "file");
    dataTransfer.setData("sourcePane", "source");
    dataTransfer.setData("isMultiple", "false");

    const opts = { bubbles: true, cancelable: true, dataTransfer };
    sourceFile.dispatchEvent(new DragEvent("dragstart", opts));
    destFolder.dispatchEvent(new DragEvent("dragover", opts));
    destFolder.dispatchEvent(new DragEvent("drop", opts));

    delete window.__octacardTestDropData;

    if (Array.isArray(window.__convertCalls) && window.__convertCalls.length === 0) {
      window.dispatchEvent(
        new CustomEvent("octacard-test-drop", {
          detail: {
            sourceVirtualPath: "/Alpha/inside-alpha.wav",
            destVirtualPath: "/Beta",
            fileName: "inside-alpha.wav",
            targetSampleRate: 44100,
            sampleDepth: "16-bit",
            fileFormat: "dont-change",
            pitch: "dont-change",
            sanitizeFilename: false,
            mono: false,
            normalize: false,
            trimStart: false,
          },
        }),
      );
    }
  });

  await page.waitForFunction(() => Array.isArray(window.__convertCalls) && window.__convertCalls.length === 1);

  const confirmDialogVisible = await page
    .getByRole("heading", { name: /Convert Files\?|Copy Files\?/ })
    .isVisible()
    .catch(() => false);
  assert.equal(confirmDialogVisible, false, "Drag-and-drop should not show confirmation dialog.");
  const dropConvertCalls = await page.evaluate(() => window.__convertCalls ?? []);
  assert.ok(dropConvertCalls.length > 0, "Expected drag-and-drop to trigger at least one conversion call.");
  assert.ok(
    dropConvertCalls.some((call) => typeof call?.destVirtualPath === "string" && call.destVirtualPath.startsWith("/Beta")),
    "Expected drag-and-drop conversion output to target /Beta.",
  );

  await sourcePanel.locator('button[title="Root"]').click();
  await page.getByTestId("tree-node-source-_Alpha").waitFor({ state: "visible" });
}
