#!/usr/bin/env node
/**
 * Generate a PDF from release notes and screenshots using Playwright.
 *
 * Usage:
 *   node scripts/generate-release-notes-pdf.mjs --notes releasenotes.txt --screenshots output/release-notes-screenshots/ --output ReleaseNotes<githash>.pdf
 *
 * Options:
 *   --notes       Path to releasenotes.txt (default: releasenotes.txt)
 *   --screenshots Path to folder of screenshots (default: output/release-notes-screenshots/)
 *   --output      Output PDF path (default: ReleaseNotes.pdf)
 *   --git-hash    Optional git hash for the title (default: from git rev-parse HEAD)
 */

import { chromium } from "playwright";
import { readFile, readdir, mkdir, writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    notes: "releasenotes.txt",
    screenshots: "output/release-notes-screenshots",
    output: "ReleaseNotes.pdf",
    gitHash: null,
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--notes" && args[i + 1]) opts.notes = args[++i];
    else if (args[i] === "--screenshots" && args[i + 1]) opts.screenshots = args[++i];
    else if (args[i] === "--output" && args[i + 1]) opts.output = args[++i];
    else if (args[i] === "--git-hash" && args[i + 1]) opts.gitHash = args[++i];
  }
  return opts;
}

function getGitHash() {
  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: projectRoot,
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
}

/**
 * Parse releasenotes.txt and return the latest section (date + bullets).
 */
function parseLatestSection(content) {
  const sections = content.split(/(?=^## \d{4}-\d{2}-\d{2})/m);
  const latest = sections
    .filter((s) => s.trim())
    .pop();
  if (!latest) return { date: null, bullets: [] };
  const match = latest.match(/^## (\d{4}-\d{2}-\d{2})\s*\n([\s\S]*)/);
  const date = match ? match[1] : null;
  const body = match ? match[2] : latest;
  const bullets = body
    .split("\n")
    .map((line) => line.replace(/^-\s*/, "").trim())
    .filter(Boolean);
  return { date, bullets };
}

/**
 * Get screenshot paths in alphabetical order (so they match bullet order when named consistently).
 */
async function getScreenshotPaths(dir) {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && /\.(png|jpg|jpeg|webp)$/i.test(e.name))
    .map((e) => path.join(dir, e.name))
    .sort();
  return files;
}

/**
 * Build HTML for the release notes PDF.
 * Images are passed as base64 data URLs to avoid file:// restrictions.
 */
function buildHtml(opts) {
  const { date, bullets } = opts.notesData;
  const screenshotDataUrls = opts.screenshotDataUrls || [];
  const gitHash = opts.gitHash;

  const title = `Release Notes${date ? ` — ${date}` : ""}${gitHash ? ` (${gitHash})` : ""}`;

  const bulletHtml = bullets
    .map((bullet, i) => {
      const dataUrl = screenshotDataUrls[i];
      const imgHtml = dataUrl
        ? `<figure><img src="${dataUrl}" alt="Screenshot" style="max-width:100%;height:auto;border:1px solid #ddd;border-radius:4px;" /></figure>`
        : "";
      return `<li>${escapeHtml(bullet)}${imgHtml}</li>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    @page { margin: 2cm; }
    body { font-family: system-ui, -apple-system, sans-serif; font-size: 12pt; line-height: 1.5; color: #333; }
    h1 { font-size: 18pt; margin-bottom: 1em; }
    ul { list-style: disc; padding-left: 1.5em; }
    li { margin-bottom: 0.75em; }
    figure { margin: 0.5em 0 1em 0; }
    img { max-width: 100%; height: auto; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <ul>
${bulletHtml}
  </ul>
</body>
</html>`;
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function main() {
  const opts = parseArgs();
  opts.gitHash = opts.gitHash ?? getGitHash();

  const notesPath = path.resolve(projectRoot, opts.notes);
  if (!existsSync(notesPath)) {
    console.error(`Notes file not found: ${notesPath}`);
    process.exit(1);
  }

  const notesContent = await readFile(notesPath, "utf8");
  opts.notesData = parseLatestSection(notesContent);

  const screenshotsDir = path.resolve(projectRoot, opts.screenshots);
  opts.screenshotPaths = await getScreenshotPaths(screenshotsDir);

  // Load screenshots as base64 data URLs for embedding in HTML
  opts.screenshotDataUrls = [];
  for (const p of opts.screenshotPaths) {
    const buf = await readFile(p);
    const ext = path.extname(p).toLowerCase();
    const mime = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/webp";
    opts.screenshotDataUrls.push(`data:${mime};base64,${buf.toString("base64")}`);
  }

  if (opts.notesData.bullets.length === 0) {
    console.error("No release note bullets found in the latest section.");
    process.exit(1);
  }

  const html = buildHtml(opts);
  const htmlPath = path.join(projectRoot, ".cursor", "release-notes-pdf-temp.html");
  await mkdir(path.dirname(htmlPath), { recursive: true });
  await writeFile(htmlPath, html, "utf8");

  const outputPath = path.resolve(projectRoot, opts.output);
  await mkdir(path.dirname(outputPath), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle" });
    await page.pdf({
      path: outputPath,
      format: "A4",
      printBackground: true,
      margin: { top: "2cm", right: "2cm", bottom: "2cm", left: "2cm" },
    });
  } finally {
    await browser.close();
  }

  await unlink(htmlPath).catch(() => {});

  console.log(`Generated: ${outputPath}`);
  console.log(`  Bullets: ${opts.notesData.bullets.length}`);
  console.log(`  Screenshots: ${opts.screenshotPaths.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
