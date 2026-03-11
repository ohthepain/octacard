import assert from "node:assert/strict";
import { waitForPageCondition } from "./wait-utils.mjs";

/**
 * Asserts that WAV and AIFF files load successfully in the waveform preview.
 * Uses the Fixtures folder which contains TVD_120_resampled_break_tape_vinyl_bear.wav
 * and KJ_SAWKA_Drum_and_Bass_170_bpm_4bar14.aif (mock minimal valid files).
 */
export async function assertAudioLoadAiffAndWav(page) {
  // Navigate to root then open Fixtures folder
  await page.getByTestId("breadcrumb-root-source").click({ force: true });
  const fixturesNode = page.getByTestId("tree-node-source-_Fixtures");
  await fixturesNode.waitFor({ state: "visible" });
  await fixturesNode.scrollIntoViewIfNeeded();
  await fixturesNode.evaluate((el) => el.click());

  // Wait for files to appear
  const wavFileNode = page.getByTestId("tree-node-source-_Fixtures_TVD_120_resampled_break_tape_vinyl_bear_wav");
  const aifFileNode = page.getByTestId("tree-node-source-_Fixtures_KJ_SAWKA_Drum_and_Bass_170_bpm_4bar14_aif");
  await wavFileNode.waitFor({ state: "visible", timeout: 10000 });
  await aifFileNode.waitFor({ state: "visible", timeout: 10000 });

  // Load WAV file first (use evaluate to avoid overlay interception)
  await wavFileNode.evaluate((el) => el.click());
  const preview = page.getByTestId("audio-preview-source");
  await preview.waitFor({ state: "visible" });
  await page.getByTestId("sample-range-overlay").waitFor({ state: "visible", timeout: 8000 });
  await waitForPageCondition(
    page,
    `document.querySelector('[data-testid="audio-preview-filename"]')?.textContent?.trim() === "TVD_120_resampled_break_tape_vinyl_bear.wav"`,
    { timeout: 5000 },
  );
  // Load AIFF file (tests ensureAudioDecodable + FFmpeg conversion)
  await aifFileNode.evaluate((el) => el.click());
  await waitForPageCondition(
    page,
    `document.querySelector('[data-testid="audio-preview-filename"]')?.textContent?.trim() === "KJ_SAWKA_Drum_and_Bass_170_bpm_4bar14.aif"`,
    { timeout: 15000 },
  );
  await page.getByTestId("sample-range-overlay").waitFor({ state: "visible", timeout: 8000 });
  const hasError = await page.locator('.text-destructive').isVisible().catch(() => false);
  assert.ok(!hasError, "AIFF file should load without showing error message.");
}
