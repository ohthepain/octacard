import assert from "node:assert/strict";

export async function assertMultiModeToggle(page) {
  const multiToggle = page.getByTestId("multi-mode-toggle");
  await multiToggle.waitFor({ state: "visible" });

  await expectAriaPressed(page, multiToggle, "false");
  const initialClassName = await multiToggle.getAttribute("class");
  assert.ok(
    initialClassName?.includes("border-input"),
    "Expected multi toggle to use outline style when multi mode is off.",
  );

  await multiToggle.click();
  await expectAriaPressed(page, multiToggle, "true");
  const enabledClassName = await multiToggle.getAttribute("class");
  assert.ok(
    enabledClassName?.includes("bg-primary"),
    "Expected multi toggle to use solid style when multi mode is on.",
  );
  assert.ok(
    !enabledClassName?.includes("border-input"),
    "Expected multi toggle to no longer use outline style when enabled.",
  );

  await multiToggle.click();
  await expectAriaPressed(page, multiToggle, "false");
}

async function expectAriaPressed(page, locator, value) {
  await locator.waitFor({ state: "visible" });
  await page.waitForFunction(
    ([element, expectedValue]) => element?.getAttribute("aria-pressed") === expectedValue,
    [await locator.elementHandle(), value],
  );
}
