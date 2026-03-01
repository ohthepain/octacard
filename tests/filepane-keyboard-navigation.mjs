import assert from "node:assert/strict";

/**
 * When FilePane has focus, arrow keys navigate:
 * - Up/Down: move selection by one file/folder
 * - Right: expand folder
 * - Left: collapse folder (or collapse parent and select parent)
 */
export async function assertFilePaneKeyboardNavigation(page) {
  const sourcePanel = page.getByTestId("panel-source");
  await sourcePanel.waitFor({ state: "visible" });

  // Ensure we're at root with Alpha, Beta visible
  await sourcePanel.locator('button[title="Root"]').click();
  await page.getByTestId("tree-node-source-_Alpha").waitFor({ state: "visible" });
  await page.getByTestId("tree-node-source-_Beta").waitFor({ state: "visible" });

  // Click Alpha to focus the pane and select it (clicking a folder also expands it)
  const alphaNode = page.getByTestId("tree-node-source-_Alpha");
  await alphaNode.click();
  await page.waitForTimeout(200);

  // Arrow Down: Alpha is expanded, so first child (Guitars) is selected
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(150);
  const guitarsNode = page.getByTestId("tree-node-source-_Alpha_Guitars");
  await guitarsNode.waitFor({ state: "visible" });
  const guitarsSelected = await guitarsNode.getAttribute("data-selected");
  assert.equal(guitarsSelected, "true", "Expected Arrow Down to select first child (Guitars).");

  // Arrow Up: should move back to Alpha
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(100);
  const alphaSelected = await alphaNode.getAttribute("data-selected");
  assert.equal(alphaSelected, "true", "Expected Arrow Up to select Alpha.");

  // Arrow Left: collapse Alpha (we're on Alpha, it's expanded)
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(100);
  const alphaExpandedAfterLeft = await alphaNode.getAttribute("data-expanded");
  assert.equal(alphaExpandedAfterLeft, "false", "Expected Arrow Left to collapse Alpha folder.");

  // Arrow Right: expand Alpha again
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  const alphaExpanded = await alphaNode.getAttribute("data-expanded");
  assert.equal(alphaExpanded, "true", "Expected Arrow Right to expand Alpha folder.");
}
