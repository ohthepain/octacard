import assert from "node:assert/strict";

export async function assertLargeBatchConversionCanBeCancelledQuickly(page) {
  const formatButton = page.getByRole("button", { name: "Format" });
  await formatButton.click();
  await page.locator('label[for="sample-depth-dont-change"]').click();
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("dialog", { name: "Format Settings" }).waitFor({ state: "hidden" });

  await page.evaluate(() => {
    window.__listCalls = [];
    window.__convertCalls = [];
  });

  await page.getByTestId("tree-node-source-_Huge").click();
  await page.getByTestId("tree-node-dest-_Beta").click();
  await page.getByRole("button", { name: "Convert" }).click();

  const copyButton = page.getByRole("button", { name: "Copy" });
  await copyButton.waitFor({ state: "visible" });
  await copyButton.click();

  const progressDialog = page.getByRole("dialog").filter({ hasText: "Converting Files" });
  await progressDialog.waitFor({ state: "visible" });
  await page.waitForFunction(() => Array.isArray(window.__convertCalls) && window.__convertCalls.length >= 1);

  await progressDialog.getByRole("button", { name: "Close" }).click();
  const cancelPrompt = page.getByRole("dialog").filter({ hasText: "Cancel conversion?" });
  await cancelPrompt.waitFor({ state: "visible" });
  await cancelPrompt.getByRole("button", { name: "Cancel Conversion" }).click();

  await progressDialog.waitFor({ state: "hidden", timeout: 5000 });
  await page.waitForTimeout(100);

  const convertCalls = await page.evaluate(() => window.__convertCalls.length);
  assert.ok(convertCalls < 80, `Expected quick cancellation in large batch. Calls=${convertCalls}`);

  await page.evaluate(() => {
    window.__listCalls = [];
    window.__convertCalls = [];
  });
}
