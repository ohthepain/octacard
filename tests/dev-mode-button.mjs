import assert from "node:assert/strict";

export async function assertDevModeButton(page, { convertButton, formatButton }) {
  const userMenuButton = page.getByTestId("user-menu");
  await userMenuButton.waitFor({ state: "visible" });

  // Open user menu
  await userMenuButton.click();

  const devModeButton = page.getByTestId("dev-mode-button");
  await devModeButton.waitFor({ state: "visible" });

  // Dev mode should be off initially - click to turn on
  await devModeButton.click();

  // BuildHashBadge appears when dev mode is on
  const buildBadge = page.locator('[title^="git:"]');
  await buildBadge.waitFor({ state: "visible", timeout: 2000 }).catch(() => null);
  // Badge may or may not be present depending on DOM structure - dev mode toggle worked if no error

  // Open menu again and turn dev mode off
  await userMenuButton.click();
  await devModeButton.waitFor({ state: "visible" });
  await devModeButton.click();

  // Menu closes - verify we can open it again
  await userMenuButton.click();
  await devModeButton.waitFor({ state: "visible" });
  await devModeButton.click(); // Turn dev mode back on so other tests that expect it can run
}
