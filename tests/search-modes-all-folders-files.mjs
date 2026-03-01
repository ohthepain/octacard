import assert from "node:assert/strict";

/**
 * FilePane has 3 search modes: All, Folders, Files.
 * Verifies mode buttons switch correctly (All/Folders/Files toggle).
 * Search indexing may not return results in test env, so we only assert mode switching.
 */
export async function assertSearchModesAllFoldersFiles(page) {
  const sourcePanel = page.getByTestId("panel-source");
  await sourcePanel.waitFor({ state: "visible" });

  await sourcePanel.locator('button[title="Root"]').click();
  await page.getByTestId("tree-node-source-_Alpha").waitFor({ state: "visible" });

  const allButton = sourcePanel.getByRole("button", { name: "All" });
  const foldersButton = sourcePanel.getByRole("button", { name: "Folders" });
  const filesButton = sourcePanel.getByRole("button", { name: "Files" });
  await allButton.waitFor({ state: "visible" });

  // All mode is default
  const allVariant = await allButton.getAttribute("class");
  assert.ok(allVariant?.includes("secondary"), "Expected All mode to be active by default.");

  // Switch to Folders mode
  await foldersButton.click();
  await page.waitForTimeout(150);
  const foldersVariant = await foldersButton.getAttribute("class");
  assert.ok(foldersVariant?.includes("secondary"), "Expected Folders mode to be active.");

  // Switch to Files mode
  await filesButton.click();
  await page.waitForTimeout(150);
  const filesVariant = await filesButton.getAttribute("class");
  assert.ok(filesVariant?.includes("secondary"), "Expected Files mode to be active.");

  // Switch back to All
  await allButton.click();
  await page.waitForTimeout(150);
  const allVariantAgain = await allButton.getAttribute("class");
  assert.ok(allVariantAgain?.includes("secondary"), "Expected All mode after switching back.");
}
