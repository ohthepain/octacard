import assert from "node:assert/strict";
import { waitForPageCondition } from "./wait-utils.mjs";

export async function assertRevealInFinderDest(page) {
  const betaNode = page.getByTestId("tree-node-dest-_Beta");
  const betaVisible = await betaNode.isVisible().catch(() => false);
  if (!betaVisible) {
    const rootBreadcrumb = page.getByTestId("breadcrumb-root-dest");
    const rootVisible = await rootBreadcrumb.isVisible().catch(() => false);
    if (rootVisible) {
      await rootBreadcrumb.click();
    } else {
      await page.evaluate(() => {
        const destPanel = document.querySelector('[data-testid="panel-dest"]');
        if (!(destPanel instanceof HTMLElement)) throw new Error("Destination panel not found");
        const browseButton = destPanel.querySelector('button[title="Browse for folder to navigate to"]');
        const selectFolder = destPanel.querySelector('[data-testid="select-folder-dest"]');
        if (browseButton instanceof HTMLElement) browseButton.click();
        else if (selectFolder instanceof HTMLElement) selectFolder.click();
        else throw new Error("Destination folder picker trigger not found");
      });
    }
  }
  await betaNode.waitFor({ state: "visible" });
  await betaNode.click({ button: "right" });

  const revealMenuItem = page.getByRole("menuitem", { name: "Reveal in Finder" });
  await revealMenuItem.waitFor({ state: "visible" });
  await revealMenuItem.click();

  await waitForPageCondition(page, "Array.isArray(window.__revealCalls) && window.__revealCalls.length >= 1");
  const revealCalls = await page.evaluate(() => window.__revealCalls);
  const lastCall = revealCalls.at(-1);
  assert.ok(lastCall, "Expected a reveal call for the destination folder.");
  assert.equal(lastCall.virtualPath, "/Beta", "Reveal should use the destination folder path.");
  assert.equal(lastCall.paneType, "dest", "Reveal should use the destination pane type.");
  assert.equal(lastCall.isDirectory, true, "Reveal should indicate the folder is a directory.");
}
