import assert from "node:assert/strict";

/**
 * Export button in waveform editor empty state prompts for a filename.
 * The "Export As" dialog should appear with a filename input (default "recording.wav").
 */
export async function assertExportPromptsFilenameInEmptyState(page) {
  // Open waveform editor in empty state via header button
  const waveformButton = page.getByTestId("waveform-editor-button");
  await waveformButton.waitFor({ state: "visible" });
  await waveformButton.click();

  const audioPreview = page.getByTestId("audio-preview-null");
  await audioPreview.waitFor({ state: "visible" });

  // Click Export - in empty state this should open the filename prompt
  const exportButton = page.getByTestId("audio-preview-export-button");
  await exportButton.waitFor({ state: "visible" });
  await exportButton.click();

  // "Export As" dialog should appear
  const exportDialog = page.getByRole("dialog", { name: "Export As" });
  await exportDialog.waitFor({ state: "visible" });

  // Filename input should exist and have default value
  const filenameInput = page.locator("#export-filename");
  await filenameInput.waitFor({ state: "visible" });
  const inputValue = await filenameInput.inputValue();
  assert.equal(inputValue, "recording.wav", "Expected default export filename to be recording.wav.");

  // Cancel to close without exporting (no recorded audio anyway)
  await page.getByRole("button", { name: "Cancel" }).click();
  await exportDialog.waitFor({ state: "hidden" });

  // Close waveform editor
  await page.getByTestId("audio-preview-close").click();
  await audioPreview.waitFor({ state: "hidden" });
}
