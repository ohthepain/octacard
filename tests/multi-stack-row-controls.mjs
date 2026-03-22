import assert from "node:assert/strict";

/**
 * Multi-sample UI uses horizontal stack columns (not rows). Empty slots use
 * data-testid `empty-slot-{stackIndex}-{slotIndex}`; "New Stack" duplicates the active column.
 */
export async function assertMultiStackRowControls(page) {
  const multiToggle = page.getByTestId("multi-mode-toggle");
  await multiToggle.waitFor({ state: "visible" });
  await multiToggle.click();

  const transport = page.getByTestId("stack-transport");
  await transport.waitFor({ state: "visible" });
  const firstEmptySlot = page.getByTestId("empty-slot-0-0");
  await firstEmptySlot.waitFor({ state: "visible" });

  const [transportBox, slotBox] = await Promise.all([transport.boundingBox(), firstEmptySlot.boundingBox()]);
  assert.ok(transportBox, "Expected stack transport to have a visible bounding box.");
  assert.ok(slotBox, "Expected first stack slot to have a visible bounding box.");
  assert.ok(slotBox.width >= 120, `Expected first empty slot to have a sensible width, got ${slotBox.width}`);

  const addButtonsInTransport = await transport.getByRole("button", { name: "Add row above" }).count();
  assert.equal(addButtonsInTransport, 0, "Expected no add-row button inside the transport section.");

  await page.getByTestId("stack-column-0").waitFor({ state: "visible" });
  await page.getByTestId("stack-add-column").click();
  await page.getByTestId("stack-column-1").waitFor({ state: "visible" });

  await multiToggle.click();
}
