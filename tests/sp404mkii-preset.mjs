import assert from "node:assert/strict";

export async function assertSp404Mk2PresetDefaults(page) {
  const formatButton = page.getByRole("button", { name: "Format" });
  await formatButton.click();

  await page.getByTestId("format-preset-select").selectOption("sp-404mkii");

  const wavOption = page.locator("#file-format-wav");
  const rate48000Option = page.locator("#sample-rate-48000");
  const depth16BitOption = page.locator("#sample-depth-16-bit");

  await wavOption.waitFor({ state: "attached" });
  await rate48000Option.waitFor({ state: "attached" });
  await depth16BitOption.waitFor({ state: "attached" });

  assert.equal(await wavOption.getAttribute("data-state"), "checked", "SP-404MKII should default to WAV format.");
  assert.equal(await rate48000Option.getAttribute("data-state"), "checked", "SP-404MKII should default to 48 kHz.");
  assert.equal(
    await depth16BitOption.getAttribute("data-state"),
    "checked",
    "SP-404MKII should default to 16-bit depth.",
  );

  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("dialog", { name: "Format Settings" }).waitFor({ state: "hidden" });
}
