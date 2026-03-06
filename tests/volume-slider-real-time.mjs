import assert from "node:assert/strict";
import { waitForPageCondition } from "./wait-utils.mjs";

/**
 * Asserts that volume slider works in real-time while playing, in both single and multi mode.
 * User can tap on a stack block and adjust volume without interrupting playback.
 */
export async function assertVolumeSliderRealTime(page) {
  // Close waveform if open from previous test so tree is clickable
  await page.evaluate(() => {
    const store = window.__octacardWaveformEditorStore;
    if (store?.getState?.()?.close) {
      store.getState().close();
    }
    const closeBtn = document.querySelector('[data-testid="audio-preview-close"]');
    if (closeBtn instanceof HTMLElement) closeBtn.click();
  }).catch(() => {});
  await page.waitForTimeout(500);

  // Enable multi mode
  const multiToggle = page.getByTestId("multi-mode-toggle");
  await multiToggle.waitFor({ state: "visible" });
  await multiToggle.click();
  await page.waitForTimeout(300);

  // Add first sample to stack (click adds to active slot)
  const firstFileNode = page.getByTestId("tree-node-source-_Alpha_inside-alpha_wav");
  await firstFileNode.waitFor({ state: "visible" });
  await firstFileNode.click();
  await page.waitForTimeout(500);

  // Add second sample to stack (click "Next sample" to focus next slot, then click file)
  await page.getByText("Next sample", { exact: true }).first().click();
  await page.waitForTimeout(200);
  const secondFileNode = page.getByTestId("tree-node-source-_Alpha_Mel__wav");
  await secondFileNode.waitFor({ state: "visible" });
  await secondFileNode.click();
  await page.waitForTimeout(500);

  // Wait for samples to load
  await waitForPageCondition(
    page,
    `document.querySelectorAll('[data-testid^="volume-slider-"]').length >= 2`,
    { timeout: 5000 },
  );

  // Start playback - find play button in the transport block
  // The play button is in the MultiSampleStack component
  await page.waitForTimeout(500); // Wait for stack to render
  const playButton = page.locator('button[aria-label="Play"], button[aria-label="Pause"]').first();
  await playButton.waitFor({ state: "visible" });
  await playButton.click();
  await page.waitForTimeout(500);

  // Verify playback is active
  const isPlaying = await page.evaluate(() => {
    return window.__octacardPlayerStore?.getState?.()?.isPlaying ?? false;
  });
  assert.ok(isPlaying, "Playback should be active");

  // Get initial volume from store
  const initialVolume = await page.evaluate(() => {
    const store = window.__octacardPlayerStore?.getState?.();
    const multiStore = window.__octacardMultiSampleStore?.getState?.();
    if (!multiStore?.stack || multiStore.stack.length === 0) return null;
    return multiStore.stack[0]?.volume ?? 1;
  });
  assert.equal(initialVolume, 1, "Initial volume should be 1");

  // Adjust volume slider for first block (index 0)
  const volumeSlider0 = page.getByTestId("volume-slider-0");
  await volumeSlider0.waitFor({ state: "visible" });

  // Click on the slider track at 30% position to set volume to ~0.3
  const sliderBounds = await volumeSlider0.boundingBox();
  if (!sliderBounds) {
    throw new Error("Slider bounds not found");
  }
  const targetX = sliderBounds.x + sliderBounds.width * 0.3;
  const targetY = sliderBounds.y + sliderBounds.height / 2;
  await page.mouse.click(targetX, targetY);
  await page.waitForTimeout(300);

  // Verify volume changed in store
  const newVolume = await page.evaluate(() => {
    const multiStore = window.__octacardMultiSampleStore?.getState?.();
    if (!multiStore?.stack || multiStore.stack.length === 0) return null;
    return multiStore.stack[0]?.volume ?? 1;
  });

  assert.ok(newVolume !== null, "Volume should be set");
  assert.ok(newVolume < 1, `Volume should be reduced (got ${newVolume})`);
  assert.ok(newVolume > 0, `Volume should be greater than 0 (got ${newVolume})`);

  // Verify playback is still active (not interrupted)
  const stillPlaying = await page.evaluate(() => {
    return window.__octacardPlayerStore?.getState?.()?.isPlaying ?? false;
  });
  assert.ok(stillPlaying, "Playback should still be active after volume change");

  // Test single mode volume slider
  // Stop playback
  const stopButton = page.locator('button[aria-label="Stop"]').first();
  await stopButton.waitFor({ state: "visible" });
  await stopButton.click();
  await page.waitForTimeout(300);

  // Switch to single mode
  await multiToggle.click();
  await page.waitForTimeout(300);

  // Load a sample in waveform editor
  await firstFileNode.click();
  await page.waitForTimeout(500);

  // Wait for waveform editor to open
  const waveformEditor = page.getByTestId("audio-preview-source");
  await waveformEditor.waitFor({ state: "visible" });
  await page.waitForTimeout(500);

  // Start playback in single mode
  await page.keyboard.press("Space");
  await page.waitForTimeout(500);

  // Verify playback is active
  const singleIsPlaying = await page.evaluate(() => {
    return window.__octacardPlayerStore?.getState?.()?.isPlaying ?? false;
  });
  assert.ok(singleIsPlaying, "Single mode playback should be active");

  // Find volume slider in waveform editor (it's in the transport bar)
  // The volume slider is near the Volume2 icon
  const volumeIcon = page.locator('[data-testid="audio-preview-source"]').locator('svg').filter({ hasText: /volume/i }).first();
  await volumeIcon.waitFor({ state: "visible" }).catch(() => {});
  
  // Try to find slider near volume icon
  const waveformVolumeSlider = page.locator('[data-testid="audio-preview-source"]').locator('[role="slider"]').last();
  const waveformSliderExists = await waveformVolumeSlider.count() > 0;
  
  if (waveformSliderExists) {
    const waveformSliderBounds = await waveformVolumeSlider.boundingBox();
    if (waveformSliderBounds) {
      const waveformTargetX = waveformSliderBounds.x + waveformSliderBounds.width * 0.5;
      const waveformTargetY = waveformSliderBounds.y + waveformSliderBounds.height / 2;
      await page.mouse.click(waveformTargetX, waveformTargetY);
      await page.waitForTimeout(500);

      // Verify playback is still active
      const singleStillPlaying = await page.evaluate(() => {
        return window.__octacardPlayerStore?.getState?.()?.isPlaying ?? false;
      });
      assert.ok(singleStillPlaying, "Single mode playback should still be active after volume change");
    }
  }

  // Stop playback
  await page.keyboard.press("Space");
  await page.waitForTimeout(200);
}
