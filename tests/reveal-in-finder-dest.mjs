import assert from "node:assert/strict";

export async function assertRevealInFinderDest(page) {
  const betaNode = page.getByTestId("tree-node-dest-_Beta");
  await betaNode.waitFor({ state: "visible" });
  await betaNode.click({ button: "right" });

  const revealMenuItem = page.getByRole("menuitem", { name: "Reveal in Finder" });
  await revealMenuItem.waitFor({ state: "visible" });
  await revealMenuItem.click();

  await page.waitForFunction(() => Array.isArray(window.__revealCalls) && window.__revealCalls.length >= 1);
  const revealCalls = await page.evaluate(() => window.__revealCalls);
  const lastCall = revealCalls.at(-1);
  assert.ok(lastCall, "Expected a reveal call for the destination folder.");
  assert.equal(lastCall.virtualPath, "/Beta", "Reveal should use the destination folder path.");
  assert.equal(lastCall.paneType, "dest", "Reveal should use the destination pane type.");
  assert.equal(lastCall.isDirectory, true, "Reveal should indicate the folder is a directory.");
}
