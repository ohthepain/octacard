import assert from "node:assert/strict";

export async function assertHeaderDoesNotShowSelectDirectory(page) {
  const header = page.locator("header");
  await header.waitFor({ state: "visible" });
  const selectDirectoryButton = header.getByRole("button", { name: "Select Directory" });
  const buttonCount = await selectDirectoryButton.count();
  assert.equal(buttonCount, 0, "Expected header to not render a Select Directory button.");
}
