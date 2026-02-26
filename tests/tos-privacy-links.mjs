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
  assert.equal(termsHref, "/terms-of-service.html", "Terms link should point to static terms page.");
  assert.equal(privacyHref, "/privacy-policy.html", "Privacy link should point to static privacy page.");

  const termsResponse = await page.request.get(new URL(termsHref, baseUrl).toString());
  const termsBody = await termsResponse.text();
  assert.equal(termsResponse.ok(), true, "Terms page should return HTTP 200.");
  assert.match(termsBody, /<h1>Terms of Service<\/h1>/, "Terms page should include heading.");
  assert.match(termsBody, /spamming the GitHub Issues section/, "Terms page should prohibit issue spam.");

  const privacyResponse = await page.request.get(new URL(privacyHref, baseUrl).toString());
  const privacyBody = await privacyResponse.text();
  assert.equal(privacyResponse.ok(), true, "Privacy page should return HTTP 200.");
  assert.match(privacyBody, /<h1>Privacy Policy<\/h1>/, "Privacy page should include heading.");
  assert.match(privacyBody, /do not store your personal files or account data/, "Privacy page should state no storage.");

  await aboutDialog.getByRole("button", { name: "Close" }).click();
  await aboutDialog.waitFor({ state: "hidden" });
}
