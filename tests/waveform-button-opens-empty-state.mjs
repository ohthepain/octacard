import assert from "node:assert/strict";

/**
 * Waveform button on header opens waveform editor in empty state.
 * Empty state shows "Waveform Editor" as the filename and has no loaded file.
 */
export async function assertWaveformButtonOpensEmptyState(page) {
  const waveformButton = page.getByTestId("waveform-editor-button");
  await waveformButton.waitFor({ state: "visible" });
  await waveformButton.click();

  // Waveform editor (AudioPreview) should open - empty state uses paneType null
  const audioPreview = page.getByTestId("audio-preview-null");
  await audioPreview.waitFor({ state: "visible" });

  // Empty state shows "Waveform Editor" as the filename label
  const filenameLabel = page.getByTestId("audio-preview-filename");
  await filenameLabel.waitFor({ state: "visible" });
  const filenameText = await filenameLabel.textContent();
  assert.equal(
    filenameText?.trim(),
    "Waveform Editor",
    "Expected empty state to show 'Waveform Editor' as filename.",
  );

  // Close button should be visible
  const closeButton = page.getByTestId("audio-preview-close");
  await closeButton.waitFor({ state: "visible" });
  await closeButton.click();

  // Waveform editor should close
  await audioPreview.waitFor({ state: "hidden" });
}
