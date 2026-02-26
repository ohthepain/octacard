import assert from "node:assert/strict";

export async function assertFormatMenuCategories(page) {
  const formatButton = page.getByRole("button", { name: "Format" });
  await formatButton.click();

  const categoryNames = ["Format", "Sample Rate", "Sample Depth", "Pitch", "Mono", "Normalize", "Trim"];

  for (const name of categoryNames) {
    const item = page.getByRole("menuitem", { name });
    await item.waitFor({ state: "visible" });
    assert.equal(await item.count(), 1, `Expected one ${name} category in the Format menu.`);
  }

  await page.keyboard.press("Escape");
  await page.waitForSelector('[role="menu"]', { state: "hidden", timeout: 2000 }).catch(() => {});
}
