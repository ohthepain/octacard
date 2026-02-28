import assert from "node:assert/strict";

export async function assertSampleRateOptions(page) {
  const formatButton = page.getByTestId("format-settings-button");
  await formatButton.click();

  const dontChange = page.getByLabel("Don't change").first();
  const rate31250 = page.getByLabel("31250");
  const rate44100 = page.getByLabel("44100");
  const rate48000 = page.getByLabel("48000");

  await dontChange.waitFor({ state: "visible" });
  await rate31250.waitFor({ state: "visible" });
  await rate44100.waitFor({ state: "visible" });
  await rate48000.waitFor({ state: "visible" });

  assert.equal(await rate48000.count(), 1, "Expected one 48000 Hz sample-rate option.");

  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("dialog", { name: "Format Settings" }).waitFor({ state: "hidden" });
}
