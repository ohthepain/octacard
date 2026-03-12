import assert from "node:assert/strict";
import { waitForAriaPressed } from "./wait-utils.mjs";

async function openSourceAndDestRoots(page) {
  await page.evaluate(() => {
    const sourcePanel = document.querySelector('[data-testid="panel-source"]');
    if (!(sourcePanel instanceof HTMLElement)) throw new Error("Source panel not found");
    const sourceBrowse = sourcePanel.querySelector('button[title="Browse for folder to navigate to"]');
    if (!(sourceBrowse instanceof HTMLElement)) throw new Error("Source browse button not found");
    sourceBrowse.click();

    const destPanel = document.querySelector('[data-testid="panel-dest"]');
    if (!(destPanel instanceof HTMLElement)) throw new Error("Dest panel not found");
    const destBrowse = destPanel.querySelector('button[title="Browse for folder to navigate to"]');
    const destSelectFolder = destPanel.querySelector('[data-testid="select-folder-dest"]');
    if (destBrowse instanceof HTMLElement) destBrowse.click();
    else if (destSelectFolder instanceof HTMLElement) destSelectFolder.click();
    else throw new Error("Dest browse button not found");
  });

  await page.getByTestId("tree-node-source-_Alpha").waitFor({ state: "visible" });
  await page.getByTestId("tree-node-dest-_Beta").waitFor({ state: "visible" });
}

export async function assertMultiStackPersistsAfterReload(page) {
  const multiToggle = page.getByTestId("multi-mode-toggle");
  await multiToggle.waitFor({ state: "visible" });
  if ((await multiToggle.getAttribute("aria-pressed")) !== "true") {
    await multiToggle.click();
    await waitForAriaPressed(page, "multi-mode-toggle", "true");
  }

  const bulkNode = page.getByTestId("tree-node-source-_Bulk");
  await bulkNode.waitFor({ state: "visible" });
  await bulkNode.click();
  await page.getByTestId("tree-node-source-_Bulk_bulk-1_wav").waitFor({ state: "visible" });
  await page.getByTestId("tree-node-source-_Bulk_bulk-1_wav").click();

  const removeButtons = page.getByLabel("Remove from stack");
  await removeButtons.first().waitFor({ state: "visible" });
  assert.equal(await removeButtons.count(), 1, "Expected one sample in stack before reload.");

  const persistedStore = await page.evaluate(() => localStorage.getItem("octacard_multi_sample_store_v1"));
  assert.ok(persistedStore, "Expected multi-sample store to be persisted.");

  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "OctaCard" }).waitFor({ state: "visible" });

  const reloadedMultiToggle = page.getByTestId("multi-mode-toggle");
  await reloadedMultiToggle.waitFor({ state: "visible" });
  if ((await reloadedMultiToggle.getAttribute("aria-pressed")) !== "true") {
    await reloadedMultiToggle.click();
    await waitForAriaPressed(page, "multi-mode-toggle", "true");
  }

  const reloadedRemoveButtons = page.getByLabel("Remove from stack");
  await reloadedRemoveButtons.first().waitFor({ state: "visible" });
  assert.equal(await reloadedRemoveButtons.count(), 1, "Expected stack to survive refresh.");

  await reloadedRemoveButtons.first().click();
  await waitForAriaPressed(page, "multi-mode-toggle", "true");
  await reloadedMultiToggle.click();
  await waitForAriaPressed(page, "multi-mode-toggle", "false");

  await openSourceAndDestRoots(page);
}
