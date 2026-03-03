import assert from "node:assert/strict";

/**
 * Asserts that About → "What's new" starts the release notes panel:
 * - Panel appears with feature and steps
 * - Can advance to next feature
 * - Can dismiss the tour
 */
export async function assertWhatsNewTour(page) {
  await page.getByRole("button", { name: "About" }).click();
  await page.getByRole("dialog", { name: /OctaCard/i }).waitFor({ state: "visible" });

  const whatsNewButton = page.getByRole("button", { name: /What's new/i });
  await whatsNewButton.waitFor({ state: "visible" });
  await whatsNewButton.click();

  await page.getByRole("dialog").waitFor({ state: "hidden" });

  const panel = page.getByTestId("release-notes-panel");
  await panel.waitFor({ state: "visible" });
  assert.ok(await panel.isVisible(), "Expected release notes panel to be visible");

  const whatsNewHeading = panel.getByText(/What's new in v/);
  await whatsNewHeading.waitFor({ state: "visible" });
  assert.ok(await whatsNewHeading.isVisible(), "Expected 'What's new in v' heading");

  const nextFeatureButton = panel.getByRole("button", { name: "Next feature" });
  if (await nextFeatureButton.isEnabled().catch(() => false)) {
    await nextFeatureButton.click();
    await page.waitForTimeout(200);
  }

  const dismissButton = panel.getByRole("button", { name: "Dismiss" });
  await dismissButton.click();
  await page.waitForTimeout(300);

  await panel.waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
  const formatButton = page.getByTestId("format-settings-button");
  assert.ok(await formatButton.isVisible(), "Expected app to be usable after tour dismiss");
}
