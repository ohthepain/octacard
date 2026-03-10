import assert from "node:assert/strict";
import { waitForAriaPressed } from "./wait-utils.mjs";

async function ensureMultiMode(page) {
  const toggle = page.getByTestId("multi-mode-toggle");
  await toggle.waitFor({ state: "visible" });
  if ((await toggle.getAttribute("aria-pressed")) !== "true") {
    await toggle.click();
    await waitForAriaPressed(toggle, "true");
  }
}

async function browsePaneRoot(page, pane) {
  await page.evaluate((paneName) => {
    const panel = document.querySelector(`[data-testid="panel-${paneName}"]`);
    if (!(panel instanceof HTMLElement)) throw new Error(`Panel not found: ${paneName}`);
    const browseButton = panel.querySelector('button[title="Browse for folder to navigate to"]');
    const selectFolder = panel.querySelector(`[data-testid="select-folder-${paneName}"]`);
    if (browseButton instanceof HTMLElement) browseButton.click();
    else if (selectFolder instanceof HTMLElement) selectFolder.click();
    else throw new Error(`Browse button not found: ${paneName}`);
  }, pane);
}

export async function assertMultiStackRecoversAfterFolderSelection(page) {
  await ensureMultiMode(page);

  await browsePaneRoot(page, "source");
  await page.getByTestId("tree-node-source-_Alpha").waitFor({ state: "visible" });
  await browsePaneRoot(page, "dest");
  await page.getByTestId("tree-node-dest-_Beta").waitFor({ state: "visible" });

  const bulkNode = page.getByTestId("tree-node-source-_Bulk");
  await bulkNode.waitFor({ state: "visible" });
  await bulkNode.click();
  const bulkFileNode = page.getByTestId("tree-node-source-_Bulk_bulk-1_wav");
  await bulkFileNode.waitFor({ state: "visible" });
  await bulkFileNode.click();

  const removeButtons = page.getByLabel("Remove from stack");
  await removeButtons.first().waitFor({ state: "visible" });
  assert.equal(await removeButtons.count(), 1, "Expected one stack sample before reload.");

  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "OctaCard" }).waitFor({ state: "visible" });
  await ensureMultiMode(page);

  await removeButtons.first().waitFor({ state: "visible" });
  const rootError = page.getByText(/No root directory handle set/).first();
  await rootError.waitFor({ state: "visible" });

  await browsePaneRoot(page, "source");
  await page.getByTestId("tree-node-source-_Alpha").waitFor({ state: "visible" });

  await page.waitForFunction(() => {
    return !Array.from(document.querySelectorAll(".text-destructive")).some((el) =>
      (el.textContent || "").includes("No root directory handle set"),
    );
  });

  assert.equal(
    await page.getByText(/No root directory handle set/).count(),
    0,
    "Expected stack root-handle error to clear after reselecting a folder.",
  );
}
