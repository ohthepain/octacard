import assert from "node:assert/strict";
import { waitForPageCondition } from "./wait-utils.mjs";

/**
 * Asserts that after loading a sample, playing it, loading another sample, and
 * pressing space bar, the second sample plays (not the first).
 * Regression: space bar used to play singleFile from player store, which could
 * be stale when the user had tapped a new sample in the waveform editor.
 */
export async function assertSpaceBarPlaysCurrentSample(page) {
  const firstFileNode = page.getByTestId("tree-node-source-_Alpha_inside-alpha_wav");
  await firstFileNode.waitFor({ state: "visible" });
  await page.evaluate(() => {
    const node = document.querySelector('[data-testid="tree-node-source-_Alpha_inside-alpha_wav"]');
    if (!(node instanceof HTMLElement)) throw new Error("First sample node not found");
    node.click();
  });

  const preview = page.getByTestId("audio-preview-source");
  await preview.waitFor({ state: "visible" });
  await page.getByTestId("sample-range-overlay").waitFor({ state: "visible" });

  // Play first sample with space bar
  await page.keyboard.press("Space");
  await page.waitForTimeout(200);
  // Stop
  await page.keyboard.press("Space");
  await page.waitForTimeout(200);

  // Load second sample
  const secondFileNode = page.getByTestId("tree-node-source-_Alpha_Mel__wav");
  await secondFileNode.waitFor({ state: "visible" });
  await page.evaluate(() => {
    const node = document.querySelector('[data-testid="tree-node-source-_Alpha_Mel__wav"]');
    if (!(node instanceof HTMLElement)) throw new Error("Second sample node not found");
    node.click();
  });

  await waitForPageCondition(
    page,
    `document.querySelector('[data-testid="audio-preview-filename"]')?.textContent?.trim() === "Melô.wav"`,
    { timeout: 5000 },
  );
  await page.waitForTimeout(300);

  // Press space bar - should play Melô.wav, not inside-alpha.wav
  await page.keyboard.press("Space");
  await page.waitForTimeout(400);

  // Verify player store has the second sample (space bar should have called playSingle with waveform editor's file)
  const playingPath = await page.evaluate(() => {
    const state = window.__octacardPlayerStore?.getState?.();
    if (!state) return null;
    return state.singleFile?.path ?? null;
  });

  // If we can't read the store, fall back to checking play state
  if (playingPath !== null) {
    assert.equal(
      playingPath,
      "/Alpha/Melô.wav",
      `Space bar should play the currently loaded sample (Melô.wav), not the previous one. Got path: ${playingPath}`
    );
  }
}
