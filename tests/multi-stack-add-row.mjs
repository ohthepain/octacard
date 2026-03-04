import assert from "node:assert/strict";

async function waitForEmptyBlockCount(page, expectedCount, timeout = 10000) {
  const start = Date.now();
  let lastCount = -1;
  while (Date.now() - start < timeout) {
    lastCount = await page.getByText("Next sample", { exact: true }).count();
    if (lastCount === expectedCount) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`Expected ${expectedCount} empty blocks, got ${lastCount}`);
}

export async function assertMultiStackCanAddNewRow(page) {
  const multiToggle = page.getByTestId("multi-mode-toggle");
  await multiToggle.waitFor({ state: "visible" });
  await multiToggle.click();

  const addRowButton = page.getByTestId("stack-add-row-button");
  await addRowButton.waitFor({ state: "visible" });

  const bulkFolderNode = page.getByTestId("tree-node-source-_Bulk");
  await bulkFolderNode.waitFor({ state: "visible" });
  await bulkFolderNode.click();
  await page.getByTestId("tree-node-source-_Bulk_bulk-1_wav").waitFor({ state: "visible" });

  for (let i = 1; i <= 4; i++) {
    if (i > 1) {
      await page.getByText("Next sample", { exact: true }).first().click();
    }
    await page.getByTestId(`tree-node-source-_Bulk_bulk-${i}_wav`).click();
  }

  await waitForEmptyBlockCount(page, 0);

  await addRowButton.click();
  await waitForEmptyBlockCount(page, 4);

  await page.getByText("Next sample", { exact: true }).first().click();
  await page.getByTestId("tree-node-source-_Bulk_bulk-5_wav").click();
  await waitForEmptyBlockCount(page, 3);

  const filledBlocks = await page.getByLabel("Remove from stack").count();
  assert.equal(filledBlocks, 5, "Expected five samples in stack after adding a new row.");

  await multiToggle.click();
}
