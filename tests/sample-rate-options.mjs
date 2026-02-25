import assert from "node:assert/strict";

export async function assertSampleRateOptions(page) {
  const formatButton = page.getByRole("button", { name: "Format" });
  await formatButton.click();

  await page.getByRole("menuitem", { name: "Sample Rate" }).hover();

  const dontChange = page.getByRole("menuitemradio", { name: "Don't change" });
  const rate44100 = page.getByRole("menuitemradio", { name: "44100" });
  const rate48000 = page.getByRole("menuitemradio", { name: "48000" });

  await dontChange.waitFor({ state: "visible" });
  await rate44100.waitFor({ state: "visible" });
  await rate48000.waitFor({ state: "visible" });

  assert.equal(await rate48000.count(), 1, "Expected one 48000 Hz sample-rate option.");

  // Close the menu so subsequent test steps start from a clean state.
  await page.keyboard.press("Escape");
  await page.waitForSelector('[role="menu"]', { state: "hidden", timeout: 2000 }).catch(() => {});
}
