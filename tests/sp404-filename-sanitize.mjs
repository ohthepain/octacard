import assert from "node:assert/strict";

export async function assertSp404PresetSanitizesFilename(page) {
  await page.getByRole("button", { name: "Format" }).click();
  await page.getByTestId("format-preset-select").selectOption("sp-404sx");
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("dialog", { name: "Format Settings" }).waitFor({ state: "hidden" });

  await page.evaluate(() => {
    window.__convertCalls = [];
  });

  await page.getByTestId("favorite-open-source-_Alpha").click();
  const sourceFile = page.getByTestId("tree-node-source-_Alpha_Mel__wav");
  await sourceFile.waitFor({ state: "visible" });
  await sourceFile.click();

  await page.getByTestId("favorite-open-dest-_Beta").click();
  await page.getByTestId("tree-node-dest-_Beta").waitFor({ state: "visible" });

  await page.getByRole("button", { name: "Convert" }).click();
  await page.getByRole("button", { name: "Convert & Save" }).click();

  await page.waitForFunction(() => Array.isArray(window.__convertCalls) && window.__convertCalls.length >= 1);
  const convertCalls = await page.evaluate(() => window.__convertCalls);
  const meloCall = convertCalls.find((call) => call.sourceVirtualPath === "/Alpha/Melô.wav");
  assert.ok(meloCall, "Expected conversion call for /Alpha/Melô.wav.");
  assert.equal(meloCall.sanitizeFilename, true, "Expected SP-404 preset to enable sanitize filename.");
  assert.equal(meloCall.fileName, "Melô.wav", "Expected original filename to be passed into conversion.");

}
