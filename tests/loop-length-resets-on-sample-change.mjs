import assert from "node:assert/strict";
import { waitForPageCondition } from "./wait-utils.mjs";

/**
 * Asserts that when the user loads a sample, changes the loop length, then loads
 * another sample, the second sample shows its default (full) loop length, not the
 * first sample's modified length. Regression test for persist-effect writing
 * stale loop values to the new file path.
 */
export async function assertLoopLengthResetsOnSampleChange(page) {
  const firstFileNode = page.getByTestId("tree-node-source-_Alpha_inside-alpha_wav");
  await firstFileNode.waitFor({ state: "visible" });
  await firstFileNode.click({ force: true });

  const preview = page.getByTestId("audio-preview-source");
  await preview.waitFor({ state: "visible" });
  await page.getByTestId("sample-range-overlay").waitFor({ state: "visible" });

  // Switch to bars mode so we see loop length in bars:beats:sixteenths
  const modeTrigger = page.getByTestId("audio-preview-time-mode");
  await modeTrigger.waitFor({ state: "visible" });
  await modeTrigger.click();
  const barsBeatsOption = page.getByRole("option", { name: "Bars/Beats" });
  await barsBeatsOption.click();
  await page.keyboard.press("Escape");
  await barsBeatsOption.waitFor({ state: "hidden" });

  // Wait for loop length controls to be visible
  const loopLengthBars = page.getByTestId("loop-length-bars");
  await loopLengthBars.waitFor({ state: "visible" });

  // Get initial (full) loop length
  const lengthFull = await getLoopLengthDisplay(page);
  assert.ok(lengthFull, "Expected initial loop length to be non-empty.");

  // Shorten loop length by pressing ArrowDown on the beats spinbutton
  const loopLengthBeats = page.getByTestId("loop-length-beats");
  await loopLengthBeats.focus();
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(50);
  }
  const lengthShortened = await getLoopLengthDisplay(page);
  assert.ok(lengthShortened !== lengthFull, "Expected loop length to change after ArrowDown.");

  // Load second sample (Melô.wav in same folder)
  await page.keyboard.press("Escape");
  const secondFileNode = page.getByTestId("tree-node-source-_Alpha_Mel__wav");
  await secondFileNode.waitFor({ state: "visible" });
  await secondFileNode.scrollIntoViewIfNeeded();
  await secondFileNode.evaluate((el) => el.click());

  // Wait for waveform to load for the new file (filename changes)
  await page.getByTestId("audio-preview-filename").waitFor({ state: "visible" });
  await waitForPageCondition(
    page,
    `(() => {
      const text = document.querySelector('[data-testid="audio-preview-filename"]')?.textContent?.trim() ?? "";
      return text.includes("Mel") && text.toLowerCase().endsWith(".wav");
    })()`,
    { timeout: 15000 },
  );

  // Wait for loop length to stabilize
  await page.waitForTimeout(300);

  const lengthAfterSecondFile = await getLoopLengthDisplay(page);
  assert.ok(
    lengthAfterSecondFile !== lengthShortened,
    `Loop length should reset when loading another sample. Expected full length, got shortened value: "${lengthAfterSecondFile}" (same as first sample's shortened "${lengthShortened}").`,
  );
  assert.equal(
    lengthAfterSecondFile,
    lengthFull,
    `Second sample should show default (full) loop length "${lengthFull}", not "${lengthAfterSecondFile}".`,
  );

  await page.keyboard.press("Escape");
}

async function getLoopLengthDisplay(page) {
  const bars = await page.getByTestId("loop-length-bars").textContent();
  const beats = await page.getByTestId("loop-length-beats").textContent();
  const sixteenths = await page.getByTestId("loop-length-sixteenths").textContent();
  return `${(bars ?? "").trim()}:${(beats ?? "").trim()}:${(sixteenths ?? "").trim()}`;
}
