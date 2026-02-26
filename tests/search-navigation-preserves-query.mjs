import assert from "node:assert/strict";

export async function assertSearchQueryPersistsWhenNavigatingSearchResult(page) {
  const sourcePanel = page.getByTestId("panel-source");
  const sourceSearchInput = sourcePanel.getByPlaceholder("Search files...");

  await sourceSearchInput.waitFor({ state: "visible" });
  await sourcePanel.locator('button[title="Root"]').click();
  await page.getByTestId("tree-node-source-_Alpha").waitFor({ state: "visible" });

  const query = "gtr";
  await sourceSearchInput.fill(query);

  const searchResultFolder = page.getByTestId("tree-node-source-_Alpha_Guitars");
  await searchResultFolder.waitFor({ state: "visible" });
  await searchResultFolder.click();
  await page.waitForTimeout(400);

  const inputValue = await sourceSearchInput.inputValue();
  assert.equal(inputValue, query, "Expected search input text to persist after navigating from search results.");

  await sourceSearchInput.fill("");
  await sourcePanel.locator('button[title="Root"]').click();
  await page.getByTestId("tree-node-source-_Alpha").waitFor({ state: "visible" });
}
