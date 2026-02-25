import assert from "node:assert/strict";

export async function assertExpandedFoldersPersistOnReload(page) {
  const alphaNodeTestId = "tree-node-source-_Alpha";
  const alphaChildTestId = "tree-node-source-_Alpha_inside-alpha_wav";

  const alphaNode = page.getByTestId(alphaNodeTestId);
  await alphaNode.waitFor({ state: "visible" });

  await page.evaluate((testId) => {
    const node = document.querySelector(`[data-testid="${testId}"]`);
    if (!node) throw new Error("Source Alpha node not found");
    if (node.getAttribute("data-expanded") !== "true") {
      node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
  }, alphaNodeTestId);

  await page.getByTestId(alphaChildTestId).waitFor({ state: "visible" });
  const persistedBeforeReload = await page.evaluate(() => localStorage.getItem("octacard_nav_state_source__default"));
  assert.ok(persistedBeforeReload, "Expected navigation state to be persisted before reload.");

  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "OctaCard" }).waitFor({ state: "visible" });
  await page.evaluate(() => {
    const sourcePanel = document.querySelector('[data-testid="panel-source"]');
    if (!(sourcePanel instanceof HTMLElement)) throw new Error("Source panel not found after reload");
    const browseButton = sourcePanel.querySelector('button[title="Browse for folder to navigate to"]');
    if (!(browseButton instanceof HTMLElement)) throw new Error("Source browse button not found after reload");
    browseButton.click();
  });

  const reloadedAlphaNode = page.getByTestId(alphaNodeTestId);
  await reloadedAlphaNode.waitFor({ state: "visible" });
  await page.waitForTimeout(1200);
  const reloadedExpanded = await reloadedAlphaNode.getAttribute("data-expanded");
  const persistedAfterReload = await page.evaluate(() => localStorage.getItem("octacard_nav_state_source__default"));
  assert.equal(
    reloadedExpanded,
    "true",
    `Expected reloaded folder to remain expanded. Persisted nav state: ${persistedAfterReload ?? "null"}`,
  );

  const reloadedChild = page.getByTestId(alphaChildTestId);
  await reloadedChild.waitFor({ state: "visible" });
  const childVisible = await reloadedChild.isVisible();
  assert.ok(childVisible, "Expected expanded folder state to persist after reload.");
}
