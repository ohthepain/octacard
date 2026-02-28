import assert from "node:assert/strict";

export async function assertBraveBrowserSupport(browser, { baseUrl }) {
  const braveContext = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.7632.109 Safari/537.36 Brave/1.87.190",
  });
  const bravePage = await braveContext.newPage();
  bravePage.setDefaultTimeout(15000);

  try {
    await bravePage.goto(baseUrl, { waitUntil: "networkidle" });
    await bravePage.getByRole("heading", { name: "OctaCard" }).waitFor({ state: "visible" });
    const unsupportedHeadingVisible = await bravePage
      .getByRole("heading", { name: "Browser Not Supported" })
      .isVisible()
      .catch(() => false);
    assert.equal(
      unsupportedHeadingVisible,
      false,
      "Brave should not be blocked by the browser support gate.",
    );
  } finally {
    await braveContext.close();
  }
}
