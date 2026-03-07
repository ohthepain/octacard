import assert from "node:assert/strict";

export async function assertTermsAndPrivacyLinks(page, { baseUrl }) {
  await page.getByRole("button", { name: "About" }).click();
  const aboutDialog = page.getByRole("dialog").filter({ hasText: "Terms of Service" });
  await aboutDialog.waitFor({ state: "visible" });

  const termsLink = aboutDialog.getByRole("link", { name: "Terms of Service" });
  const privacyLink = aboutDialog.getByRole("link", { name: "Privacy Policy" });
  await termsLink.waitFor({ state: "visible" });
  await privacyLink.waitFor({ state: "visible" });

  const termsHref = await termsLink.getAttribute("href");
  const privacyHref = await privacyLink.getAttribute("href");
  assert.equal(termsHref, "/legal/terms", "Terms link should point to /legal/terms.");
  assert.equal(privacyHref, "/legal/privacy", "Privacy link should point to /legal/privacy.");

  // Navigate to terms page and verify content
  await termsLink.click();
  await page.waitForURL(/\/legal\/terms/);
  await page.getByRole("heading", { name: "Terms of Service" }).waitFor({ state: "visible" });
  assert.ok(
    await page.locator("text=Acceptance of Terms").isVisible(),
    "Terms page should include Acceptance of Terms section."
  );

  // Navigate to privacy page and verify content
  await page.goto(new URL(privacyHref, baseUrl).toString());
  await page.getByRole("heading", { name: "Privacy Policy" }).waitFor({ state: "visible" });
  assert.ok(
    await page.locator("text=Information We Collect").isVisible(),
    "Privacy page should include Information We Collect section."
  );
}
