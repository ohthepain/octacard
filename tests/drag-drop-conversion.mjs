import assert from "node:assert/strict";
import { waitForPageCondition } from "./wait-utils.mjs";

export async function assertDragDropConvertsWithFormat(page) {
  const formatButton = page.getByTestId("format-settings-button");

  await formatButton.click();
  await page.getByLabel("16-bit").first().click();
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("dialog", { name: "Format Settings" }).waitFor({ state: "hidden" });

  await page.evaluate(() => {
    window.__convertCalls = [];
  });

  await page.getByTestId("favorite-open-source-_Alpha").click();
  await page.getByTestId("tree-node-source-_Alpha_inside-alpha_wav").waitFor({ state: "visible" });

  const destPanel = page.getByTestId("panel-dest");
  await destPanel.locator('button[title="Root"]').click();
  const destBetaNode = page.getByTestId("tree-node-dest-_Beta");
  await destBetaNode.waitFor({ state: "visible" });

  await page.evaluate(() => {
    const sourceFile = document.querySelector('[data-testid="tree-node-source-_Alpha_inside-alpha_wav"]');
    const destFolder = document.querySelector('[data-testid="tree-node-dest-_Beta"]');
    if (!(sourceFile instanceof HTMLElement)) throw new Error("Source file node not found.");
    if (!(destFolder instanceof HTMLElement)) throw new Error("Destination folder node not found.");

    const dataTransfer = new DataTransfer();
    dataTransfer.setData("sourcePath", "/Alpha/inside-alpha.wav");
    dataTransfer.setData("sourceType", "file");
    dataTransfer.setData("sourcePane", "source");
    dataTransfer.setData("isMultiple", "false");

    sourceFile.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer }));
    destFolder.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer }));
    destFolder.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
  });

  await waitForPageCondition(page, "Array.isArray(window.__convertCalls) && window.__convertCalls.length === 1");
  const convertCalls = await page.evaluate(() => window.__convertCalls);
  assert.equal(convertCalls[0].sourceVirtualPath, "/Alpha/inside-alpha.wav");
  assert.equal(convertCalls[0].destVirtualPath, "/Beta");
  assert.equal(convertCalls[0].sampleDepth, "16-bit");
  await page.getByText("Drop Complete").first().waitFor({ state: "visible" });

  const sourcePanel = page.getByTestId("panel-source");
  await sourcePanel.locator('button[title="Root"]').click();
  await page.getByTestId("tree-node-source-_Alpha").waitFor({ state: "visible" });
}
