import assert from "node:assert/strict";

export async function assertWaveformPreviewDockedAtBottom(page) {
  const sourcePanel = page.getByTestId("panel-source");
  const fileNode = page.getByTestId("tree-node-source-_Alpha_inside-alpha_wav");
  const preview = page.getByTestId("audio-preview-source");
  const treeScroll = page.getByTestId("file-tree-scroll-source");

  await sourcePanel.waitFor({ state: "visible" });
  await fileNode.waitFor({ state: "visible" });
  await fileNode.click();
  await preview.waitFor({ state: "visible" });
  await treeScroll.waitFor({ state: "visible" });

  const sourcePanelBox = await sourcePanel.boundingBox();
  const previewBox = await preview.boundingBox();
  const treeScrollBox = await treeScroll.boundingBox();
  assert.ok(sourcePanelBox, "Expected source panel to have a visible bounding box.");
  assert.ok(previewBox, "Expected audio preview to have a visible bounding box.");
  assert.ok(treeScrollBox, "Expected file tree scroll area to have a visible bounding box.");

  const panelBottom = sourcePanelBox.y + sourcePanelBox.height;
  const previewBottom = previewBox.y + previewBox.height;
  const bottomDelta = Math.abs(panelBottom - previewBottom);
  assert.ok(
    bottomDelta <= 2,
    `Expected preview to be docked at panel bottom. panelBottom=${panelBottom}, previewBottom=${previewBottom}`,
  );

  assert.ok(
    previewBox.x >= sourcePanelBox.x - 1,
    `Expected preview to align to panel left edge. panelLeft=${sourcePanelBox.x}, previewLeft=${previewBox.x}`,
  );
  assert.ok(
    previewBox.x + previewBox.width <= sourcePanelBox.x + sourcePanelBox.width + 1,
    `Expected preview to fit panel width. panelRight=${sourcePanelBox.x + sourcePanelBox.width}, previewRight=${previewBox.x + previewBox.width}`,
  );
  assert.ok(
    previewBox.y >= treeScrollBox.y + 20,
    `Expected preview below file tree region. treeTop=${treeScrollBox.y}, previewTop=${previewBox.y}`,
  );
}
