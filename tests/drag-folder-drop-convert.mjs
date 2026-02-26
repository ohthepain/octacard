import assert from "node:assert/strict";

export async function assertDragFolderDropConvertsWithoutConfirmation(page) {
  const sourceAlphaNode = page.getByTestId("tree-node-source-_Alpha");
  const destBetaNode = page.getByTestId("tree-node-dest-_Beta");
  await sourceAlphaNode.waitFor({ state: "visible" });
  await destBetaNode.waitFor({ state: "visible" });

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

  const confirmDialogVisible = await page
    .getByRole("heading", { name: /Convert Files\?|Copy Files\?/ })
    .isVisible()
    .catch(() => false);
  assert.equal(confirmDialogVisible, false, "Drag-and-drop should not show confirmation dialog.");

  const copiedAlphaNode = page.getByTestId("tree-node-dest-_Beta_Alpha");
  await copiedAlphaNode.waitFor({ state: "visible" });
  await copiedAlphaNode.click();
  await page.getByTestId("tree-node-dest-_Beta_Alpha_inside-alpha_wav").waitFor({ state: "visible" });
  const guitarsNode = page.getByTestId("tree-node-dest-_Beta_Alpha_Guitars");
  await guitarsNode.waitFor({ state: "visible" });
  await guitarsNode.click();
  await page.getByTestId("tree-node-dest-_Beta_Alpha_Guitars_clean_gtr_center_wav").waitFor({ state: "visible" });
}
