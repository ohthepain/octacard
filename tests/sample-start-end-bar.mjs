import assert from "node:assert/strict";

async function getHandlePercent(page, testId) {
  return page.getByTestId(testId).evaluate((element) => {
    const value = (element instanceof HTMLElement ? element.style.left : "") || "0";
    return Number.parseFloat(value);
  });
}

async function dragHandle(page, testId, deltaX) {
  const handle = page.getByTestId(testId);
  await handle.waitFor({ state: "visible" });
  await handle.evaluate((element, dragByX) => {
    if (!(element instanceof HTMLElement)) throw new Error("Handle element not found.");
    const rect = element.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;
    element.dispatchEvent(
      new MouseEvent("mousedown", {
        clientX: startX,
        clientY: startY,
        button: 0,
        buttons: 1,
        bubbles: true,
        cancelable: true,
      }),
    );
    window.dispatchEvent(
      new MouseEvent("mousemove", {
        clientX: startX + dragByX,
        clientY: startY,
        button: 0,
        buttons: 1,
        bubbles: true,
        cancelable: true,
      }),
    );
    window.dispatchEvent(
      new MouseEvent("mouseup", {
        clientX: startX + dragByX,
        clientY: startY,
        button: 0,
        buttons: 0,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, deltaX);
}

export async function assertSampleStartEndBar(page) {
  const fileNode = page.getByTestId("tree-node-source-_Alpha_inside-alpha_wav");
  await fileNode.waitFor({ state: "visible" });
  await fileNode.click();

  const preview = page.getByTestId("audio-preview-source");
  await preview.waitFor({ state: "visible" });
  await page.getByTestId("sample-range-overlay").waitFor({ state: "visible" });
  await page.getByTestId("sample-range-bar").waitFor({ state: "visible" });

  const startInitial = await getHandlePercent(page, "sample-range-start-handle");
  const endInitial = await getHandlePercent(page, "sample-range-end-handle");
  const playInitial = await getHandlePercent(page, "sample-range-play-start-handle");

  assert.ok(startInitial <= 1, `Expected sample start to default near file start, got ${startInitial}.`);
  assert.ok(endInitial >= 99, `Expected sample end to default near file end, got ${endInitial}.`);
  assert.ok(playInitial <= 1, `Expected play start to default near file start, got ${playInitial}.`);

  await dragHandle(page, "sample-range-start-handle", 120);
  const startAfterDrag = await getHandlePercent(page, "sample-range-start-handle");
  assert.ok(startAfterDrag > startInitial + 5, "Expected sample start handle to move right.");

  await dragHandle(page, "sample-range-end-handle", -120);
  const endAfterDrag = await getHandlePercent(page, "sample-range-end-handle");
  assert.ok(endAfterDrag < endInitial - 5, "Expected sample end handle to move left.");
  assert.ok(endAfterDrag > startAfterDrag, "Expected sample end to remain after sample start.");

  await dragHandle(page, "sample-range-play-start-handle", 80);
  const playAfterDrag = await getHandlePercent(page, "sample-range-play-start-handle");
  assert.ok(playAfterDrag > playInitial + 5, "Expected play start handle to move right.");
  assert.ok(playAfterDrag >= startAfterDrag, "Expected play start to stay within range start.");
  assert.ok(playAfterDrag <= endAfterDrag, "Expected play start to stay within range end.");
}
