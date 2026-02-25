import assert from "node:assert/strict";

export async function assertDevModeButton(page, { convertButton, formatButton }) {
  const devModeButton = page.getByTestId("dev-mode-button");
  await devModeButton.waitFor({ state: "visible" });
  await expectAriaPressed(page, devModeButton, "false");

  const convertBox = await convertButton.boundingBox();
  const devModeBox = await devModeButton.boundingBox();
  const formatBox = await formatButton.boundingBox();
  assert.ok(convertBox, "Expected convert button to have a visible bounding box.");
  assert.ok(devModeBox, "Expected dev mode button to have a visible bounding box.");
  assert.ok(formatBox, "Expected format button to have a visible bounding box.");
  assert.ok(
    devModeBox.x > convertBox.x + convertBox.width,
    `Expected dev mode button to be to the right of convert. convertRight=${convertBox.x + convertBox.width}, devModeLeft=${devModeBox.x}`,
  );
  assert.ok(
    formatBox.x > devModeBox.x + devModeBox.width,
    `Expected format button to be to the right of dev mode. devModeRight=${devModeBox.x + devModeBox.width}, formatLeft=${formatBox.x}`,
  );

  const initialClassName = await devModeButton.getAttribute("class");
  assert.ok(
    initialClassName?.includes("border-orange-500"),
    "Expected dev mode button to have orange outline styling when disabled.",
  );
  assert.ok(
    !initialClassName?.includes("bg-orange-500"),
    "Expected dev mode button to not be solid orange when disabled.",
  );

  await devModeButton.click();
  await expectAriaPressed(page, devModeButton, "true");
  const enabledClassName = await devModeButton.getAttribute("class");
  assert.ok(
    enabledClassName?.includes("bg-orange-500"),
    "Expected dev mode button to be solid orange when enabled.",
  );

  await devModeButton.click();
  await expectAriaPressed(page, devModeButton, "false");
}

async function expectAriaPressed(page, locator, value) {
  await locator.waitFor({ state: "visible" });
  await page.waitForFunction(
    ([element, expectedValue]) => element?.getAttribute("aria-pressed") === expectedValue,
    [await locator.elementHandle(), value],
  );
}
