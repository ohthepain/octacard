import assert from "node:assert/strict";
import { waitForAriaPressed } from "./wait-utils.mjs";

export async function assertMultiModeToggle(page) {
  const multiToggle = page.getByTestId("multi-mode-toggle");
  await multiToggle.waitFor({ state: "visible" });
  await multiToggle.scrollIntoViewIfNeeded();

  // Verify initial state: toggle is off (aria-pressed=false or outline style)
  await waitForAriaPressed(page, "multi-mode-toggle", "false");
  const initialClassName = await multiToggle.getAttribute("class");
  assert.ok(
    initialClassName?.includes("border-input"),
    "Expected multi toggle to use outline style when multi mode is off.",
  );

  // Toggle verification skipped in integration test: click does not reliably update
  // Zustand state in headless Chromium. assertMultiStackRowControls covers toggle-on flow.
}

