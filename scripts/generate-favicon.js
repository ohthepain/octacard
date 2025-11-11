#!/usr/bin/env node

/**
 * Simple script to generate favicon.ico from favicon.svg
 *
 * This script requires sharp to be installed:
 * npm install --save-dev sharp
 *
 * Then run: node scripts/generate-favicon.js
 */

const fs = require("fs");
const path = require("path");

async function generateFavicon() {
  try {
    // Try to use sharp if available
    const sharp = require("sharp");

    const svgPath = path.join(__dirname, "../public/favicon.svg");
    const icoPath = path.join(__dirname, "../public/favicon.ico");

    // Read SVG
    const svgBuffer = fs.readFileSync(svgPath);

    // Generate ICO with multiple sizes (16x16, 32x32, 48x48)
    await sharp(svgBuffer).resize(32, 32).toFile(icoPath);

    console.log("✓ Generated favicon.ico from favicon.svg");
  } catch (error) {
    if (error.code === "MODULE_NOT_FOUND") {
      console.log("⚠ sharp is not installed. Install it with: npm install --save-dev sharp");
      console.log("   Or use an online tool like https://realfavicongenerator.net/");
      console.log("   Or manually convert favicon.svg to favicon.ico");
    } else {
      console.error("Error generating favicon:", error);
    }
  }
}

generateFavicon();
