/**
 * Integration / Playwright only: set a pane library root using the real
 * `requestDirectoryForPane` path (mock directory picker) when the UI does not
 * expose a second FilePane (e.g. no destination browser in the main layout).
 */
export async function ensureMockDestRoot(page) {
  await page.evaluate(async () => {
    const hooks = window.__octacardTestHooks;
    if (!hooks?.requestDirectoryForPaneForTests) {
      throw new Error("requestDirectoryForPaneForTests missing (not running under integration hooks?)");
    }
    const result = await hooks.requestDirectoryForPaneForTests("dest");
    if (!result?.success) {
      throw new Error(result?.error ?? "requestDirectoryForPaneForTests('dest') failed");
    }
  });
}
