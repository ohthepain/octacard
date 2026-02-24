import assert from "node:assert/strict";

export async function assertDestRefreshAfterConvert(page) {
  const betaNode = page.getByTestId("tree-node-dest-_Beta");
  await betaNode.waitFor({ state: "visible" });

  await page.evaluate(() => {
    const node = document.querySelector('[data-testid="tree-node-dest-_Beta"]');
    if (!node) throw new Error("Destination Beta node not found");
    if (node.getAttribute("data-expanded") !== "true") {
      node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
  });

  const newFolder = page.getByTestId("tree-node-dest-_Beta_Alpha");
  await newFolder.waitFor({ state: "visible" });
  const isVisible = await newFolder.isVisible();
  assert.ok(isVisible, "Expected destination panel to refresh and show /Beta/Alpha after conversion.");
}
