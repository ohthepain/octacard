import assert from "node:assert/strict";

export async function assertBarsBeatsSupport(page) {
  const fileNode = page.getByTestId("tree-node-source-_Alpha_inside-alpha_wav");
  await fileNode.waitFor({ state: "visible" });
  await fileNode.click();

  const preview = page.getByTestId("audio-preview-source");
  await preview.waitFor({ state: "visible" });

  const filename = page.getByTestId("audio-preview-filename");
  await filename.waitFor({ state: "visible" });
  const text = (await filename.textContent())?.trim() || "";
  assert.equal(text, "inside-alpha.wav", "Expected waveform title without PREVIEW prefix.");

  const modeTrigger = page.getByTestId("audio-preview-time-mode");
  await modeTrigger.waitFor({ state: "visible" });
  await modeTrigger.click();
  await page.getByRole("option", { name: "Bars/Beats" }).click();

  const currentTime = page.getByTestId("audio-preview-current-time");
  let timeText = "";
  for (let i = 0; i < 10; i++) {
    timeText = (await currentTime.textContent())?.trim() || "";
    if (timeText.includes(".")) {
      break;
    }
    await page.waitForTimeout(100);
  }
  assert.ok(timeText.includes("."), "Expected bars/beats time display format.");
}
