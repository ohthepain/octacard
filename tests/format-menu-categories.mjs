import assert from "node:assert/strict";

export async function assertFormatMenuCategories(page) {
  const formatButton = page.getByTestId("format-settings-button");
  await formatButton.click();

  const categoryNames = ["Format", "Sample Rate", "Sample Depth", "Pitch", "Mono", "Normalize", "Trim", "Tempo"];

  for (const name of categoryNames) {
    const item = page.getByText(name, { exact: true });
    await item.first().waitFor({ state: "visible" });
    assert.ok((await item.count()) >= 1, `Expected ${name} section in the Format dialog.`);
  }

  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("dialog", { name: "Format Settings" }).waitFor({ state: "hidden" });
}
