import assert from "node:assert/strict";
import { waitForPageCondition } from "./wait-utils.mjs";

export async function assertWaveformRendersStereoChannels(page) {
  await page.getByTestId("breadcrumb-root-source").click();
  const fixturesNode = page.getByTestId("tree-node-source-_Fixtures");
  await fixturesNode.waitFor({ state: "visible" });
  await fixturesNode.click();

  const wavFileNode = page.getByTestId("tree-node-source-_Fixtures_TVD_120_resampled_break_tape_vinyl_bear_wav");
  await wavFileNode.waitFor({ state: "visible" });
  await wavFileNode.click();

  const preview = page.getByTestId("audio-preview-source");
  await preview.waitFor({ state: "visible" });
  await page.getByTestId("sample-range-overlay").waitFor({ state: "visible", timeout: 8000 });

  await waitForPageCondition(
    page,
    `
      (() => {
        const container = document.querySelector('[data-testid="audio-preview-waveform"]');
        if (!(container instanceof HTMLElement)) return false;
        const waveSurferHost = container.firstElementChild;
        const root = waveSurferHost?.shadowRoot;
        if (!root) return false;
        const channels = root.querySelectorAll('.canvases > div').length;
        return channels === 2;
      })()
    `,
    { timeout: 8000 },
  );

  const renderedChannels = await page.evaluate(`
    (() => {
      const container = document.querySelector('[data-testid="audio-preview-waveform"]');
      const waveSurferHost = container?.firstElementChild;
      const root = waveSurferHost?.shadowRoot;
      return root?.querySelectorAll('.canvases > div').length ?? 0;
    })()
  `);
  assert.equal(renderedChannels, 2, `Expected stereo file to render 2 channels, got ${renderedChannels}.`);
}
