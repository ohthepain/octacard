#!/usr/bin/env node
/**
 * Merges Vitest (unit) and Playwright (e2e) coverage reports into a single report.
 * Run after: pnpm run test:coverage && pnpm run test:e2e:coverage
 */
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

const unitCoveragePath = path.join(rootDir, "coverage", "unit", "coverage-final.json");
const e2eCoveragePath = path.join(rootDir, "coverage", "e2e", "coverage-final.json");
const mergedDir = path.join(rootDir, "coverage", "merged");

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const [unitExists, e2eExists] = await Promise.all([
    fileExists(unitCoveragePath),
    fileExists(e2eCoveragePath),
  ]);

  if (!unitExists && !e2eExists) {
    console.error("No coverage files found. Run test:coverage and test:e2e:coverage first.");
    process.exit(1);
  }

  await mkdir(mergedDir, { recursive: true });
  const outPath = path.join(mergedDir, "coverage-final.json");

  const inputs = [unitExists && unitCoveragePath, e2eExists && e2eCoveragePath].filter(Boolean);
  if (inputs.length === 1) {
    const content = await readFile(inputs[0], "utf-8");
    await writeFile(outPath, content);
  } else {
    execSync(
      `npx istanbul-merge --out "${outPath}" "${unitCoveragePath}" "${e2eCoveragePath}"`,
      { cwd: rootDir, stdio: "inherit" }
    );
  }

  const nycOutputDir = path.join(rootDir, ".nyc_output");
  await mkdir(nycOutputDir, { recursive: true });
  const mergedContent = await readFile(outPath, "utf-8");
  await writeFile(path.join(nycOutputDir, "out.json"), mergedContent);
  execSync("npx nyc report --report-dir=coverage/merged --reporter=html --reporter=text-summary", {
    cwd: rootDir,
    stdio: "inherit",
  });
  console.log(`\nMerged coverage report: coverage/merged/index.html`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
