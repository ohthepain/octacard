import assert from "node:assert/strict";

export async function assertRevealInFinder(page) {
  const alphaNode = page.getByTestId("tree-node-source-_Alpha");
  await alphaNode.waitFor({ state: "visible" });
  await alphaNode.click({ button: "right" });

  const revealMenuItem = page.getByRole("menuitem", { name: "Reveal in Finder" });
  await revealMenuItem.waitFor({ state: "visible" });
  await revealMenuItem.click();

  await page.waitForFunction(() => Array.isArray(window.__revealCalls) && window.__revealCalls.length >= 1);
  const revealCalls = await page.evaluate(() => window.__revealCalls);
  assert.equal(revealCalls.length, 1, "Expected a single reveal call.");
  assert.equal(revealCalls[0].virtualPath, "/Alpha", "Reveal should use the selected folder path.");
  assert.equal(revealCalls[0].paneType, "source", "Reveal should use the source pane type.");
  assert.equal(revealCalls[0].isDirectory, true, "Reveal should indicate the folder is a directory.");
}
