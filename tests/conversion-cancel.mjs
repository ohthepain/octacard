import assert from "node:assert/strict";

export async function assertConversionCanBeCancelled(page) {
  await page.evaluate(() => {
    window.__listCalls = [];
    window.__convertCalls = [];
  });

  await page.getByTestId("tree-node-source-_Bulk").click();
  await page.getByTestId("tree-node-dest-_Beta").click();
  await page.getByRole("button", { name: "Convert" }).click();

  const confirmButtons = ["Convert & Save", "Copy"];
  let confirmClicked = false;
  for (const name of confirmButtons) {
    const button = page.getByRole("button", { name });
    if (await button.isVisible().catch(() => false)) {
      await button.click();
      confirmClicked = true;
      break;
    }
  }
  assert.ok(confirmClicked, "Expected to confirm conversion before testing cancellation.");

  const progressDialog = page.getByRole("dialog").filter({ hasText: "Converting Files" });
  await progressDialog.waitFor({ state: "visible" });
  await page.waitForFunction(() => Array.isArray(window.__convertCalls) && window.__convertCalls.length >= 1);

  await progressDialog.getByRole("button", { name: "Close" }).click();
  const cancelPrompt = page.getByRole("dialog").filter({ hasText: "Cancel conversion?" });
  await cancelPrompt.waitFor({ state: "visible" });
  await cancelPrompt.getByRole("button", { name: "Cancel Conversion" }).click();

  await progressDialog.waitFor({ state: "hidden" });
  await page.waitForTimeout(250);

  const convertCalls = await page.evaluate(() => window.__convertCalls);
  assert.ok(convertCalls.length < 6, `Expected cancellation before all files were processed. Calls=${convertCalls.length}`);

  await page.evaluate(() => {
    window.__listCalls = [];
    window.__convertCalls = [];
  });
}
