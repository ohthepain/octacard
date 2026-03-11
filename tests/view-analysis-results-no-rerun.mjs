import assert from "node:assert/strict";

export async function assertViewAnalysisResultsDoesNotAutoRerun(page, { baseUrl }) {
  let analysisGetCount = 0;
  let analysisRetryPostCount = 0;

  await page.route("**/api/auth/**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "test-user",
          email: "test@example.com",
          name: "Test User",
        },
        session: {
          id: "test-session",
          userId: "test-user",
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
      }),
    });
  });

  await page.route(/\/api\/library\/samples\/[^/]+\/analysis$/, async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    analysisGetCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "mock-sample",
        analysisStatus: "READY",
        analysisError: null,
        durationMs: 6530,
        sampleRate: 44100,
        channels: 1,
        attributes: { bpm: 140.3, loudness: 131.95, energy: 1461.41 },
        taxonomy: [
          { attribute: "instrument_family", value: "keys", confidence: 0.97 },
          { attribute: "instrument_type", value: "piano", confidence: 0.96 },
        ],
        embeddings: [{ model: "clap", modelVersion: "v1", dimensions: 512 }],
      }),
    });
  });

  await page.route(/\/api\/library\/samples\/[^/]+\/analysis\/retry$/, async (route) => {
    if (route.request().method() === "POST") {
      analysisRetryPostCount += 1;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "OctaCard" }).waitFor({ state: "visible" });

  await page.evaluate(() => {
    const sourcePanel = document.querySelector('[data-testid="panel-source"]');
    if (!(sourcePanel instanceof HTMLElement)) throw new Error("Source panel not found");
    const browseButton = sourcePanel.querySelector('button[title="Browse for folder to navigate to"]');
    if (!(browseButton instanceof HTMLElement)) throw new Error("Source browse button not found");
    browseButton.click();
  });
  const alphaNode = page.getByTestId("tree-node-source-_Alpha");
  await alphaNode.waitFor({ state: "visible" });
  const alphaFileNode = page.getByTestId("tree-node-source-_Alpha_inside-alpha_wav");
  const fileVisible = await alphaFileNode.isVisible().catch(() => false);
  if (!fileVisible) {
    await alphaNode.click();
  }
  await page.getByTestId("tree-node-source-_Alpha_inside-alpha_wav").waitFor({ state: "visible" });

  const sourceFile = page.getByTestId("tree-node-source-_Alpha_inside-alpha_wav");
  await sourceFile.click({ button: "right" });
  const viewAnalysisResults = page.getByRole("menuitem", { name: "View analysis results" });
  await viewAnalysisResults.waitFor({ state: "visible" });
  await viewAnalysisResults.click();

  await page.getByRole("dialog").waitFor({ state: "visible" });
  await page.getByText("Analysis results").waitFor({ state: "visible" });
  await page.getByText("Duration:").waitFor({ state: "visible" });
  await page.getByText("keys").waitFor({ state: "visible" });
  await page.getByText("piano").waitFor({ state: "visible" });

  await page.waitForTimeout(750);

  assert.ok(analysisGetCount >= 1, "Expected at least one GET /analysis call when opening analysis results.");
  assert.equal(
    analysisRetryPostCount,
    0,
    "Opening 'View analysis results' should not trigger POST /analysis/retry automatically.",
  );

  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });

  await page.unroute("**/api/auth/**");
  await page.unroute(/\/api\/library\/samples\/[^/]+\/analysis$/);
  await page.unroute(/\/api\/library\/samples\/[^/]+\/analysis\/retry$/);
}
