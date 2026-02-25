import assert from "node:assert/strict";

export async function assertRevealInFinderDoesNotOpenPickerFallback(page) {
  const pickerCallsBeforeReveal = await page.evaluate(() => {
    if (window.__octacardTestHooks) {
      delete window.__octacardTestHooks.revealInFinder;
    }
    delete window.__octacardRevealInFinder;
    window.__revealCalls = [];
    return Array.isArray(window.__pickerCalls) ? window.__pickerCalls.length : 0;
  });

  const alphaNode = page.getByTestId("tree-node-source-_Alpha");
  await alphaNode.waitFor({ state: "visible" });
  await alphaNode.click({ button: "right" });

  const revealMenuItem = page.getByRole("menuitem", { name: "Reveal in Finder" });
  await revealMenuItem.waitFor({ state: "visible" });
  await revealMenuItem.click();

  await page.waitForTimeout(250);

  const { pickerCallsAfterReveal, revealCallsAfterReveal } = await page.evaluate(() => ({
    pickerCallsAfterReveal: Array.isArray(window.__pickerCalls) ? window.__pickerCalls.length : 0,
    revealCallsAfterReveal: Array.isArray(window.__revealCalls) ? window.__revealCalls.length : 0,
  }));

  assert.equal(
    pickerCallsAfterReveal,
    pickerCallsBeforeReveal,
    "Reveal in Finder should not open a directory picker fallback.",
  );
  assert.equal(revealCallsAfterReveal, 0, "Reveal hook should not be called when reveal bridge is unavailable.");
}
