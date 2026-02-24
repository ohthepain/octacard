import assert from "node:assert/strict";

export async function assertRevealFileInFinder(page) {
  const alphaNode = page.getByTestId("tree-node-source-_Alpha");
  await alphaNode.waitFor({ state: "visible" });
  const isExpanded = await alphaNode.getAttribute("data-expanded");
  if (isExpanded !== "true") {
    await alphaNode.click();
  }

  const fileNode = page.getByTestId("tree-node-source-_Alpha_inside-alpha_wav");
  await fileNode.waitFor({ state: "visible" });
  await fileNode.click({ button: "right" });

  const revealMenuItem = page.getByRole("menuitem", { name: "Reveal in Finder" });
  await revealMenuItem.waitFor({ state: "visible" });
  await revealMenuItem.click();

  await page.waitForFunction(() => Array.isArray(window.__revealCalls) && window.__revealCalls.length >= 1);
  const revealCalls = await page.evaluate(() => window.__revealCalls);
  const lastCall = revealCalls.at(-1);
  assert.ok(lastCall, "Expected a reveal call for the file.");
  assert.equal(lastCall.virtualPath, "/Alpha/inside-alpha.wav", "Reveal should use the selected file path.");
  assert.equal(lastCall.paneType, "source", "Reveal should use the source pane type.");
  assert.equal(lastCall.isDirectory, false, "Reveal should indicate the target is a file.");
}
