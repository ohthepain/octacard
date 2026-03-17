import assert from "node:assert/strict";

export async function assertFilePaneGuidanceCopy(page) {
  const sourcePanel = page.getByTestId("panel-source");
  const destPanel = page.getByTestId("panel-dest");
  await sourcePanel.waitFor({ state: "visible" });
  await destPanel.waitFor({ state: "visible" });

  const guidanceText = "Octacard manages and converts sample files for your hardware.";

  const sourceGuidance = sourcePanel.locator("p", { hasText: guidanceText }).first();
  await sourceGuidance.waitFor({ state: "visible" });
  const sourceClass = await sourceGuidance.getAttribute("class");
  assert.ok(sourceClass?.includes("text-sm"), "Expected source guidance copy to use larger text.");

  await sourcePanel.getByText("Select your raw samples folder here.").first().waitFor({ state: "visible" });
  await destPanel.getByText("Select a folder for your converted samples here.").first().waitFor({ state: "visible" });
}
