#!/usr/bin/env node

/**
 * Simple script to generate favicon.ico from logo.png
 *
 * This script requires sharp to be installed:
 * pnpm add -D sharp
 *
 * Then run: node scripts/generate-favicon.js
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function generateFavicon() {
  try {
    const sharp = (await import("sharp")).default;

    const pngPath = path.join(__dirname, "../public/logo.png");
    const icoPath = path.join(__dirname, "../public/favicon.ico");

    // Generate ICO with multiple sizes (16x16, 32x32, 48x48)
    await sharp(pngPath).resize(32, 32).toFile(icoPath);

    console.log("✓ Generated favicon.ico from logo.png");
  } catch (error) {
    if (error.code === "MODULE_NOT_FOUND") {
      console.log("⚠ sharp is not installed. Install it with: pnpm add -D sharp");
      console.log("   Or use an online tool like https://realfavicongenerator.net/");
      console.log("   Or manually convert logo.png to favicon.ico");
    } else {
      console.error("Error generating favicon:", error);
    }
  }
}

generateFavicon();
