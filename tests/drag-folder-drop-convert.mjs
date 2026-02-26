import assert from "node:assert/strict";

export async function assertDragFolderDropConvertsWithoutConfirmation(page) {
  const formatButton = page.getByRole("button", { name: "Format" });
  await formatButton.click();
  await page.getByRole("menuitem", { name: "Sample Depth" }).hover();
  await page.getByRole("menuitemradio", { name: "16-bit" }).click();
  await page.waitForSelector('[role="menu"]', { state: "hidden", timeout: 2000 }).catch(() => {});

  const sourceAlphaNode = page.getByTestId("tree-node-source-_Alpha");
  const destBetaNode = page.getByTestId("tree-node-dest-_Beta");
  await sourceAlphaNode.waitFor({ state: "visible" });
  await destBetaNode.waitFor({ state: "visible" });
  const convertCallCountBeforeDrop = await page.evaluate(() => (window.__convertCalls ?? []).length);

  await page.evaluate(() => {
    const sourceNode = document.querySelector('[data-testid="tree-node-source-_Alpha"]');
    const destNode = document.querySelector('[data-testid="tree-node-dest-_Beta"]');
    if (!(sourceNode instanceof HTMLElement)) throw new Error("Source folder node not found");
    if (!(destNode instanceof HTMLElement)) throw new Error("Destination folder node not found");

    const dataTransfer = new DataTransfer();
    dataTransfer.setData("sourcePath", "/Alpha");
    dataTransfer.setData("sourceType", "folder");
    dataTransfer.setData("sourcePane", "source");
    dataTransfer.setData("isMultiple", "false");

    destNode.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer }));
    destNode.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
  });

  const progressDialog = page.getByRole("dialog").filter({ hasText: "Copying Files" });
  await progressDialog.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
  await progressDialog.waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
  await page
    .waitForFunction(
      (beforeCount) => Array.isArray(window.__convertCalls) && window.__convertCalls.length > beforeCount,
      convertCallCountBeforeDrop,
      { timeout: 15000 },
    )
    .catch(() => {});

  const confirmDialogVisible = await page
    .getByRole("heading", { name: /Convert Files\?|Copy Files\?/ })
    .isVisible()
    .catch(() => false);
  assert.equal(confirmDialogVisible, false, "Drag-and-drop should not show confirmation dialog.");

  const dropConvertCalls = await page.evaluate(
    (beforeCount) => (window.__convertCalls ?? []).slice(beforeCount),
    convertCallCountBeforeDrop,
  );
  assert.ok(dropConvertCalls.length > 0, "Expected drag-and-drop to trigger at least one conversion call.");
  assert.ok(
    dropConvertCalls.some((call) => typeof call?.destVirtualPath === "string" && call.destVirtualPath.startsWith("/Beta/Alpha")),
    "Expected drag-and-drop conversion output to target /Beta/Alpha.",
  );
}
