import assert from "node:assert/strict";

export async function assertWaveformTimeModeToggle(page) {
  const modeTrigger = page.getByTestId("audio-preview-time-mode");
  await modeTrigger.waitFor({ state: "visible" });

  await modeTrigger.click();
  await page.getByRole("option", { name: "Bars/Beats" }).click();

  const currentTime = page.getByTestId("audio-preview-current-time");
  await currentTime.waitFor({ state: "visible" });
  const barsText = ((await currentTime.textContent()) ?? "").trim();
  assert.match(barsText, /^\d+\.\d+\.\d{2}$/, "Expected bars/beats/16ths display in Bars/Beats mode.");

  await modeTrigger.click();
  await page.getByRole("option", { name: "Clock" }).click();

  const clockText = ((await currentTime.textContent()) ?? "").trim();
  assert.match(clockText, /^\d+:\d{2}$/, "Expected clock display in Clock mode.");
}
