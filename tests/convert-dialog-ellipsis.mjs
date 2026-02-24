import assert from "node:assert/strict";

export async function assertConvertDialogEllipsis(page) {
  const sourceLongNames = page.getByTestId("tree-node-source-_LongNames");
  await sourceLongNames.waitFor({ state: "visible" });
  await sourceLongNames.click();

  const convertButton = page.getByRole("button", { name: "Convert" });
  await convertButton.click();

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
  assert.ok(confirmClicked, "Expected to confirm conversion or copy.");

  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });

  const fileLabel = page.getByTestId("conversion-current-file");
  await fileLabel.waitFor({ state: "visible" });

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

  await page.evaluate(() => {
    window.__listCalls = [];
    window.__convertCalls = [];
  });
}
