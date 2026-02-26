import assert from "node:assert/strict";

export async function assertIndexedSearch(page, { pane, query, expectedNodeTestId }) {
  const panelTestId = pane === "dest" ? "panel-dest" : "panel-source";
  const panel = page.getByTestId(panelTestId);
  await panel.waitFor({ state: "visible" });

  const searchInput = panel.locator('input[placeholder="Search files..."]');
  await searchInput.waitFor({ state: "visible" });
  await searchInput.fill("");
  await page.waitForTimeout(100);

  await page.evaluate(() => {
    window.__entriesCallCount = 0;
  });

  await searchInput.fill(query);
  await page.waitForTimeout(700);

  const entriesCallCount = await page.evaluate(() => window.__entriesCallCount ?? -1);
  assert.equal(
    entriesCallCount,
    0,
    `Expected indexed search to avoid recursive directory reads. pane=${pane}, query=${query}, entriesCalls=${entriesCallCount}`,
  );

  if (expectedNodeTestId) {
    await page.getByTestId(expectedNodeTestId).waitFor({ state: "visible" });
  }

  await searchInput.fill("");
  await page.waitForTimeout(100);
}
