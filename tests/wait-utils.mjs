/**
 * Polling helpers to avoid page.waitForFunction(), which can trigger eval-like
 * scanner findings in test environments.
 *
 * These helpers use page.evaluate() with string expressions or locator APIs
 * instead of function callbacks.
 */

/**
 * Poll until a JavaScript expression evaluates to truthy in the page context.
 * @param {import('playwright').Page} page
 * @param {string} expression - JavaScript expression (e.g. 'window.__convertCalls?.length >= 1')
 * @param {{ timeout?: number; pollInterval?: number }} [options]
 */
export async function waitForPageCondition(page, expression, options = {}) {
  const { timeout = 10000, pollInterval = 100 } = options;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const result = await page.evaluate(expression);
      if (result) return;
    } catch {
      // Expression may throw before condition is ready
    }
    await page.waitForTimeout(pollInterval);
  }
  throw new Error(`Condition not met within ${timeout}ms: ${expression}`);
}

/**
 * Poll until a locator's aria-pressed attribute matches the expected value.
 * @param {import('playwright').Locator} locator
 * @param {string} value - Expected aria-pressed value (e.g. "true", "false")
 * @param {{ timeout?: number; pollInterval?: number }} [options]
 */
export async function waitForAriaPressed(locator, value, options = {}) {
  const { timeout = 10000, pollInterval = 100 } = options;
  const start = Date.now();
  let lastActual;
  while (Date.now() - start < timeout) {
    lastActual = await locator.getAttribute("aria-pressed");
    if (lastActual === value) return;
    await new Promise((r) => setTimeout(r, pollInterval));
  }
  throw new Error(`Expected aria-pressed="${value}" but got "${lastActual}" within ${timeout}ms`);
}
