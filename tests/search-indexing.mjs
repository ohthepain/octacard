import assert from "node:assert/strict";

export async function assertIndexedSearchUsesCache(page) {
  const sourceSearchInput = page.getByTestId("panel-source").getByPlaceholder("Search files...");

  await sourceSearchInput.waitFor({ state: "visible" });

  await page.evaluate(() => {
    window.__readDirectoryCalls = 0;
  });

  // Warm up the in-memory index in case initial background indexing is still running.
  await sourceSearchInput.fill("120");
  await page.waitForTimeout(900);
  const afterWarmup = await page.evaluate(() => window.__readDirectoryCalls ?? 0);

  // Subsequent source-pane queries should run in memory with no directory traversal.
  await sourceSearchInput.fill("12");
  await page.waitForTimeout(450);
  await sourceSearchInput.fill("120");
  await page.waitForTimeout(900);
  const afterSourceQuery = await page.evaluate(() => window.__readDirectoryCalls ?? 0);
  assert.equal(
    afterSourceQuery - afterWarmup,
    0,
    "Expected repeated source search queries to avoid recursive directory reads after index warmup.",
  );

  await sourceSearchInput.fill("");
}
