import assert from "node:assert/strict";

const longFolderNodeTestId = "tree-node-source-_LongNames";
const longFileNodeTestId =
  "tree-node-source-_LongNames_this-is-an-extremely-long-sample-name-designed-to-overflow-the-dialog-display_wav";

export async function assertAudioPreviewFilenameTruncation(page) {
  const sourcePanel = page.getByTestId("panel-source");
  await sourcePanel.waitFor({ state: "visible" });

  await page.getByTestId(longFolderNodeTestId).click();
  const longFileNode = page.getByTestId(longFileNodeTestId);
  await longFileNode.waitFor({ state: "visible" });
  await longFileNode.click();

  const previewFileName = page.getByTestId("audio-preview-filename");
  await previewFileName.waitFor({ state: "visible" });

  const overflowMetrics = await sourcePanel.evaluate((panel) => ({
    clientWidth: panel.clientWidth,
    scrollWidth: panel.scrollWidth,
  }));
  assert.ok(
    overflowMetrics.scrollWidth <= overflowMetrics.clientWidth + 1,
    `Expected source panel to avoid horizontal overflow. scrollWidth=${overflowMetrics.scrollWidth}, clientWidth=${overflowMetrics.clientWidth}`,
  );

  const fileNameMetrics = await previewFileName.evaluate((element) => ({
    display: window.getComputedStyle(element).display,
    overflow: window.getComputedStyle(element).overflow,
    textOverflow: window.getComputedStyle(element).textOverflow,
    whiteSpace: window.getComputedStyle(element).whiteSpace,
  }));
  assert.ok(
    fileNameMetrics.display === "block" &&
      fileNameMetrics.overflow === "hidden" &&
      fileNameMetrics.textOverflow === "ellipsis" &&
      fileNameMetrics.whiteSpace === "nowrap",
    `Expected preview filename to use block ellipsis truncation. display=${fileNameMetrics.display}, overflow=${fileNameMetrics.overflow}, textOverflow=${fileNameMetrics.textOverflow}, whiteSpace=${fileNameMetrics.whiteSpace}`,
  );

  await page.getByTestId("audio-preview-close").click();
}
