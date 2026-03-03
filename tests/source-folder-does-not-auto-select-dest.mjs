import assert from "node:assert/strict";

/**
 * Selecting a source folder should NOT auto-select the destination folder.
 * Source and dest selections are independent.
 */
export async function assertSourceFolderDoesNotAutoSelectDest(page) {
  const sourcePanel = page.getByTestId("panel-source");
  const destPanel = page.getByTestId("panel-dest");
  await sourcePanel.waitFor({ state: "visible" });
  await destPanel.waitFor({ state: "visible" });

  // Navigate both to root
  await sourcePanel.getByTestId("breadcrumb-root-source").click();
  await destPanel.getByTestId("breadcrumb-root-dest").click();
  await page.getByTestId("tree-node-source-_Alpha").waitFor({ state: "visible" });
  await page.getByTestId("tree-node-dest-_Beta").waitFor({ state: "visible" });

  // Select Beta in dest pane first
  const destBetaNode = page.getByTestId("tree-node-dest-_Beta");
  await destBetaNode.click();
  await page.waitForTimeout(100);
  const destBetaSelected = await destBetaNode.getAttribute("data-selected");
  assert.equal(destBetaSelected, "true", "Expected dest Beta to be selected.");

  // Select Alpha in source pane - dest selection should remain unchanged
  const sourceAlphaNode = page.getByTestId("tree-node-source-_Alpha");
  await sourceAlphaNode.click();
  await page.waitForTimeout(100);

  const sourceAlphaSelected = await sourceAlphaNode.getAttribute("data-selected");
  assert.equal(sourceAlphaSelected, "true", "Expected source Alpha to be selected.");

  const destBetaStillSelected = await destBetaNode.getAttribute("data-selected");
  assert.equal(
    destBetaStillSelected,
    "true",
    "Expected dest Beta to remain selected when selecting source Alpha (no auto-sync).",
  );
}
