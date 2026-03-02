import assert from "node:assert/strict";
import { waitForPageCondition } from "./wait-utils.mjs";

export async function assertConvertDialogEllipsis(page) {
  await page.evaluate(() => {
    window.__listCalls = [];
    window.__convertCalls = [];
  });

  const formatButton = page.getByTestId("format-settings-button");
  await formatButton.click();
  await page.locator('label[for="file-format-wav"]').click();
  await page.locator('label[for="sample-depth-16-bit"]').click();
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("dialog", { name: "Format Settings" }).waitFor({ state: "hidden" });

  await page.getByTestId("panel-source").locator('button[title="Root"]').click();
  const sourceLongNames = page.getByTestId("tree-node-source-_LongNames");
  await sourceLongNames.waitFor({ state: "visible" });
  await sourceLongNames.click();
  await sourceLongNames.dblclick();
  await page.locator('[data-testid^="tree-node-source-_LongNames_"]').first().waitFor({ state: "visible" });

  const convertButton = page.getByRole("button", { name: "Convert" });
  await convertButton.click();
  await page.getByRole("heading", { name: "Convert Files?" }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Convert & Save" }).click();
  await page.getByRole("heading", { name: "Convert Files?" }).waitFor({ state: "hidden" });

  const fileLabel = page.getByTestId("conversion-current-file");
  const labelVisible = await fileLabel
    .waitFor({ state: "visible", timeout: 4000 })
    .then(() => true)
    .catch(() => false);

  if (labelVisible) {
    const dialog = page.getByRole("dialog").filter({ hasText: "Converting" });
    await waitForPageCondition(
      page,
      "document.querySelector('[data-testid=\"conversion-current-file\"]')?.querySelector('span:last-of-type')?.textContent?.endsWith('.wav') ?? false",
      { timeout: 5000 },
    );

    const dialogBox = await dialog.boundingBox();
    const labelBox = await fileLabel.boundingBox();

    assert.ok(dialogBox, "Expected conversion dialog to have a bounding box.");
    assert.ok(labelBox, "Expected conversion file label to have a bounding box.");
    assert.ok(
      labelBox.x + labelBox.width <= dialogBox.x + dialogBox.width,
      `Expected file label to fit inside dialog. labelRight=${labelBox.x + labelBox.width}, dialogRight=${
        dialogBox.x + dialogBox.width
      }`,
    );

    const endSegment = await fileLabel.locator("span").last().textContent();
    assert.ok(
      endSegment?.endsWith(".wav"),
      `Expected ellipsis to preserve file extension. segment=${endSegment}`,
    );

    await fileLabel.waitFor({ state: "hidden" });
  } else {
    await waitForPageCondition(page, "Array.isArray(window.__convertCalls) && window.__convertCalls.length >= 1");
    const latestCall = await page.evaluate(() => (window.__convertCalls ?? []).at(-1));
    const latestListCall = await page.evaluate(() => (window.__listCalls ?? []).at(-1));
    assert.equal(latestListCall?.startPath, "/LongNames", "Expected conversion list call to use /LongNames.");
    assert.ok(
      latestCall?.sourceVirtualPath?.includes("/LongNames/"),
      "Expected conversion to run for LongNames sample.",
    );
  }

  await page.evaluate(() => {
    window.__listCalls = [];
    window.__convertCalls = [];
  });
}
