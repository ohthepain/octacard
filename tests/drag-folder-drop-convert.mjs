import assert from "node:assert/strict";

export async function assertDragFolderDropConvertsWithoutConfirmation(page) {
  const sourceAlphaNode = page.getByTestId("tree-node-source-_Alpha");
  const destBetaNode = page.getByTestId("tree-node-dest-_Beta");
  await sourceAlphaNode.waitFor({ state: "visible" });
  await destBetaNode.waitFor({ state: "visible" });

  await sourceAlphaNode.dragTo(destBetaNode);

  const progressDialog = page.getByRole("dialog").filter({ hasText: "Copying Files" });
  await progressDialog.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
  await progressDialog.waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});

  const confirmDialogVisible = await page
    .getByRole("heading", { name: /Convert Files\?|Copy Files\?/ })
    .isVisible()
    .catch(() => false);
  assert.equal(confirmDialogVisible, false, "Drag-and-drop should not show confirmation dialog.");
}
