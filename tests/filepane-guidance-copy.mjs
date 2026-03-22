import assert from "node:assert/strict";

export async function assertFilePaneGuidanceCopy(page) {
  const sourcePanel = page.getByTestId("panel-source");
  await sourcePanel.waitFor({ state: "visible" });

  const guidanceText = "Octacard manages and converts sample files for your hardware.";

  const sourceGuidance = sourcePanel.locator("p", { hasText: guidanceText }).first();
  await sourceGuidance.waitFor({ state: "visible" });
  const sourceClass = await sourceGuidance.getAttribute("class");
  assert.ok(sourceClass?.includes("text-sm"), "Expected source guidance copy to use larger text.");

  await sourcePanel.getByText("Select your raw (source) samples folder here.").first().waitFor({ state: "visible" });
}
