import assert from "node:assert/strict";

export async function assertMultiStackRowControls(page) {
  const multiToggle = page.getByTestId("multi-mode-toggle");
  await multiToggle.waitFor({ state: "visible" });
  await multiToggle.click();

  const transport = page.getByTestId("stack-transport");
  await transport.waitFor({ state: "visible" });
  const firstEmptySlot = page.getByTestId("empty-slot-0");
  await firstEmptySlot.waitFor({ state: "visible" });

  const [transportBox, slotBox] = await Promise.all([transport.boundingBox(), firstEmptySlot.boundingBox()]);
  assert.ok(transportBox, "Expected stack transport to have a visible bounding box.");
  assert.ok(slotBox, "Expected first stack slot to have a visible bounding box.");
  assert.ok(
    transportBox.width <= slotBox.width * 1.4,
    `Expected stack transport width to be close to one block. transport=${transportBox.width}, slot=${slotBox.width}`,
  );

  const addButtonsInTransport = await transport.getByRole("button", { name: "Add row above" }).count();
  assert.equal(addButtonsInTransport, 0, "Expected no add-row button inside the transport section.");

  const rowControls0 = page.getByTestId("stack-row-controls-0");
  await rowControls0.waitFor({ state: "visible" });
  await page.getByTestId("stack-add-row-button").click();
  await page.getByTestId("stack-row-controls-1").waitFor({ state: "visible" });

  await page.getByTestId("stack-row-drag-0").waitFor({ state: "visible" });
  await page.getByTestId("stack-row-drag-1").waitFor({ state: "visible" });

  await page.getByTestId("stack-row-delete-0").click();
  await page.getByTestId("stack-row-controls-1").waitFor({ state: "hidden" });
  await multiToggle.click();
}
