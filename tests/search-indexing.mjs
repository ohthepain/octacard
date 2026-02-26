import assert from "node:assert/strict";

export async function assertIndexedSearchUsesCache(page) {
  const sourceSearchInput = page.getByTestId("panel-source").getByPlaceholder("Search files...");
  const destSearchInput = page.getByTestId("panel-dest").getByPlaceholder("Search files...");

  await sourceSearchInput.waitFor({ state: "visible" });
  await destSearchInput.waitFor({ state: "visible" });

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

  // Destination pane should reuse the same root-backed index (shared cache).
  await destSearchInput.fill("inside");
  await page.waitForTimeout(900);
  const afterDestQuery = await page.evaluate(() => window.__readDirectoryCalls ?? 0);
  assert.equal(
    afterDestQuery - afterSourceQuery,
    0,
    "Expected destination pane search to reuse the shared root index without extra directory traversal.",
  );

  await sourceSearchInput.fill("");
  await destSearchInput.fill("");
}

export async function assertSearchFindsConvertedFileAfterReindex(page) {
  const destSearchInput = page.getByTestId("panel-dest").getByPlaceholder("Search files...");
  await destSearchInput.waitFor({ state: "visible" });

  await destSearchInput.fill("inside-alpha");
  await page.getByTestId("tree-node-dest-_Beta_Alpha").waitFor({ state: "visible" });
  await destSearchInput.fill("");
}
