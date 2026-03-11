import { chromium } from "playwright";
import { testInitScript } from "./init-test.mjs";
import { assertViewAnalysisResultsDoesNotAutoRerun } from "../../tests/view-analysis-results-no-rerun.mjs";

const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const headless = process.env.PW_HEADLESS !== "false";

const browser = await chromium.launch({ headless });
const page = await browser.newPage();
page.setDefaultTimeout(15000);

try {
  await page.addInitScript(testInitScript);
  await assertViewAnalysisResultsDoesNotAutoRerun(page, { baseUrl });
} finally {
  await browser.close();
}
